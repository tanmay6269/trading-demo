import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import StockLogo from '../ui/StockLogo';
import PriceChart from './PriceChart';
import TradePanel from './TradePanel';

const EXPIRY_MONTHS = { JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun', JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec' };

// Angel One expiry strings look like "24SEP2026" -> "24 Sep"
const formatExpiry = (expiryStr) => {
    if (!expiryStr) return '';
    const m = expiryStr.trim().toUpperCase().match(/^(\d{1,2})([A-Z]{3})(\d{2,4})$/);
    if (!m) return expiryStr;
    const [, day, mon] = m;
    return `${parseInt(day, 10)} ${EXPIRY_MONTHS[mon] || mon}`;
};

const OptionDetail = ({
    symbol,
    optionMeta = {},
    price,
    balance,
    onBuy = () => {},
    onSell = () => {},
    loading = false,
    onBack = () => {},
    onSelectStock = () => {},
    onOpenOptionChain = () => {},
    showToast = () => {},
}) => {
    const { token, exchange, underlying, expiry, type, strike } = optionMeta;
    const isCall = type === 'CE';

    const [underlyingQuote, setUnderlyingQuote] = useState(null);
    const [ownQuote, setOwnQuote] = useState(null);

    const fetchUnderlyingQuote = useCallback(async () => {
        if (!underlying) return;
        try {
            const data = await api.getPrice(underlying);
            if (data && data.price) setUnderlyingQuote(data);
        } catch (e) {}
    }, [underlying]);

    const fetchOwnQuote = useCallback(async () => {
        if (!symbol) return;
        try {
            const data = await api.getPrice(symbol, token, exchange);
            if (data && data.price) setOwnQuote(data);
        } catch (e) {}
    }, [symbol, token, exchange]);

    useEffect(() => {
        fetchUnderlyingQuote();
        const interval = setInterval(fetchUnderlyingQuote, 10000);
        return () => clearInterval(interval);
    }, [fetchUnderlyingQuote]);

    useEffect(() => {
        fetchOwnQuote();
        const interval = setInterval(fetchOwnQuote, 5000);
        return () => clearInterval(interval);
    }, [fetchOwnQuote]);

    const displayPrice = ownQuote?.price ?? price ?? 0;
    const change = ownQuote?.change ?? 0;
    const changePct = ownQuote?.change_percent ?? 0;
    const isPos = change >= 0;

    const title = `${underlying || ''} ${formatExpiry(expiry)} ${strike ?? ''} ${isCall ? 'Call' : 'Put'}`.replace(/\s+/g, ' ').trim();

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div className="soft-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <button
                        onClick={onBack}
                        style={{
                            background: 'var(--bg-inset)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}
                        title="Back"
                    >
                        ←
                    </button>

                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <StockLogo symbol={underlying} size={44} />
                        <span style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: isCall ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            color: '#ffffff',
                            fontSize: '10px',
                            fontWeight: '800',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '2px solid var(--bg-card)'
                        }}>
                            {isCall ? 'C' : 'P'}
                        </span>
                    </div>

                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '2px' }}>
                            <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                ₹{displayPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                            {ownQuote && (
                                <span style={{ fontSize: '13px', fontWeight: '700', color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                    {isPos ? '+' : ''}{change.toFixed(2)} ({isPos ? '+' : ''}{changePct.toFixed(2)}%) <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>1D</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Live chart, forced to simple line mode like the broker apps */}
                <PriceChart
                    symbol={symbol}
                    token={token}
                    exchange={exchange}
                    forceLine={true}
                    showToast={showToast}
                />
            </div>

            {/* Underlying panel */}
            <div className="soft-card" style={{ padding: '4px' }}>
                <div
                    onClick={() => onSelectStock(underlying)}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-color)'
                    }}
                >
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>{underlying}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>
                            {underlyingQuote?.price ? underlyingQuote.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                        </span>
                        {underlyingQuote?.change_percent !== undefined && (
                            <span style={{
                                fontSize: '12px',
                                fontWeight: '700',
                                color: underlyingQuote.change_percent >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                            }}>
                                ({underlyingQuote.change_percent >= 0 ? '+' : ''}{underlyingQuote.change_percent.toFixed(2)}%)
                            </span>
                        )}
                        <span style={{ color: 'var(--text-muted)' }}>›</span>
                    </div>
                </div>

                <div
                    onClick={() => onOpenOptionChain(underlying)}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        cursor: 'pointer'
                    }}
                >
                    <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>{underlying} Option chain</span>
                    <span style={{ color: 'var(--text-muted)' }}>›</span>
                </div>
            </div>

            {/* Trade panel */}
            <TradePanel
                symbol={symbol}
                price={displayPrice}
                balance={balance}
                onBuy={onBuy}
                onSell={onSell}
                loading={loading}
            />
        </div>
    );
};

export default OptionDetail;
