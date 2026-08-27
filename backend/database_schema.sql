-- ==========================================================
-- PostgreSQL Database Schema for BullX Broker Platform
-- Implements Option Chain, Instruments, Market Depth & Trading Ledger
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    account_status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_credentials (
    credential_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    login_pin_hash VARCHAR(255),
    biometric_enabled BOOLEAN DEFAULT FALSE,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    last_password_change TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transaction_pin (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    tpin_hash VARCHAR(255) NOT NULL,
    failed_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    set_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_wallets (
    wallet_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    cash_balance DOUBLE PRECISION DEFAULT 1000000.0,
    margin_used DOUBLE PRECISION DEFAULT 0.0,
    reserved_balance DOUBLE PRECISION DEFAULT 0.0,
    watchlist TEXT DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS instruments (
    instrument_token VARCHAR(50) PRIMARY KEY,
    exchange VARCHAR(10) NOT NULL,
    tradingsymbol VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    expiry VARCHAR(20),
    strike DOUBLE PRECISION,
    tick_size DOUBLE PRECISION DEFAULT 0.05,
    lot_size INT DEFAULT 1,
    instrument_type VARCHAR(10) DEFAULT 'EQ',
    segment VARCHAR(10) DEFAULT 'NSE',
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inst_exchange ON instruments(exchange);
CREATE INDEX IF NOT EXISTS idx_inst_name ON instruments(name);
CREATE INDEX IF NOT EXISTS idx_inst_expiry ON instruments(expiry);
CREATE INDEX IF NOT EXISTS idx_inst_strike ON instruments(strike);

CREATE TABLE IF NOT EXISTS option_chain_snapshots (
    id SERIAL PRIMARY KEY,
    underlying VARCHAR(30) NOT NULL,
    exchange VARCHAR(10) DEFAULT 'NSE',
    expiry VARCHAR(20) NOT NULL,
    spot_price DOUBLE PRECISION NOT NULL,
    pcr DOUBLE PRECISION,
    max_pain DOUBLE PRECISION,
    lot_size INT DEFAULT 25,
    chain_json JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ocs_underlying ON option_chain_snapshots(underlying);
CREATE INDEX IF NOT EXISTS idx_ocs_expiry ON option_chain_snapshots(expiry);
CREATE INDEX IF NOT EXISTS idx_ocs_created_at ON option_chain_snapshots(created_at);

CREATE TABLE IF NOT EXISTS market_depth_snapshots (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    ltp DOUBLE PRECISION NOT NULL,
    total_buy_qty BIGINT DEFAULT 0,
    total_sell_qty BIGINT DEFAULT 0,
    depth_json JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_md_symbol ON market_depth_snapshots(symbol);

CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    trade_type VARCHAR(10) NOT NULL,
    quantity INT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    trade_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'OPEN',
    pnl DOUBLE PRECISION DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
