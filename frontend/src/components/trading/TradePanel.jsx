import React, { useState } from 'react';

const TradePanel = ({ symbol, price, balance, onBuy, onSell, loading }) => {
    const isOption = symbol && /^([A-Z\s^]+?)(?:([0-9]{2}[A-Z]{3})([0-9.]+)(CE|PE)|([0-9.]+)(CE|PE))$/i.test(symbol.trim());
    const isFutures = symbol && /^([A-Z\s^]+?)(?:([0-9]{2}[A-Z]{3})?FUT)$/i.test(symbol.trim());
    const isDerivatives = isOption || isFutures;

    const getLotSize = (sym) => {
        if (!sym) return 1;
        const u = sym.toUpperCase();
        if (u.includes('NIFTY 50') || (u.startsWith('NIFTY') && !u.includes('BANK') && !u.includes('FIN') && !u.includes('MID'))) return 25;
        if (u.includes('BANKNIFTY') || u.includes('BANK NIFTY')) return 15;
        if (u.includes('FINNIFTY') || u.includes('FIN NIFTY')) return 25;
        if (u.includes('MIDCPNIFTY') || u.includes('MIDCAP')) return 50;
        if (u.includes('SENSEX')) return 10;
        if (u.startsWith('RELIANCE')) return 250;
        if (u.startsWith('TCS')) return 175;
        if (u.startsWith('INFY')) return 400;
        if (u.startsWith('HDFCBANK')) return 550;
        if (u.startsWith('ICICIBANK')) return 700;
        if (u.startsWith('SBIN')) return 750;
        if (u.startsWith('TATAMOTORS')) return 700;
        if (u.startsWith('BHARTIARTL')) return 475;
        if (u.startsWith('ITC')) return 1600;
        if (u.startsWith('WIPRO')) return 1500;
        if (u.startsWith('MARUTI')) return 50;
        if (u.startsWith('LT')) return 150;
        if (u.startsWith('TITAN')) return 175;
        if (u.startsWith('BAJFINANCE')) return 125;
        if (u.startsWith('SUNPHARMA')) return 350;
        if (u.startsWith('ZOMATO')) return 2000;
        return isDerivatives ? 100 : 1;
    };

    const lotSize = isDerivatives ? getLotSize(symbol) : 1;
    const [quantity, setQuantity] = useState(isDerivatives ? lotSize : 1);
    const [tradeType, setTradeType] = useState('BUY');
    const [orderType, setOrderType] = useState('MARKET');
    const [tradeMode, setTradeMode] = useState(isDerivatives ? 'NRML (Overnight)' : 'DELIVERY (CNC)');

    const totalCost = price ? price * quantity : 0;
    const canAfford = (balance || 0) >= totalCost;
    const numLots = isDerivatives ? Math.max(1, Math.round(quantity / lotSize)) : quantity;

    return (
        <div className="soft-card fade-in" style={{ padding: '24px' }}>
            {/* Buy / Sell Tab Toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--bg-inset)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <button
                    onClick={() => setTradeType('BUY')}
                    style={{
                        flex: 1,
                        padding: '11px',
                        background: tradeType === 'BUY' ? 'var(--accent-emerald)' : 'transparent',
                        color: tradeType === 'BUY' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '14px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    BUY
                </button>
                <button
                    onClick={() => setTradeType('SELL')}
                    style={{
                        flex: 1,
                        padding: '11px',
                        background: tradeType === 'SELL' ? 'var(--accent-rose)' : 'transparent',
                        color: tradeType === 'SELL' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '14px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    SELL
                </button>
            </div>

            {/* Product Type Chips */}
            <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '20px'
            }}>
                {(isDerivatives ? ['NRML (Overnight)', 'MIS (Intraday)'] : ['DELIVERY (CNC)', 'INTRADAY (MIS)']).map((mode) => (
                    <button
                        key={mode}
                        onClick={() => setTradeMode(mode)}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: tradeMode === mode ? 'var(--bg-surface-hover)' : 'var(--bg-inset)',
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

            {/* Quantity Selector with Lot Size Support */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '600' }}>
                        Quantity {isDerivatives ? `(${numLots} Lot${numLots > 1 ? 's' : ''} = ${quantity} Qty)` : '(Shares)'}
                    </label>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {isDerivatives ? `Lot Size: ${lotSize} | ` : ''}Live Price: ₹{price ? price.toFixed(2) : '---'}
                    </span>
                </div>
                <input
                    type="number"
                    min={lotSize}
                    step={lotSize}
                    className="soft-input"
                    value={quantity}
                    onChange={(e) => {
                        const val = parseInt(e.target.value) || lotSize;
                        setQuantity(Math.max(lotSize, val));
                    }}
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
                    {(isDerivatives ? [1, 2, 5, 10, 20] : [1, 5, 10, 50, 100]).map((multiplier) => {
                        const targetQty = isDerivatives ? multiplier * lotSize : multiplier;
                        return (
                            <button
                                key={multiplier}
                                onClick={() => setQuantity(targetQty)}
                                style={{
                                    flex: 1,
                                    padding: '5px',
                                    background: quantity === targetQty ? 'var(--bg-surface-hover)' : 'var(--bg-inset)',
                                    color: quantity === targetQty ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '600'
                                }}
                            >
                                {isDerivatives ? `${multiplier}L` : `+${multiplier}`}
                            </button>
                        );
                    })}
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
                background: 'var(--bg-inset)',
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
                <p style={{ color: 'var(--accent-rose)', textAlign: 'center', marginTop: '10px', fontSize: '12px', fontWeight: '600' }}>
                    Insufficient funds. Add cash to continue.
                </p>
            )}
        </div>
    );
};

export default TradePanel;