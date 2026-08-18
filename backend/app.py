from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import bcrypt
from datetime import datetime, timedelta
import json
import os
from dotenv import load_dotenv

# Import from groww_data
from groww_data import (
    get_live_price,
    fetch_stock_quote,
    get_historical_data,
    search_stocks,
    get_index_data,
    get_all_indices_detailed_table,
    get_stock_info,
    INDIAN_STOCKS,
    get_all_stocks,
    get_prices
)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this-in-production'
CORS(app, supports_credentials=True)

# Configure SQLite database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trading.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db = SQLAlchemy(app)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)

# ============================================
# ============================================
# DATABASE MODELS
# ============================================

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    password_hash = db.Column(db.String(200), nullable=False)
    mpin_hash = db.Column(db.String(200), nullable=True)
    is_verified = db.Column(db.Boolean, default=False)
    demo_balance = db.Column(db.Float, default=100000.0)
    watchlist = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def set_mpin(self, mpin):
        salt = bcrypt.gensalt()
        self.mpin_hash = bcrypt.hashpw(str(mpin).encode('utf-8'), salt).decode('utf-8')

    def check_mpin(self, mpin):
        if not self.mpin_hash:
            return False
        return bcrypt.checkpw(str(mpin).encode('utf-8'), self.mpin_hash.encode('utf-8'))
    
    def get_watchlist(self):
        return json.loads(self.watchlist) if self.watchlist else []
    
    def set_watchlist(self, stocks):
        self.watchlist = json.dumps(stocks)

class OTPRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    identifier = db.Column(db.String(120), nullable=False)
    otp_code = db.Column(db.String(10), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_used = db.Column(db.Boolean, default=False)

class Trade(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    symbol = db.Column(db.String(20), nullable=False)
    trade_type = db.Column(db.String(10), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    trade_date = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='OPEN')
    pnl = db.Column(db.Float, default=0.0)

# ============================================
# HELPER FUNCTIONS
# ============================================

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

import random

# ============================================
# SECURE AUTH & MPIN / OTP ROUTES
# ============================================

@app.route('/api/me', methods=['GET'])
def get_current_user_info():
    if current_user.is_authenticated:
        return jsonify({
            'logged_in': True,
            'username': current_user.username,
            'email': current_user.email,
            'balance': current_user.demo_balance,
            'has_mpin': bool(current_user.mpin_hash)
        })
    return jsonify({'logged_in': False})

@app.route('/api/auth/register-step1', methods=['POST'])
def register_step1():
    """Step 1: Sign up with Name, Email/Phone, Password -> Generates 6-Digit OTP"""
    try:
        data = request.get_json() or {}
        username = data.get('username')
        email = data.get('email')
        phone = data.get('phone', '')
        password = data.get('password')

        if not username or not email or not password:
            return jsonify({'error': 'Full Name, Email, and Password are required'}), 400

        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400

        existing_user = User.query.filter((User.email == email) | (User.username == username)).first()
        if existing_user and existing_user.is_verified:
            return jsonify({'error': 'An account with this email/username already exists'}), 400

        if not existing_user:
            user = User(username=username, email=email, phone=phone, is_verified=False)
            user.set_password(password)
            db.session.add(user)
        else:
            existing_user.username = username
            existing_user.set_password(password)
            user = existing_user

        db.session.commit()

        # Generate 6-Digit OTP Code
        otp_code = str(random.randint(100000, 999999))
        expires_at = datetime.utcnow() + timedelta(minutes=10)

        otp_rec = OTPRecord(identifier=email, otp_code=otp_code, expires_at=expires_at, is_used=False)
        db.session.add(otp_rec)
        db.session.commit()

        print(f"==================================================")
        print(f"🔒 [OTP GENERATED] Email: {email} | OTP: {otp_code}")
        print(f"==================================================")

        return jsonify({
            'success': True,
            'message': f'6-digit OTP code sent to {email}',
            'identifier': email,
            'demo_otp': otp_code # Returned for easy testing
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    """Step 2: Verify 6-digit OTP submission"""
    try:
        data = request.get_json() or {}
        identifier = data.get('identifier')
        otp_code = data.get('otp_code')

        if not identifier or not otp_code:
            return jsonify({'error': 'Identifier and OTP code required'}), 400

        otp_rec = OTPRecord.query.filter_by(
            identifier=identifier,
            otp_code=str(otp_code).strip(),
            is_used=False
        ).order_by(OTPRecord.id.desc()).first()

        if not otp_rec:
            return jsonify({'error': 'Invalid 6-digit OTP code'}), 400

        if datetime.utcnow() > otp_rec.expires_at:
            return jsonify({'error': 'OTP code has expired. Please request a new one.'}), 400

        otp_rec.is_used = True
        user = User.query.filter_by(email=identifier).first()
        if user:
            user.is_verified = True

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'OTP Verified successfully! Please set your 4-digit Security PIN.',
            'identifier': identifier
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/set-mpin', methods=['POST'])
def set_mpin():
    """Step 3: Set 4-Digit Security PIN (MPIN)"""
    try:
        data = request.get_json() or {}
        identifier = data.get('identifier')
        mpin = data.get('mpin')

        if not identifier or not mpin or len(str(mpin)) != 4 or not str(mpin).isdigit():
            return jsonify({'error': 'A valid 4-digit numeric PIN is required'}), 400

        user = User.query.filter_by(email=identifier).first()
        if not user:
            return jsonify({'error': 'User account not found'}), 404

        user.set_mpin(mpin)
        user.is_verified = True
        db.session.commit()

        login_user(user, remember=True)

        return jsonify({
            'success': True,
            'message': '4-Digit Security PIN created successfully! Welcome to Groww Terminal.',
            'user': user.username,
            'balance': user.demo_balance
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login-password', methods=['POST'])
def login_password():
    """Step 1 Login: Verify Email + Password -> Triggers 4-Digit PIN Unlock Screen"""
    try:
        data = request.get_json() or {}
        identifier = data.get('identifier')
        password = data.get('password')

        if not identifier or not password:
            return jsonify({'error': 'Email and Password are required'}), 400

        user = User.query.filter((User.email == identifier) | (User.username == identifier)).first()

        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password'}), 401

        has_pin = bool(user.mpin_hash)

        return jsonify({
            'success': True,
            'req_pin': has_pin,
            'identifier': user.email,
            'username': user.username,
            'message': 'Password verified! Enter 4-digit security PIN to unlock.' if has_pin else 'Login successful'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/verify-mpin', methods=['POST'])
def verify_mpin():
    """Unlock website with 4-Digit Security PIN (MPIN)"""
    try:
        data = request.get_json() or {}
        identifier = data.get('identifier')
        mpin = data.get('mpin')

        if not mpin or len(str(mpin)) != 4 or not str(mpin).isdigit():
            return jsonify({'error': 'Enter valid 4-digit PIN'}), 400

        user = None
        if identifier:
            user = User.query.filter((User.email == identifier) | (User.username == identifier)).first()
        elif session.get('_user_id'):
            try:
                user = User.query.get(int(session['_user_id']))
            except Exception:
                pass

        if not user:
            user = User.query.filter_by(username='DemoTrader').first() or User.query.first()

        if user and user.check_mpin(mpin):
            login_user(user, remember=True)
            return jsonify({
                'success': True,
                'unlocked': True,
                'user': user.username,
                'balance': user.demo_balance,
                'message': 'PIN Verified! Terminal Unlocked.'
            })

        return jsonify({'error': 'Incorrect 4-digit Security PIN'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/guest-login', methods=['POST'])
def guest_login():
    try:
        user = User.query.filter_by(username='DemoTrader').first()
        if not user:
            user = User(username='DemoTrader', email='demo@trader.com', is_verified=True)
            user.set_password('demo123')
            user.set_mpin('1470')
            db.session.add(user)
            db.session.commit()
        
        login_user(user, remember=True)
        return jsonify({
            'message': 'Logged in as Demo Trader',
            'user': user.username,
            'balance': user.demo_balance
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({'message': 'Logged out successfully'})

# ============================================
# STOCK DATA ROUTES
# ============================================

@app.route('/api/price/<symbol>', methods=['GET'])
def get_price(symbol):
    try:
        q = fetch_stock_quote(symbol)
        if q and q.get('price'):
            return jsonify({
                'symbol': symbol,
                'price': q['price'],
                'change': q.get('change', 0.0),
                'change_percent': q.get('change_percent', 0.0)
            })
        return jsonify({'error': 'Symbol not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/prices', methods=['POST'])
def get_prices_route():
    try:
        data = request.get_json() or {}
        symbols = data.get('symbols', [])
        quotes = get_prices(symbols)
        return jsonify(quotes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stock-info/<symbol>', methods=['GET'])
def stock_info(symbol):
    try:
        info = get_stock_info(symbol)
        if info:
            return jsonify(info)
        return jsonify({'error': 'Symbol not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search/<query>', methods=['GET'])
def search(query):
    try:
        results = search_stocks(query)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/index-data', methods=['GET'])
def get_indices():
    try:
        indices = get_index_data()
        return jsonify(indices)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/all-indices-table', methods=['GET'])
def get_all_indices_table_route():
    try:
        data = get_all_indices_detailed_table()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/all-stocks', methods=['GET'])
def get_all_stocks_route():
    try:
        stocks = get_all_stocks()
        return jsonify(stocks)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/historical/<symbol>', methods=['GET'])
def get_historical(symbol):
    try:
        period = request.args.get('period', '1d')
        interval = request.args.get('interval', '1m')
        
        candles = get_historical_data(symbol, period, interval)
        
        if not candles:
            return jsonify({'error': 'No data found'}), 404
        
        # Ensure candles are sorted strictly ascending by timestamp
        sorted_candles = sorted(candles, key=lambda x: x['time'])
        return jsonify(sorted_candles)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        return jsonify({'error': str(e)}), 500

@app.route('/api/prices', methods=['POST'])
def get_prices_bulk():
    try:
        data = request.get_json()
        symbols = data.get('symbols', [])
        prices = get_prices(symbols)
        return jsonify(prices)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# WATCHLIST ROUTES
# ============================================

@app.route('/api/watchlist', methods=['GET'])
@login_required
def get_watchlist():
    try:
        user = User.query.get(current_user.id)
        watchlist = user.get_watchlist()
        
        stocks = []
        for symbol in watchlist:
            price = get_live_price(symbol)
            if price:
                stocks.append({
                    'symbol': symbol,
                    'name': INDIAN_STOCKS.get(symbol, symbol),
                    'price': price
                })
        
        return jsonify(stocks)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/watchlist/add', methods=['POST'])
@login_required
def add_to_watchlist():
    try:
        data = request.get_json()
        symbol = data.get('symbol', '').upper()
        
        if symbol not in INDIAN_STOCKS:
            return jsonify({'error': 'Invalid symbol'}), 400
        
        user = User.query.get(current_user.id)
        watchlist = user.get_watchlist()
        
        if symbol in watchlist:
            return jsonify({'error': 'Already in watchlist'}), 400
        
        watchlist.append(symbol)
        user.set_watchlist(watchlist)
        db.session.commit()
        
        return jsonify({'message': f'{symbol} added to watchlist'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/watchlist/remove', methods=['POST'])
@login_required
def remove_from_watchlist():
    try:
        data = request.get_json()
        symbol = data.get('symbol', '').upper()
        
        user = User.query.get(current_user.id)
        watchlist = user.get_watchlist()
        
        if symbol in watchlist:
            watchlist.remove(symbol)
            user.set_watchlist(watchlist)
            db.session.commit()
            return jsonify({'message': f'{symbol} removed from watchlist'})
        
        return jsonify({'error': 'Symbol not in watchlist'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# TRADING ROUTES
# ============================================

@app.route('/api/buy', methods=['POST'])
@login_required
def buy_stock():
    try:
        data = request.get_json()
        symbol = data.get('symbol', '').upper()
        quantity = int(data.get('quantity', 0))
        
        if not symbol or quantity <= 0:
            return jsonify({'error': 'Invalid input'}), 400
        
        price = get_live_price(symbol)
        if not price:
            return jsonify({'error': 'Invalid symbol'}), 404
        
        total_cost = price * quantity
        user = User.query.get(current_user.id)
        
        if user.demo_balance < total_cost:
            return jsonify({'error': f'Insufficient balance! Need ₹{total_cost:.2f}'}), 400
        
        user.demo_balance -= total_cost
        trade = Trade(
            user_id=user.id,
            symbol=symbol,
            trade_type='BUY',
            quantity=quantity,
            price=price
        )
        
        db.session.add(trade)
        db.session.commit()
        
        return jsonify({
            'message': f'Bought {quantity} shares of {symbol} at ₹{price:.2f}',
            'balance': round(user.demo_balance, 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sell', methods=['POST'])
@login_required
def sell_stock():
    try:
        data = request.get_json()
        symbol = data.get('symbol', '').upper()
        quantity = int(data.get('quantity', 0))
        
        if not symbol or quantity <= 0:
            return jsonify({'error': 'Invalid input'}), 400
        
        open_trade = Trade.query.filter_by(
            user_id=current_user.id,
            symbol=symbol,
            status='OPEN'
        ).first()
        
        if not open_trade:
            return jsonify({'error': 'No position to sell'}), 400
        
        if open_trade.quantity < quantity:
            return jsonify({'error': 'Insufficient shares'}), 400
        
        price = get_live_price(symbol)
        if not price:
            return jsonify({'error': 'Invalid symbol'}), 404
        
        pnl = (price - open_trade.price) * quantity
        
        user = User.query.get(current_user.id)
        user.demo_balance += (price * quantity)
        
        open_trade.status = 'CLOSED'
        open_trade.pnl = pnl
        
        db.session.commit()
        
        return jsonify({
            'message': f'Sold {quantity} shares of {symbol} at ₹{price:.2f}',
            'pnl': round(pnl, 2),
            'balance': round(user.demo_balance, 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/portfolio', methods=['GET'])
@login_required
def get_portfolio():
    try:
        open_trades = Trade.query.filter_by(
            user_id=current_user.id,
            status='OPEN'
        ).all()
        
        portfolio = {}
        for trade in open_trades:
            if trade.symbol not in portfolio:
                portfolio[trade.symbol] = {
                    'quantity': 0,
                    'total_invested': 0
                }
            portfolio[trade.symbol]['quantity'] += trade.quantity
            portfolio[trade.symbol]['total_invested'] += (trade.price * trade.quantity)
        
        result = []
        total_value = 0
        total_pnl = 0
        total_invested = 0
        
        for symbol, data in portfolio.items():
            current_price = get_live_price(symbol)
            if current_price:
                current_value = current_price * data['quantity']
                pnl = current_value - data['total_invested']
                total_value += current_value
                total_pnl += pnl
                total_invested += data['total_invested']
                
                result.append({
                    'symbol': symbol,
                    'quantity': data['quantity'],
                    'avg_price': round(data['total_invested'] / data['quantity'], 2),
                    'current_price': current_price,
                    'current_value': round(current_value, 2),
                    'invested': round(data['total_invested'], 2),
                    'pnl': round(pnl, 2),
                    'pnl_percent': round((pnl / data['total_invested']) * 100, 2) if data['total_invested'] > 0 else 0
                })
        
        user = User.query.get(current_user.id)
        
        return jsonify({
            'portfolio': result,
            'total_value': round(total_value, 2),
            'total_pnl': round(total_pnl, 2),
            'total_invested': round(total_invested, 2),
            'balance': round(user.demo_balance, 2),
            'total_worth': round(total_value + user.demo_balance, 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recharge', methods=['POST'])
@login_required
def recharge():
    try:
        data = request.get_json()
        amount = float(data.get('amount', 0))
        
        if amount == 500:
            demo_credits = 50000
        elif amount == 1000:
            demo_credits = 110000
        elif amount == 5000:
            demo_credits = 600000
        else:
            demo_credits = amount * 100
        
        user = User.query.get(current_user.id)
        user.demo_balance += demo_credits
        db.session.commit()
        
        return jsonify({
            'message': f'Added ₹{demo_credits:,.2f} demo credits',
            'balance': round(user.demo_balance, 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# HEALTH CHECK
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Server is running'})

# ============================================
# CREATE DATABASE AND RUN
# ============================================

if __name__ == '__main__':
    import sys
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    with app.app_context():
        db.create_all()
        print("=" * 50)
        print("[SUCCESS] Database created successfully!")
        print("=" * 50)
    
    print("=" * 50)
    print("[SERVER] Starting Flask Server...")
    print("📍 http://127.0.0.1:5000")
    print("=" * 50)
    app.run(debug=True, port=5000, host='0.0.0.0')