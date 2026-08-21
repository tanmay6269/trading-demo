import React, { useState } from 'react';

const TradePanel = ({ symbol, price, balance, onBuy, onSell, loading }) => {
    const [quantity, setQuantity] = useState(1);
    const [tradeType, setTradeType] = useState('BUY');
    const [orderType, setOrderType] = useState('MARKET');
    const [tradeMode, setTradeMode] = useState('DELIVERY');

    const totalCost = price ? price * quantity : 0;
    const canAfford = (balance || 0) >= totalCost;

    return (
        <div className="soft-card fade-in" style={{ padding: '24px' }}>
            {/* Buy / Sell Tab Toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: '#0b0f19', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                    onClick={() => setTradeType('BUY')}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: tradeType === 'BUY' ? '#00d09c' : 'transparent',
                        color: tradeType === 'BUY' ? '#000000' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '14px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    BUY {symbol}
                </button>
                <button
                    onClick={() => setTradeType('SELL')}
                    style={{
                        flex: 1,
                        padding: '10px',
                        background: tradeType === 'SELL' ? '#eb5b56' : 'transparent',
                        color: tradeType === 'SELL' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '14px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    SELL {symbol}
                </button>
            </div>

            {/* Product Type Chips */}
            <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '20px'
            }}>
                {['DELIVERY (CNC)', 'INTRADAY (MIS)'].map((mode) => (
                    <button
                        key={mode}
                        onClick={() => setTradeMode(mode)}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: tradeMode === mode ? '#212e44' : '#111927',
                            color: tradeMode === mode ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            border: tradeMode === mode ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600'
                        }}
                    >
                        {mode}
                    </button>
                ))}
            </div>

            {/* Quantity Selector with Quick Multipliers */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600' }}>
                        Quantity (Shares)
                    </label>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        Live Price: ₹{price ? price.toFixed(2) : '---'}
                    </span>
                </div>
                <input
                    type="number"
                    min="1"
                    className="soft-input"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        fontSize: '16px',
                        fontWeight: '700',
                        borderRadius: 'var(--radius-sm)'
                    }}
                />

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {[1, 5, 10, 50, 100].map((q) => (
                        <button
                            key={q}
                            onClick={() => setQuantity(q)}
                            style={{
                                flex: 1,
                                padding: '5px',
                                background: quantity === q ? '#212e44' : '#111927',
                                color: quantity === q ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600'
                            }}
                        >
                            +{q}
                        </button>
                    ))}
                </div>
            </div>

            {/* Order Type */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600' }}>
                    Order Type
                </label>
                <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="soft-input"
                    style={{ width: '100%', padding: '10px 14px' }}
                >
                    <option value="MARKET">Market Order (At Current Price)</option>
                    <option value="LIMIT">Limit Order</option>
                </select>
            </div>

            {/* Order Summary Box */}
            <div style={{ 
                background: '#111927',
                padding: '14px 18px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Available Demo Funds:</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>
                        ₹{(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Required Funds:</span>
                    <span style={{ fontWeight: '800', color: canAfford ? 'var(--text-primary)' : 'var(--accent-rose)' }}>
                        ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Submit Action Button */}
            <button
                onClick={() => {
                    if (tradeType === 'BUY') {
                        onBuy(quantity);
                    } else {
                        onSell(quantity);
                    }
                }}
                disabled={loading || !price || (tradeType === 'BUY' && !canAfford)}
                className={`soft-btn ${tradeType === 'BUY' ? 'soft-btn-success' : 'soft-btn-danger'}`}
                style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '16px',
                    fontWeight: '800',
                    borderRadius: 'var(--radius-md)',
                    opacity: loading || !price || (tradeType === 'BUY' && !canAfford) ? 0.5 : 1
                }}
            >
                {loading ? 'Processing Order...' : `${tradeType} ${quantity} SHARES OF ${symbol}`}
            </button>

            {tradeType === 'BUY' && !canAfford && (
                <p style={{ color: 'var(--accent-rose)', textAlign: 'center', marginTop: '10px', fontSize: '12px' }}>
                    ⚠️ Insufficient demo cash. Top up your funds in the Recharge tab.
                </p>
            )}
        </div>
    );
};

export default TradePanel;