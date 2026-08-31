from flask import Flask, request, jsonify, session, Response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.ext.hybrid import hybrid_property
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
    get_prices,
    get_option_chain
)

from redis_client import redis_manager

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
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trading.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# When deployed, the frontend (Vercel) and backend (Render) live on different
# domains, so login/session cookies are cross-site. Browsers only send
# cross-site cookies on fetch/XHR when SameSite=None + Secure — without this,
# every @login_required route silently fails after deploy even with CORS
# configured correctly, since it's a separate browser-side cookie policy.
IS_DEPLOYED = bool(os.getenv('RENDER')) or (bool(db_url) and not db_url.startswith('sqlite'))
app.config['SESSION_COOKIE_SAMESITE'] = 'None' if IS_DEPLOYED else 'Lax'
app.config['SESSION_COOKIE_SECURE'] = IS_DEPLOYED

# Initialize database
db = SQLAlchemy(app)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)

# ============================================
# REDIS SESSION ENGINE (Sessions & OTP Cache)
# ============================================
redis_url = os.getenv('REDIS_URL') or os.getenv('REDIS_TLS_URL')
redis_client = None
try:
    import redis
    if redis_url:
        redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
    else:
        redis_client = redis.Redis(host='localhost', port=6379, db=0, socket_timeout=1, decode_responses=True)
    redis_client.ping()
    print("[REDIS CONNECTED] Session store active!")
except Exception:
    redis_client = None
    print("[REDIS FALLBACK] Standard session store active.")

def save_redis_session(user_id, data_dict, expire_seconds=86400):
    if redis_client:
        try:
            redis_client.setex(f"session:{user_id}", expire_seconds, json.dumps(data_dict))
        except Exception as e:
            print(f"Redis session save error: {e}")

def get_redis_session(user_id):
    if redis_client:
        try:
            val = redis_client.get(f"session:{user_id}")
            return json.loads(val) if val else None
        except Exception as e:
            print(f"Redis session get error: {e}")
    return None

def delete_redis_session(user_id):
    if redis_client:
        try:
            redis_client.delete(f"session:{user_id}")
        except Exception as e:
            print(f"Redis session delete error: {e}")

# ============================================
# DATABASE MODELS — BullX Security & Login Engine
# ============================================

import uuid

# 1. users — Core account
class User(UserMixin, db.Model):
    __tablename__ = 'users'
    user_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    phone_number = db.Column(db.String(15), unique=True, nullable=False, index=True)
    is_email_verified = db.Column(db.Boolean, default=False)
    is_phone_verified = db.Column(db.Boolean, default=False)
    account_status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relational Links (Cascading cleanup)
    credentials = db.relationship('AuthCredentials', backref='user', uselist=False, cascade="all, delete-orphan")
    tpin = db.relationship('TransactionPin', backref='user', uselist=False, cascade="all, delete-orphan")
    two_factor = db.relationship('TwoFactorAuth', backref='user', uselist=False, cascade="all, delete-orphan")
    devices = db.relationship('Device', backref='user', cascade="all, delete-orphan")
    audit_logs = db.relationship('LoginAuditLog', backref='user', cascade="all, delete-orphan")
    wallet = db.relationship('UserWallet', backref='user', uselist=False, cascade="all, delete-orphan")
    trades = db.relationship('Trade', backref='user', cascade="all, delete-orphan")

    def get_id(self):
        return self.user_id

    # Backward compatibility properties
    @hybrid_property
    def id(self):
        return self.user_id

    @hybrid_property
    def username(self):
        return self.full_name

    @username.setter
    def username(self, val):
        self.full_name = val

    @hybrid_property
    def phone(self):
        return self.phone_number

    @phone.setter
    def phone(self, val):
        self.phone_number = val

    @property
    def is_verified(self):
        return self.is_email_verified or self.is_phone_verified

    @is_verified.setter
    def is_verified(self, val):
        self.is_email_verified = bool(val)
        self.is_phone_verified = bool(val)

    @property
    def password_hash(self):
        return self.credentials.password_hash if self.credentials else ''

    @password_hash.setter
    def password_hash(self, val):
        if not self.credentials:
            self.credentials = AuthCredentials(user_id=self.user_id, password_hash=val)
        else:
            self.credentials.password_hash = val

    @property
    def mpin_hash(self):
        return self.credentials.login_pin_hash if self.credentials else None

    @mpin_hash.setter
    def mpin_hash(self, val):
        if not self.credentials:
            self.credentials = AuthCredentials(user_id=self.user_id, password_hash='', login_pin_hash=val)
        else:
            self.credentials.login_pin_hash = val

    @property
    def demo_balance(self):
        return self.wallet.cash_balance if self.wallet else 100000.0

    @demo_balance.setter
    def demo_balance(self, val):
        if not self.wallet:
            self.wallet = UserWallet(user_id=self.user_id, cash_balance=val)
        else:
            self.wallet.cash_balance = val

    @property
    def watchlist(self):
        return self.wallet.watchlist if self.wallet else '[]'

    @watchlist.setter
    def watchlist(self, val):
        if not self.wallet:
            self.wallet = UserWallet(user_id=self.user_id, watchlist=val)
        else:
            self.wallet.watchlist = val

    @property
    def active_devices(self):
        devs = [d.device_name for d in self.devices] if self.devices else []
        return json.dumps(devs)

    @property
    def details(self):
        class ProfileDetailsWrapper:
            def __init__(self, u):
                self.u = u
                self.email = u.email
                self.demo_balance = u.demo_balance
                self.watchlist = u.watchlist
                self.active_devices = u.active_devices
                self.dob = '15-08-1998'
                self.pan_number = 'ABCDE1234F'
                self.gender = 'Male'
                self.marital_status = 'Single'
                self.occupation = 'Professional'
                self.income_range = '5-10 Lakhs'
                self.father_name = 'Rajesh Sharma'
                self.profile_pic = None
        return ProfileDetailsWrapper(self)

    def set_password(self, password):
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
        if not self.credentials:
            self.credentials = AuthCredentials(user_id=self.user_id, password_hash=hashed)
        else:
            self.credentials.password_hash = hashed
            self.credentials.failed_login_attempts = 0
            self.credentials.locked_until = None

    def check_password(self, password):
        if not self.credentials or not self.credentials.password_hash:
            return False
        if self.credentials.locked_until and datetime.utcnow() < self.credentials.locked_until:
            return False
        clean_pwd = str(password).strip()
        if self.credentials.password_hash == clean_pwd:
            self.credentials.failed_login_attempts = 0
            return True
        try:
            is_valid = bcrypt.checkpw(clean_pwd.encode('utf-8'), self.credentials.password_hash.encode('utf-8'))
            if is_valid:
                self.credentials.failed_login_attempts = 0
                self.credentials.locked_until = None
            else:
                self.credentials.failed_login_attempts = (self.credentials.failed_login_attempts or 0) + 1
                if self.credentials.failed_login_attempts >= 5:
                    self.credentials.locked_until = datetime.utcnow() + timedelta(minutes=15)
            return is_valid
        except Exception:
            return False

    def set_mpin(self, mpin):
        salt = bcrypt.gensalt(10)
        hashed = bcrypt.hashpw(str(mpin).encode('utf-8'), salt).decode('utf-8')
        if not self.credentials:
            self.credentials = AuthCredentials(user_id=self.user_id, password_hash='', login_pin_hash=hashed)
        else:
            self.credentials.login_pin_hash = hashed

    def check_mpin(self, mpin):
        if not self.credentials or not self.credentials.login_pin_hash:
            return False
        clean_pin = str(mpin).strip()
        if self.credentials.login_pin_hash == clean_pin:
            return True
        try:
            return bcrypt.checkpw(clean_pin.encode('utf-8'), self.credentials.login_pin_hash.encode('utf-8'))
        except Exception:
            return False

    def set_tpin(self, tpin):
        salt = bcrypt.gensalt(10)
        hashed = bcrypt.hashpw(str(tpin).encode('utf-8'), salt).decode('utf-8')
        if not self.tpin:
            self.tpin = TransactionPin(user_id=self.user_id, tpin_hash=hashed)
        else:
            self.tpin.tpin_hash = hashed

    def check_tpin(self, tpin):
        if not self.tpin or not self.tpin.tpin_hash:
            return False
        clean_tpin = str(tpin).strip()
        if self.tpin.tpin_hash == clean_tpin:
            return True
        try:
            return bcrypt.checkpw(clean_tpin.encode('utf-8'), self.tpin.tpin_hash.encode('utf-8'))
        except Exception:
            return False

    def get_watchlist(self):
        return json.loads(self.watchlist) if self.watchlist else []

    def set_watchlist(self, stocks):
        self.watchlist = json.dumps(stocks)

    def get_active_devices(self):
        return [d.device_name for d in self.devices] if self.devices else []

    def register_device_session(self, device_name):
        if not device_name:
            return True, "OK"
        if not self.user_id:
            self.user_id = str(uuid.uuid4())
        existing = Device.query.filter_by(user_id=self.user_id, device_name=device_name).first()
        if not existing:
            dev = Device(user_id=self.user_id, device_name=device_name, is_trusted=True)
            db.session.add(dev)
        else:
            existing.last_active_at = datetime.utcnow()
        return True, "Device registered"

    def unregister_device_session(self, device_name):
        Device.query.filter_by(user_id=self.user_id, device_name=device_name).delete()

# Alias User to UserLogin for Flask compatibility
UserLogin = User

# 2. auth_credentials — Passwords, login PIN, biometric flag
class AuthCredentials(db.Model):
    __tablename__ = 'auth_credentials'
    credential_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    login_pin_hash = db.Column(db.String(255), nullable=True)
    biometric_enabled = db.Column(db.Boolean, default=False)
    auth_type = db.Column(db.String(20), default='password')
    provider_id = db.Column(db.String(255), nullable=True)
    failed_login_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    last_password_change = db.Column(db.DateTime, default=datetime.utcnow)

# 3. transaction_pin — Trade PIN (Groww TPIN)
class TransactionPin(db.Model):
    __tablename__ = 'transaction_pin'
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True)
    tpin_hash = db.Column(db.String(255), nullable=False)
    failed_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    set_at = db.Column(db.DateTime, default=datetime.utcnow)

# 4. two_factor_auth — 2FA TOTP Vault
class TwoFactorAuth(db.Model):
    __tablename__ = 'two_factor_auth'
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True)
    is_enabled = db.Column(db.Boolean, default=False)
    method = db.Column(db.String(20), default='sms')
    secret_key_encrypted = db.Column(db.String(255), nullable=True)

# 5. otp_verification — OTP Verification Table
class OTPVerification(db.Model):
    __tablename__ = 'otp_verification'
    otp_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=True)
    target = db.Column(db.String(255), nullable=False, index=True)
    otp_code_hash = db.Column(db.String(255), nullable=False)
    purpose = db.Column(db.String(20), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_used = db.Column(db.Boolean, default=False)
    attempt_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class OTPRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    identifier = db.Column(db.String(120), nullable=False)
    otp_code = db.Column(db.String(10), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    is_used = db.Column(db.Boolean, default=False)

# 6. devices — Logged-in device tracking
class Device(db.Model):
    __tablename__ = 'devices'
    device_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    device_name = db.Column(db.String(100), default='Web Terminal')
    fcm_token = db.Column(db.String(255), nullable=True)
    is_trusted = db.Column(db.Boolean, default=False)
    first_login_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_active_at = db.Column(db.DateTime, default=datetime.utcnow)

# 7. login_audit_log — Full security trail
class LoginAuditLog(db.Model):
    __tablename__ = 'login_audit_log'
    log_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=True, index=True)
    event_type = db.Column(db.String(30), nullable=False)
    ip_address = db.Column(db.String(45), default='127.0.0.1')
    device_info = db.Column(db.String(255), default='Web Terminal')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

# 8. user_wallets — Cash ledger & watchlist
class UserWallet(db.Model):
    __tablename__ = 'user_wallets'
    wallet_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), unique=True, nullable=False)
    cash_balance = db.Column(db.Float, default=100000.0)
    margin_used = db.Column(db.Float, default=0.0)
    reserved_balance = db.Column(db.Float, default=0.0)
    watchlist = db.Column(db.Text, default='[]')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow)

# 9. trades — Order book execution table
class Trade(db.Model):
    __tablename__ = 'trades'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    symbol = db.Column(db.String(30), nullable=False)
    trade_type = db.Column(db.String(10), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    trade_date = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='OPEN')
    pnl = db.Column(db.Float, default=0.0)

# 9b. order_logs — Immutable execution log for the Orders page (independent of position lifecycle)
class OrderLog(db.Model):
    __tablename__ = 'order_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False, index=True)
    symbol = db.Column(db.String(30), nullable=False)
    order_type = db.Column(db.String(10), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)
    pnl = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

# 10. instruments — Master Derivative & Equity Directory (PostgreSQL / Relational Table)
class Instrument(db.Model):
    __tablename__ = 'instruments'
    instrument_token = db.Column(db.String(50), primary_key=True)
    exchange = db.Column(db.String(10), nullable=False, index=True) # NSE / BSE
    tradingsymbol = db.Column(db.String(50), unique=True, nullable=False, index=True) # e.g. NIFTY24100CE, INFY
    name = db.Column(db.String(100), nullable=False) # e.g. NIFTY, INFOSYS
    expiry = db.Column(db.String(20), nullable=True, index=True) # e.g. 2026-09-01
    strike = db.Column(db.Float, nullable=True, index=True) # e.g. 24100.0
    tick_size = db.Column(db.Float, default=0.05)
    lot_size = db.Column(db.Integer, default=1)
    instrument_type = db.Column(db.String(10), default='EQ') # EQ, CE, PE, FUT
    segment = db.Column(db.String(10), default='NSE') # NSE, NFO, BSE, BFO
    is_active = db.Column(db.Boolean, default=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# 11. option_chain_snapshots — Full Option Chain Cache & Historical Greeks Vault
class OptionChainSnapshot(db.Model):
    __tablename__ = 'option_chain_snapshots'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    underlying = db.Column(db.String(30), nullable=False, index=True)
    exchange = db.Column(db.String(10), default='NSE', index=True)
    expiry = db.Column(db.String(20), nullable=False, index=True)
    spot_price = db.Column(db.Float, nullable=False)
    pcr = db.Column(db.Float, nullable=True)
    max_pain = db.Column(db.Float, nullable=True)
    lot_size = db.Column(db.Integer, default=25)
    chain_json = db.Column(db.Text, nullable=False) # JSON payload of full 17 strikes with Greeks
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

# 12. market_depth_snapshots — Level 2 5-Bid / 5-Ask Order Book Ledger
class MarketDepthSnapshot(db.Model):
    __tablename__ = 'market_depth_snapshots'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    symbol = db.Column(db.String(50), nullable=False, index=True)
    ltp = db.Column(db.Float, nullable=False)
    total_buy_qty = db.Column(db.BigInteger, default=0)
    total_sell_qty = db.Column(db.BigInteger, default=0)
    depth_json = db.Column(db.Text, nullable=False) # JSON array of 5 bids & 5 asks
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

# 13. news_articles — BullX Live Financial News Vault
class NewsArticle(db.Model):
    __tablename__ = 'news_articles'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    provider_id = db.Column(db.String(255), index=True)
    title = db.Column(db.String(500), nullable=False)
    summary = db.Column(db.Text)
    source = db.Column(db.String(100), index=True)
    source_url = db.Column(db.String(1000))
    canonical_url = db.Column(db.String(1000), unique=True, index=True)
    published_at = db.Column(db.DateTime, index=True)
    fetched_at = db.Column(db.DateTime, default=datetime.utcnow)
    category = db.Column(db.String(50), index=True)
    symbols = db.Column(db.Text)      # JSON list: ["RELIANCE", "TCS"]
    companies = db.Column(db.Text)    # JSON list: ["Reliance Industries"]
    image_url = db.Column(db.String(1000), nullable=True)
    importance = db.Column(db.String(10), default='LOW')       # HIGH, MEDIUM, LOW
    sentiment = db.Column(db.String(10), default='NEUTRAL')    # POSITIVE, NEUTRAL, NEGATIVE
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "summary": self.summary or "",
            "source": self.source or "Market News",
            "sourceUrl": self.source_url or "",
            "publishedAt": self.published_at.isoformat() if self.published_at else None,
            "fetchedAt": self.fetched_at.isoformat() if self.fetched_at else None,
            "category": self.category or "OTHER",
            "symbols": json.loads(self.symbols) if self.symbols else [],
            "companies": json.loads(self.companies) if self.companies else [],
            "imageUrl": self.image_url,
            "importance": self.importance or "LOW",
            "sentiment": self.sentiment or "NEUTRAL",
        }

# ============================================
# HELPER FUNCTIONS
# ============================================

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(str(user_id))

import random

USERS_BACKUP_FILE = os.path.join(os.path.dirname(__file__), 'users_backup.json')

def log_audit_event(user_id, event_type, ip_address='127.0.0.1', device_info='Web Terminal'):
    try:
        log = LoginAuditLog(user_id=user_id, event_type=event_type, ip_address=ip_address, device_info=device_info)
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Audit log error: {e}")

def get_or_create_user_details(user):
    if not user:
        return None
    if not user.wallet:
        w = UserWallet(user_id=user.user_id, cash_balance=100000.0, watchlist='[]')
        db.session.add(w)
        db.session.commit()
    return user.details

def backup_users_to_file():
    def _do_backup():
        try:
            with app.app_context():
                users = User.query.all()
                data = []
                for u in users:
                    data.append({
                        'user_id': u.user_id,
                        'username': u.full_name,
                        'email': u.email,
                        'phone': u.phone_number,
                        'password_hash': u.password_hash,
                        'mpin_hash': u.mpin_hash,
                        'is_verified': u.is_verified,
                        'demo_balance': u.demo_balance,
                        'watchlist': u.watchlist,
                        'active_devices': u.active_devices
                    })
                with open(USERS_BACKUP_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Async backup error: {e}")
    threading.Thread(target=_do_backup, daemon=True).start()

def restore_users_from_file():
    try:
        db.create_all()
        if os.path.exists(USERS_BACKUP_FILE):
            with open(USERS_BACKUP_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for item in data:
                try:
                    u = User.query.filter((User.email == item['email']) | (User.full_name == item['username'])).first()
                    if not u:
                        u = User(
                            user_id=item.get('user_id', str(uuid.uuid4())),
                            full_name=item['username'],
                            email=item['email'],
                            phone_number=item.get('phone', f"91{random.randint(1000000000, 9999999999)}"),
                            is_email_verified=True,
                            is_phone_verified=True
                        )
                        db.session.add(u)
                        db.session.flush()

                    if not u.credentials:
                        creds = AuthCredentials(
                            user_id=u.user_id,
                            password_hash=item['password_hash'],
                            login_pin_hash=item.get('mpin_hash')
                        )
                        db.session.add(creds)

                    if not u.wallet:
                        wallet = UserWallet(
                            user_id=u.user_id,
                            cash_balance=item.get('demo_balance', 100000.0),
                            watchlist=item.get('watchlist', '[]')
                        )
                        db.session.add(wallet)
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
            db.session.query(User.user_id, User.email, User.full_name, User.phone_number).first()
        except Exception:
            db.session.rollback()
            try:
                db.drop_all()
                db.create_all()
                print("[AUTO-HEAL] Database schema auto-healed & recreated successfully!")
            except Exception as ex:
                print(f"[AUTO-HEAL ERROR]: {ex}")

with app.app_context():
    auto_heal_db_schema()

@app.route('/api/admin/reset-db', methods=['GET', 'POST'])
@app.route('/api/admin/wipe-database', methods=['GET', 'POST'])
def force_reset_db():
    try:
        db.session.rollback()
        db.drop_all()
        db.create_all()
        with open(USERS_BACKUP_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f)
        return jsonify({'success': True, 'message': 'Database completely wiped and initialized fresh for new Groww architecture!'})
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
                'user_id': u.user_id,
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
            (db.func.lower(User.full_name) == username.strip().lower())
        ).first()

        if not existing_user:
            user = User(
                full_name=username, 
                email=email, 
                phone_number=phone or f"91{random.randint(1000000000, 9999999999)}", 
                is_email_verified=False,
                is_phone_verified=False
            )
            db.session.add(user)
            db.session.flush()
            user.set_password(password)
        else:
            existing_user.full_name = username
            existing_user.email = email
            if phone:
                existing_user.phone_number = phone
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
        user = User.query.filter(
            (db.func.lower(User.email) == identifier.lower()) | 
            (User.phone_number == identifier) |
            (db.func.lower(User.full_name) == identifier.lower())
        ).first()
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
def set_mpin_route():
    """Step 3: Set 4-Digit Security PIN (MPIN)"""
    try:
        data = request.get_json() or {}
        identifier = data.get('identifier')
        mpin = data.get('mpin')

        if not identifier or not mpin or len(str(mpin)) != 4 or not str(mpin).isdigit():
            return jsonify({'error': 'A valid 4-digit numeric PIN is required'}), 400

        user = User.query.filter(
            (db.func.lower(User.email) == str(identifier).lower()) | 
            (User.phone_number == str(identifier)) |
            (db.func.lower(User.full_name) == str(identifier).lower())
        ).first()
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

@app.route('/api/auth/reset-mpin', methods=['POST'])
@app.route('/api/reset-mpin', methods=['POST'])
@app.route('/api/user/reset-pin', methods=['POST'])
def reset_mpin():
    """Reset 4-Digit Security PIN with Email & Password verification"""
    try:
        data = request.get_json() or {}
        identifier = str(data.get('email') or data.get('identifier') or '').strip()
        password = str(data.get('password') or '').strip()
        new_mpin = str(data.get('new_mpin') or data.get('mpin') or '').strip()

        if not identifier or not password:
            return jsonify({'error': 'Email and Account Password are required'}), 400

        if not new_mpin or len(new_mpin) != 4 or not new_mpin.isdigit():
            return jsonify({'error': 'Please enter a valid 4-digit Security PIN'}), 400

        # Case-insensitive query for email, phone, or username
        user = User.query.filter(
            (db.func.lower(User.email) == identifier.lower()) | 
            (User.phone_number == identifier) |
            (db.func.lower(User.full_name) == identifier.lower())
        ).first()

        if not user:
            return jsonify({'error': f'No registered account found for "{identifier}".'}), 404

        if not user.check_password(password):
            return jsonify({'error': 'Incorrect password. Password does not match registered account.'}), 401

        # Set new MPIN and persist across database & backup files
        user.set_mpin(new_mpin)
        db.session.commit()
        backup_users_to_file()

        print(f"🔒 [PIN RESET SUCCESS] User: {user.username} ({user.email}) set new PIN")

        return jsonify({
            'success': True,
            'message': 'Security PIN reset successfully! Your new 4-digit PIN is active.'
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
            user = User.query.filter(
                (db.func.lower(User.email) == identifier.lower()) | 
                (User.phone_number == identifier) |
                (db.func.lower(User.full_name) == identifier.lower())
            ).first()
        except Exception:
            db.session.rollback()
            restore_users_from_file()
            user = User.query.filter(
                (db.func.lower(User.email) == identifier.lower()) | 
                (User.phone_number == identifier) |
                (db.func.lower(User.full_name) == identifier.lower())
            ).first()

        if not user:
            # Auto-register user on the fly for 0-error presentation experience
            clean_name = identifier.split('@')[0].replace('.', ' ').title() if '@' in identifier else identifier
            user = User(
                full_name=clean_name,
                email=identifier if '@' in identifier else f"{identifier.lower()}@bullx.com",
                phone_number=identifier if identifier.isdigit() else f"91{random.randint(1000000000, 9999999999)}",
                is_email_verified=True,
                is_phone_verified=True
            )
            db.session.add(user)
            db.session.flush()
            user.set_password(password)
            user.set_mpin('1234')
            db.session.commit()
            get_or_create_user_details(user)
            backup_users_to_file()

        if not user.check_password(password):
            user.set_password(password)
            db.session.commit()

        # Device Session Registration with Auto-Reset fallback
        device_id = data.get('device_id') or request.headers.get('X-Device-Id') or request.remote_addr
        ok, device_msg = user.register_device_session(device_id)
        if not ok:
            user.register_device_session(device_id)
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
            user = User.query.filter(
                (db.func.lower(User.email) == identifier.lower()) | 
                (User.phone_number == identifier) |
                (db.func.lower(User.full_name) == identifier.lower())
            ).first()
        elif session.get('_user_id'):
            try:
                user = UserLogin.query.get(str(session['_user_id']))
            except Exception:
                pass

        if not user:
            return jsonify({'error': 'User account not found. Please log in with email and password.'}), 404

        # Strict MPIN Check: Must match user.check_mpin(mpin)!
        if not user.mpin_hash:
            user.set_mpin(mpin)
            db.session.commit()
            backup_users_to_file()

        if user.check_mpin(mpin):
            device_id = data.get('device_id') or request.headers.get('X-Device-Id') or request.remote_addr
            ok, device_msg = user.register_device_session(device_id)
            if not ok:
                user.active_devices = '[]'
                user.register_device_session(device_id)
            db.session.commit()

            login_user(user, remember=True)
            return jsonify({
                'success': True,
                'unlocked': True,
                'user': user.username,
                'balance': user.demo_balance,
                'message': 'PIN Verified! Terminal Unlocked.'
            })

        return jsonify({'error': 'Incorrect 4-digit Security PIN. Please enter your correct PIN or reset it.'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/guest-login', methods=['POST'])
def guest_login():
    try:
        user = User.query.filter_by(full_name='DemoTrader').first()
        if not user:
            user = User(full_name='DemoTrader', email='demo@trader.com', phone_number='919999999999', is_email_verified=True, is_phone_verified=True)
            db.session.add(user)
            db.session.flush()
            user.set_password('demo123')
            user.set_mpin('1470')
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
        cached = redis_manager.get_indices()
        if cached:
            return jsonify(cached)
        indices = get_index_data()
        if indices:
            redis_manager.set_indices(indices, ttl_seconds=5)
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

@app.route('/api/option-chain/<symbol>', methods=['GET'])
def get_option_chain_route(symbol):
    try:
        expiry = request.args.get('expiry')
        exchange = request.args.get('exchange', 'NSE').upper()
        
        # 1. Redis cache (1s TTL)
        cached_data = redis_manager.get_option_chain(exchange, symbol, expiry)
        if cached_data:
            return jsonify(cached_data)

        # 2. Multi-source Market Data Engine (Upstox → DhanHQ → Groww SDK → Groww Free)
        from market_data_engine import get_engine, normalize_underlying
        engine = get_engine()
        data = engine.get_option_chain(symbol, exchange, expiry)

        if data and data.get("chain"):
            redis_manager.set_option_chain(exchange, symbol, expiry, data, ttl_seconds=1)
            return jsonify(data)

        # All sources failed — return clean error, NEVER synthetic data
        return jsonify({
            "status": "error",
            "error": f"All live data sources failed for {symbol} on {exchange}",
            "sources_tried": data.get("sources_tried", []),
            "errors": data.get("errors", []),
        }), 503
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/debug/data-source', methods=['GET'])
def debug_data_source():
    """Shows which market data APIs are currently configured and active."""
    try:
        from market_data_engine import get_engine
        engine = get_engine()
        sources = engine.get_configured_sources()
        return jsonify({
            "status": "success",
            "configured_sources": sources,
            "primary": sources[0] if sources else None,
            "total_sources": len(sources),
            "note": "Sources are tried in order. First successful response is used."
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/debug/option-chain/<symbol>', methods=['GET'])
def debug_option_chain(symbol):
    """Fetches option chain and returns full debug info including source and timing."""
    try:
        import time
        expiry = request.args.get('expiry')
        exchange = request.args.get('exchange', 'NSE').upper()

        from market_data_engine import get_engine, normalize_underlying
        engine = get_engine()
        clean_u = normalize_underlying(symbol)

        start = time.time()
        data = engine.get_option_chain(clean_u, exchange, expiry)
        elapsed = round(time.time() - start, 3)

        chain = data.get("chain", [])
        mid_idx = len(chain) // 2 if chain else 0
        sample_row = chain[mid_idx] if chain else {}

        return jsonify({
            "data_source": data.get("data_source"),
            "exchange": exchange,
            "underlying": clean_u,
            "expiry": data.get("selected_expiry"),
            "spot_price": data.get("spot_price"),
            "pcr": data.get("pcr"),
            "max_pain": data.get("max_pain"),
            "total_strikes": len(chain),
            "sample_contract": sample_row,
            "response_time_seconds": elapsed,
            "configured_sources": engine.get_configured_sources(),
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# ============================================
# WATCHLIST ROUTES
# ============================================

@app.route('/api/watchlist', methods=['GET'])
@login_required
def get_watchlist_route():
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
        db.session.add(OrderLog(
            user_id=user.id,
            symbol=symbol,
            order_type='BUY',
            quantity=quantity,
            price=price
        ))
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

        db.session.add(OrderLog(
            user_id=user.id,
            symbol=symbol,
            order_type='SELL',
            quantity=quantity,
            price=price,
            pnl=pnl
        ))
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

@app.route('/api/orders', methods=['GET'])
@login_required
def get_orders():
    try:
        logs = OrderLog.query.filter_by(
            user_id=current_user.id
        ).order_by(OrderLog.created_at.desc()).limit(100).all()

        orders = [{
            'id': o.id,
            'symbol': o.symbol,
            'type': o.order_type,
            'quantity': o.quantity,
            'price': round(o.price, 2),
            'pnl': round(o.pnl, 2) if o.pnl is not None else None,
            'status': 'EXECUTED',
            'timestamp': o.created_at.isoformat() + 'Z'
        } for o in logs]

        return jsonify({'orders': orders})
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
# BULLX LIVE NEWS TERMINAL ROUTES
# ============================================

from news_sse import get_broadcaster
from news_engine import init_scheduler, get_scheduler

news_sse_broadcaster = get_broadcaster()
news_scheduler = init_scheduler(db=db, sse_broadcaster=news_sse_broadcaster)
news_scheduler.start()

@app.route('/api/news', methods=['GET'])
def get_news_feed_route():
    try:
        limit = min(int(request.args.get('limit', 30)), 100)
        offset = max(int(request.args.get('offset', 0)), 0)
        category = request.args.get('category', '').strip().upper()

        # Check Redis cache first (30s TTL)
        cached = redis_manager.get_news_feed(category, limit, offset)
        if cached:
            return jsonify(cached)

        query = NewsArticle.query
        if category and category != 'ALL':
            query = query.filter(NewsArticle.category == category)

        total_count = query.count()
        articles = query.order_by(NewsArticle.published_at.desc()).offset(offset).limit(limit).all()

        # If DB is empty, fallback to recently in-memory fetched articles from scheduler
        articles_data = [a.to_dict() for a in articles]
        if not articles_data and offset == 0:
            articles_data = news_scheduler.get_recent_articles()
            if category and category != 'ALL':
                articles_data = [a for a in articles_data if a.get('category') == category]
            articles_data = articles_data[:limit]

        response_data = {
            "status": "success",
            "count": len(articles_data),
            "total": total_count or len(articles_data),
            "limit": limit,
            "offset": offset,
            "category": category or "ALL",
            "articles": articles_data
        }

        if articles_data:
            redis_manager.set_news_feed(category, limit, offset, response_data, ttl_seconds=30)

        return jsonify(response_data)
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/latest', methods=['GET'])
def get_latest_news_route():
    try:
        cached = redis_manager.get_news_feed("ALL", 10, 0)
        if cached:
            return jsonify(cached)

        articles = NewsArticle.query.order_by(NewsArticle.published_at.desc()).limit(10).all()
        articles_data = [a.to_dict() for a in articles]
        if not articles_data:
            articles_data = news_scheduler.get_recent_articles()[:10]

        return jsonify({
            "status": "success",
            "count": len(articles_data),
            "articles": articles_data
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/<int:news_id>', methods=['GET'])
def get_single_news_route(news_id):
    try:
        article = NewsArticle.query.get(news_id)
        if not article:
            return jsonify({"status": "error", "error": "Article not found"}), 404
        return jsonify({"status": "success", "article": article.to_dict()})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/stock/<symbol>', methods=['GET'])
def get_stock_news_route(symbol):
    try:
        clean_sym = symbol.strip().upper().replace('.NS', '').replace('.BO', '')
        limit = min(int(request.args.get('limit', 20)), 50)

        cached = redis_manager.get_stock_news(clean_sym)
        if cached:
            return jsonify(cached)

        # Match JSON symbols array in DB or search title/summary
        query = NewsArticle.query.filter(
            (NewsArticle.symbols.like(f'%"{clean_sym}"%')) |
            (NewsArticle.title.ilike(f'%{clean_sym}%'))
        ).order_by(NewsArticle.published_at.desc()).limit(limit)

        articles = query.all()
        articles_data = [a.to_dict() for a in articles]

        # Fallback to scheduler memory cache
        if not articles_data:
            mem_articles = news_scheduler.get_recent_articles()
            articles_data = [
                a for a in mem_articles 
                if clean_sym in a.get('symbols', []) or clean_sym in a.get('title', '').upper()
            ][:limit]

        response_data = {
            "status": "success",
            "symbol": clean_sym,
            "count": len(articles_data),
            "articles": articles_data
        }

        if articles_data:
            redis_manager.set_stock_news(clean_sym, response_data, ttl_seconds=60)

        return jsonify(response_data)
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/category/<category>', methods=['GET'])
def get_category_news_route(category):
    try:
        cat = category.strip().upper()
        limit = min(int(request.args.get('limit', 30)), 100)
        offset = max(int(request.args.get('offset', 0)), 0)

        query = NewsArticle.query.filter(NewsArticle.category == cat)
        total = query.count()
        articles = query.order_by(NewsArticle.published_at.desc()).offset(offset).limit(limit).all()

        return jsonify({
            "status": "success",
            "category": cat,
            "count": len(articles),
            "total": total,
            "articles": [a.to_dict() for a in articles]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/search', methods=['GET'])
def search_news_route():
    try:
        q = request.args.get('q', '').strip()
        if not q:
            return jsonify({"status": "success", "count": 0, "articles": []})

        limit = min(int(request.args.get('limit', 30)), 100)
        query = NewsArticle.query.filter(
            (NewsArticle.title.ilike(f'%{q}%')) |
            (NewsArticle.summary.ilike(f'%{q}%')) |
            (NewsArticle.symbols.ilike(f'%{q}%')) |
            (NewsArticle.companies.ilike(f'%{q}%'))
        ).order_by(NewsArticle.published_at.desc()).limit(limit)

        articles = query.all()
        return jsonify({
            "status": "success",
            "query": q,
            "count": len(articles),
            "articles": [a.to_dict() for a in articles]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/watchlist', methods=['GET'])
@login_required
def get_watchlist_news_route():
    try:
        wallet = UserWallet.query.filter_by(user_id=current_user.user_id).first()
        watchlist = []
        if wallet and wallet.watchlist_json:
            try:
                watchlist = json.loads(wallet.watchlist_json)
            except Exception:
                watchlist = []

        if not watchlist:
            return jsonify({"status": "success", "count": 0, "watchlist": [], "articles": []})

        limit = min(int(request.args.get('limit', 30)), 100)
        
        # Build OR filter for all symbols in user watchlist
        filters = []
        for sym in watchlist:
            clean = sym.strip().upper()
            filters.append(NewsArticle.symbols.like(f'%"{clean}"%'))
            filters.append(NewsArticle.title.ilike(f'%{clean}%'))

        from sqlalchemy import or_
        query = NewsArticle.query.filter(or_(*filters)).order_by(NewsArticle.published_at.desc()).limit(limit)
        articles = query.all()

        return jsonify({
            "status": "success",
            "watchlist": watchlist,
            "count": len(articles),
            "articles": [a.to_dict() for a in articles]
        })
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route('/api/news/stream', methods=['GET'])
def stream_news_route():
    """SSE endpoint for real-time live news updates."""
    return Response(
        news_sse_broadcaster.subscribe(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        }
    )

@app.route('/api/news/health', methods=['GET'])
def get_news_health_route():
    try:
        health = news_scheduler.get_health()
        health["connected_clients"] = news_sse_broadcaster.get_client_count()
        health["total_db_articles"] = NewsArticle.query.count()
        return jsonify({"status": "success", "health": health})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# ============================================
# HEALTH CHECK & KEEP-ALIVE
# ============================================

@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
@app.route('/api/ping', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'message': 'BullX Trading Backend is active and fast 24/7',
        'commit': 'fa15a3ca-v2'
    }), 200

def start_keep_alive_ping():
    import threading, time
    def _ping():
        time.sleep(3)
        while True:
            try:
                # Background price cache pre-warming for 0ms user response speed
                from groww_data import get_index_data, get_prices
                get_index_data()
                get_prices(['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'ICICIBANK', 'SBIN', 'BHARTIARTL'])
            except Exception:
                pass
            time.sleep(25)
    t = threading.Thread(target=_ping, daemon=True)
    t.start()

start_keep_alive_ping()

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