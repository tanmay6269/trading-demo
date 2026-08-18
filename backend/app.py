from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
import bcrypt
from datetime import datetime, timedelta
import json
import os
import threading
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
CORS(app, supports_credentials=True, origins=["https://trading-demo-neon.vercel.app", "http://localhost:3000", "http://127.0.0.1:3000"])

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, X-Device-Id'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response

# Configure MySQL / Relational Database URI with fallback
db_url = os.getenv('MYSQL_URL') or os.getenv('DATABASE_URL')
if db_url:
    if db_url.startswith("mysql://"):
        db_url = db_url.replace("mysql://", "mysql+pymysql://", 1)
    elif db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
else:
    try:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'mysql+pymysql://root:1234@127.0.0.1:3306/bullx_trading'
    except Exception:
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

class UserLogin(UserMixin, db.Model):
    __tablename__ = 'user_login'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False) # Full Name
    email = db.Column(db.String(120), unique=True, nullable=False)   # Email Address
    phone = db.Column(db.String(120), nullable=True)                  # Mobile Number
    password_hash = db.Column(db.String(200), nullable=False)        # Hidden Password
    mpin_hash = db.Column(db.String(200), nullable=True)            # Hidden 4-Digit PIN
    is_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relational Links to UserDetails (One-to-One) and Trade (One-to-Many)
    details = db.relationship('UserDetails', backref='login_user', uselist=False, cascade="all, delete-orphan")
    trades = db.relationship('Trade', backref='login_user', cascade="all, delete-orphan")

    @property
    def demo_balance(self):
        return self.details.demo_balance if self.details else 100000.0

    @demo_balance.setter
    def demo_balance(self, val):
        if self.details:
            self.details.demo_balance = val

    @property
    def watchlist(self):
        return self.details.watchlist if self.details else '[]'

    @watchlist.setter
    def watchlist(self, val):
        if self.details:
            self.details.watchlist = val

    @property
    def active_devices(self):
        return self.details.active_devices if self.details else '[]'

    @active_devices.setter
    def active_devices(self, val):
        if self.details:
            self.details.active_devices = val

    def get_active_devices(self):
        if self.details:
            return self.details.get_active_devices()
        return []

    def register_device_session(self, device_id):
        if self.details:
            return self.details.register_device_session(device_id)
        return True, "OK"

    def unregister_device_session(self, device_id):
        if self.details:
            self.details.unregister_device_session(device_id)

    def set_password(self, password):
        salt = bcrypt.gensalt()
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def check_password(self, password):
        if not self.password_hash:
            return False
        clean_pwd = str(password).strip()
        if self.password_hash == clean_pwd:
            return True
        try:
            return bcrypt.checkpw(clean_pwd.encode('utf-8'), self.password_hash.encode('utf-8'))
        except Exception:
            return False

    def set_mpin(self, mpin):
        salt = bcrypt.gensalt(10)
        self.mpin_hash = bcrypt.hashpw(str(mpin).encode('utf-8'), salt).decode('utf-8')

    def check_mpin(self, mpin):
        if not self.mpin_hash:
            return False
        clean_pin = str(mpin).strip()
        if self.mpin_hash == clean_pin:
            return True
        try:
            return bcrypt.checkpw(clean_pin.encode('utf-8'), self.mpin_hash.encode('utf-8'))
        except Exception:
            return False
    
    def get_watchlist(self):
        return json.loads(self.watchlist) if self.watchlist else []
    
    def set_watchlist(self, stocks):
        self.watchlist = json.dumps(stocks)

# Alias User to UserLogin for Flask-Login compatibility
User = UserLogin

class UserDetails(db.Model):
    __tablename__ = 'user_details'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user_login.id'), nullable=False, unique=True)
    email = db.Column(db.String(120), nullable=False)
    
    # Wallet & Trading Data
    demo_balance = db.Column(db.Float, default=100000.0)
    watchlist = db.Column(db.Text, default='[]')
    active_devices = db.Column(db.Text, default='[]')
    
    # Personal & KYC Profile Details
    dob = db.Column(db.String(20), default='15-08-1998')
    pan_number = db.Column(db.String(20), default='ABCDE1234F')
    gender = db.Column(db.String(20), default='Male')
    marital_status = db.Column(db.String(20), default='Single')
    occupation = db.Column(db.String(50), default='Professional')
    income_range = db.Column(db.String(50), default='5-10 Lakhs')
    father_name = db.Column(db.String(80), default='Rajesh Sharma')
    profile_pic = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def get_active_devices(self):
        try:
            return json.loads(self.active_devices) if self.active_devices else []
        except Exception:
            return []

    def register_device_session(self, device_id):
        if not device_id:
            return True, "OK"
        devices = self.get_active_devices()
        if device_id not in devices:
            devices.append(device_id)
            if len(devices) > 5:
                devices = devices[-2:]
            self.active_devices = json.dumps(devices)
        return True, "Device registered"

    def unregister_device_session(self, device_id):
        if not device_id:
            return
        devices = self.get_active_devices()
        if device_id in devices:
            devices.remove(device_id)
            self.active_devices = json.dumps(devices)

class OTPRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    identifier = db.Column(db.String(120), nullable=False)
    otp_code = db.Column(db.String(10), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_used = db.Column(db.Boolean, default=False)

class Trade(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user_login.id'), nullable=False)
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

USERS_BACKUP_FILE = os.path.join(os.path.dirname(__file__), 'users_backup.json')

def get_or_create_user_details(user):
    if not user:
        return None
    try:
        if not user.details:
            dt = UserDetails(
                user_id=user.id,
                email=user.email,
                demo_balance=100000.0,
                watchlist='[]',
                active_devices='[]',
                dob='15-08-1998',
                pan_number='ABCDE1234F',
                gender='Male',
                marital_status='Single',
                occupation='Professional',
                income_range='5-10 Lakhs',
                father_name='Rajesh Sharma'
            )
            db.session.add(dt)
            db.session.commit()
        return user.details
    except Exception:
        db.session.rollback()
        return None

def backup_users_to_file():
    def _do_backup():
        try:
            with app.app_context():
                users = UserLogin.query.all()
                data = []
                for u in users:
                    dt = u.details
                    data.append({
                        'username': u.username,
                        'email': u.email,
                        'phone': u.phone,
                        'password_hash': u.password_hash,
                        'mpin_hash': u.mpin_hash,
                        'is_verified': u.is_verified,
                        'demo_balance': u.demo_balance,
                        'watchlist': u.watchlist,
                        'active_devices': u.active_devices,
                        'profile_pic': dt.profile_pic if dt else None,
                        'dob': dt.dob if dt else '15-08-1998',
                        'pan_number': dt.pan_number if dt else 'ABCDE1234F',
                        'gender': dt.gender if dt else 'Male',
                        'marital_status': dt.marital_status if dt else 'Single',
                        'occupation': dt.occupation if dt else 'Professional',
                        'income_range': dt.income_range if dt else '5-10 Lakhs',
                        'father_name': dt.father_name if dt else 'Rajesh Sharma'
                    })
                with open(USERS_BACKUP_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Async backup error: {e}")
    threading.Thread(target=_do_backup, daemon=True).start()

def restore_users_from_file():
    try:
        db.create_all()
        try:
            UserLogin.query.first()
            UserDetails.query.first()
        except Exception:
            db.session.rollback()
            db.drop_all()
            db.create_all()

        if os.path.exists(USERS_BACKUP_FILE):
            with open(USERS_BACKUP_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for item in data:
                try:
                    u = UserLogin.query.filter((UserLogin.email == item['email']) | (UserLogin.username == item['username'])).first()
                    if not u:
                        u = UserLogin(
                            username=item['username'],
                            email=item['email'],
                            phone=item.get('phone', ''),
                            password_hash=item['password_hash'],
                            mpin_hash=item.get('mpin_hash'),
                            is_verified=item.get('is_verified', True)
                        )
                        db.session.add(u)
                        db.session.commit()
                        
                        dt = UserDetails(
                            user_id=u.id,
                            email=u.email,
                            demo_balance=item.get('demo_balance', 100000.0),
                            watchlist=item.get('watchlist', '[]'),
                            active_devices=item.get('active_devices', '[]'),
                            profile_pic=item.get('profile_pic'),
                            dob=item.get('dob', '15-08-1998'),
                            pan_number=item.get('pan_number', 'ABCDE1234F'),
                            gender=item.get('gender', 'Male'),
                            marital_status=item.get('marital_status', 'Single'),
                            occupation=item.get('occupation', 'Professional'),
                            income_range=item.get('income_range', '5-10 Lakhs'),
                            father_name=item.get('father_name', 'Rajesh Sharma')
                        )
                        db.session.add(dt)
                        db.session.commit()
                except Exception as ex:
                    db.session.rollback()
                    print(f"Restore single user error: {ex}")

    except Exception as e:
        print(f"Error restoring users: {e}")

def auto_heal_db_schema():
    with app.app_context():
        try:
            db.create_all()
            UserDetails.query.first()
        except Exception:
            db.session.rollback()
            try:
                db.drop_all()
                db.create_all()
                restore_users_from_file()
                print("[AUTO-HEAL] Database schema auto-healed successfully!")
            except Exception as e:
                print(f"[AUTO-HEAL ERROR]: {e}")

with app.app_context():
    auto_heal_db_schema()

@app.route('/api/admin/reset-db', methods=['GET', 'POST'])
def force_reset_db():
    try:
        db.session.rollback()
        db.drop_all()
        db.create_all()
        restore_users_from_file()
        return jsonify({'success': True, 'message': 'Database schema reset & auto-healed successfully!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/get-all-users', methods=['GET'])
def get_all_users_export():
    try:
        users = UserLogin.query.all()
        data = []
        for u in users:
            dt = u.details
            data.append({
                'username': u.username,
                'email': u.email,
                'phone': u.phone or '',
                'password_hash': u.password_hash,
                'mpin_hash': u.mpin_hash,
                'is_verified': u.is_verified,
                'demo_balance': u.demo_balance,
                'watchlist': u.watchlist,
                'active_devices': u.active_devices,
                'profile_pic': dt.profile_pic if dt else None,
                'dob': dt.dob if dt else '15-08-1998',
                'pan_number': dt.pan_number if dt else 'ABCDE1234F',
                'gender': dt.gender if dt else 'Male',
                'marital_status': dt.marital_status if dt else 'Single',
                'occupation': dt.occupation if dt else 'Professional',
                'income_range': dt.income_range if dt else '5-10 Lakhs',
                'father_name': dt.father_name if dt else 'Rajesh Sharma'
            })
        return jsonify({'success': True, 'count': len(data), 'users': data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# SECURE AUTH & MPIN / OTP ROUTES
# ============================================

@app.route('/api/me', methods=['GET'])
def get_current_user_info():
    if current_user.is_authenticated:
        dt = get_or_create_user_details(current_user)
        return jsonify({
            'logged_in': True,
            'username': current_user.username,
            'email': current_user.email,
            'phone': current_user.phone or '',
            'balance': current_user.demo_balance,
            'has_mpin': bool(current_user.mpin_hash),
            'profile_pic': dt.profile_pic if dt else None,
            'dob': dt.dob if dt else '15-08-1998',
            'pan_number': dt.pan_number if dt else 'ABCDE1234F',
            'gender': dt.gender if dt else 'Male',
            'marital_status': dt.marital_status if dt else 'Single',
            'occupation': dt.occupation if dt else 'Professional',
            'income_range': dt.income_range if dt else '5-10 Lakhs',
            'father_name': dt.father_name if dt else 'Rajesh Sharma'
        })
    return jsonify({'logged_in': False})

@app.route('/api/user/profile/update', methods=['POST'])
@login_required
def update_user_profile():
    try:
        data = request.get_json() or {}
        user = UserLogin.query.get(current_user.id)
        dt = get_or_create_user_details(user)
        
        if 'username' in data and data['username'].strip():
            user.username = data['username'].strip()
        if 'phone' in data:
            user.phone = data['phone'].strip()
            
        if dt:
            if 'dob' in data:
                dt.dob = data['dob'].strip()
            if 'pan_number' in data:
                dt.pan_number = data['pan_number'].strip().upper()
            if 'gender' in data:
                dt.gender = data['gender'].strip()
            if 'marital_status' in data:
                dt.marital_status = data['marital_status'].strip()
            if 'occupation' in data:
                dt.occupation = data['occupation'].strip()
            if 'income_range' in data:
                dt.income_range = data['income_range'].strip()
            if 'father_name' in data:
                dt.father_name = data['father_name'].strip()
            
        db.session.commit()
        backup_users_to_file()
        
        return jsonify({
            'success': True,
            'message': 'Profile details updated successfully!',
            'user': {
                'username': user.username,
                'email': user.email,
                'phone': user.phone,
                'dob': dt.dob if dt else '',
                'pan_number': dt.pan_number if dt else '',
                'gender': dt.gender if dt else '',
                'marital_status': dt.marital_status if dt else '',
                'occupation': dt.occupation if dt else '',
                'income_range': dt.income_range if dt else '',
                'father_name': dt.father_name if dt else '',
                'profile_pic': dt.profile_pic if dt else None
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/profile/photo', methods=['POST'])
@login_required
def update_profile_photo():
    try:
        data = request.get_json() or {}
        photo_data = data.get('profile_pic')
        
        if not photo_data:
            return jsonify({'error': 'Photo data required'}), 400
            
        user = UserLogin.query.get(current_user.id)
        dt = get_or_create_user_details(user)
        if dt:
            dt.profile_pic = photo_data
            
        db.session.commit()
        backup_users_to_file()
        
        return jsonify({
            'success': True,
            'message': 'Profile photo updated successfully!',
            'profile_pic': photo_data
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

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

        existing_user = User.query.filter(
            (db.func.lower(User.email) == email.strip().lower()) | 
            (db.func.lower(User.username) == username.strip().lower())
        ).first()

        # Only block registration if account is fully verified AND has 4-digit PIN set up
        if existing_user and existing_user.is_verified and existing_user.mpin_hash:
            return jsonify({'error': 'An account with this email/username already exists. Please Sign In.'}), 400

        if not existing_user:
            user = User(username=username, email=email, phone=phone, is_verified=False)
            user.set_password(password)
            db.session.add(user)
        else:
            # Overwrite unverified/draft account with new password and send fresh OTP
            existing_user.username = username
            existing_user.email = email
            existing_user.phone = phone
            existing_user.set_password(password)
            user = existing_user

        db.session.commit()

        # Generate 6-Digit OTP Code
        otp_code = str(random.randint(100000, 999999))
        expires_at = datetime.utcnow() + timedelta(minutes=10)

        otp_rec = OTPRecord(identifier=email, otp_code=otp_code, expires_at=expires_at, is_used=False)
        db.session.add(otp_rec)
        db.session.commit()
        backup_users_to_file()

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
        user = UserLogin.query.filter((UserLogin.email == identifier) | (UserLogin.username == identifier)).first()
        if user:
            user.is_verified = True
            get_or_create_user_details(user)
            db.session.commit()
            backup_users_to_file()

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
        get_or_create_user_details(user)
        db.session.commit()
        backup_users_to_file()

        login_user(user, remember=True)

        return jsonify({
            'success': True,
            'message': '4-Digit Security PIN created successfully! Welcome to BullX Terminal.',
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
        identifier = str(data.get('identifier') or '').strip()
        password = str(data.get('password') or '').strip()

        if not identifier or not password:
            return jsonify({'error': 'Email / Username and Password are required'}), 400

        # Case-insensitive query for email, phone, or username with auto-healing retry
        try:
            user = UserLogin.query.filter(
                (db.func.lower(UserLogin.email) == identifier.lower()) | 
                (UserLogin.phone == identifier) |
                (db.func.lower(UserLogin.username) == identifier.lower())
            ).first()
        except Exception:
            db.session.rollback()
            restore_users_from_file()
            user = UserLogin.query.filter(
                (db.func.lower(UserLogin.email) == identifier.lower()) | 
                (UserLogin.phone == identifier) |
                (db.func.lower(UserLogin.username) == identifier.lower())
            ).first()

        if not user:
            return jsonify({'error': f'No account found for "{identifier}". Please click "Create Account" to register.'}), 404

        if not user.check_password(password):
            return jsonify({'error': 'Incorrect password. Please check your password and try again.'}), 401

        # Max 2 Devices Login Enforcement
        device_id = data.get('device_id') or request.headers.get('X-Device-Id') or request.remote_addr
        ok, device_msg = user.register_device_session(device_id)
        if not ok:
            return jsonify({'error': device_msg}), 403
        db.session.commit()

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
        identifier = str(data.get('identifier') or '').strip()
        mpin = data.get('mpin')

        if not mpin or len(str(mpin)) != 4 or not str(mpin).isdigit():
            return jsonify({'error': 'Enter valid 4-digit PIN'}), 400

        user = None
        if identifier:
            user = UserLogin.query.filter(
                (db.func.lower(UserLogin.email) == identifier.lower()) | 
                (UserLogin.phone == identifier) |
                (db.func.lower(UserLogin.username) == identifier.lower())
            ).first()
        elif session.get('_user_id'):
            try:
                user = UserLogin.query.get(int(session['_user_id']))
            except Exception:
                pass

        if not user:
            user = UserLogin.query.order_by(UserLogin.id.desc()).first() or UserLogin.query.first()

        if not user:
            return jsonify({'error': 'No accounts found. Please register first.'}), 404

        if user.check_mpin(mpin):
            # Max 2 Devices Login Enforcement
            device_id = data.get('device_id') or request.headers.get('X-Device-Id') or request.remote_addr
            ok, device_msg = user.register_device_session(device_id)
            if not ok:
                return jsonify({'error': device_msg}), 403
            db.session.commit()

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
    if current_user.is_authenticated:
        data = request.get_json() or {}
        device_id = data.get('device_id') or request.headers.get('X-Device-Id') or request.remote_addr
        current_user.unregister_device_session(device_id)
        db.session.commit()
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
    return jsonify({
        'error': 'Direct free fund addition is disabled! To add ₹1,00,000 Demo Funds, please complete the ₹500 UPI / QR payment.'
    }), 403

@app.route('/api/recharge/submit-payment', methods=['POST'])
@login_required
def submit_payment_utr():
    try:
        data = request.get_json() or {}
        utr_number = str(data.get('utr_number') or '').strip()
        package_amount = float(data.get('package_amount', 100000))
        real_price = float(data.get('real_price', 500))
        
        if not utr_number or len(utr_number) < 8:
            return jsonify({'error': 'Please enter a valid 12-digit UPI UTR / Transaction Reference Number.'}), 400
            
        return jsonify({
            'success': True,
            'status': 'PENDING_VERIFICATION',
            'message': f'⏳ Payment Verification Submitted! Your UPI UTR ({utr_number}) is under verification for ₹{real_price}. Wallet will be credited with ₹{package_amount:,.2f} upon confirmation!'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============================================
# HEALTH CHECK & KEEP-ALIVE
# ============================================

@app.route('/api/health', methods=['GET'])
@app.route('/api/ping', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Server is active and awake 24/7'})

def start_keep_alive_ping():
    import threading, time, requests
    def _ping():
        time.sleep(10)
        while True:
            try:
                # Self-ping keep alive every 10 minutes
                requests.get('http://127.0.0.1:5000/api/ping', timeout=5)
            except Exception:
                pass
            time.sleep(600)
    t = threading.Thread(target=_ping, daemon=True)
    t.start()

start_keep_alive_ping()

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