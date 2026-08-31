import React, { useState, useEffect } from 'react';
import api from '../../api';
import StockLogo from '../ui/StockLogo';

const Watchlist = ({ onSelectStock }) => {
    const [watchlist, setWatchlist] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newSymbol, setNewSymbol] = useState('');
    const [actionMsg, setActionMsg] = useState('');

    useEffect(() => {
        fetchWatchlist();
    }, []);

    const fetchWatchlist = async () => {
        try {
            const data = await api.getWatchlist();
            setWatchlist(data || []);
        } catch (error) {
            console.error('Error fetching watchlist:', error);
        }
        setLoading(false);
    };

    const handleAdd = async () => {
        if (!newSymbol.trim()) return;
        try {
            const data = await api.addToWatchlist(newSymbol.trim().toUpperCase());
            setActionMsg(data.message || 'Stock added');
            setNewSymbol('');
            fetchWatchlist();
        } catch (error) {
            setActionMsg(error.message || 'Failed to add stock');
        }
        setTimeout(() => setActionMsg(''), 3000);
    };

    const handleRemove = async (symbol) => {
        try {
            await api.removeFromWatchlist(symbol);
            fetchWatchlist();
        } catch (error) {
            console.error('Error removing from watchlist:', error);
        }
    };

    if (loading) {
        return <div className="soft-card" style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading watchlist...</div>;
    }

    return (
        <div className="soft-card fade-in" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                My Watchlist
            </h3>

            {actionMsg && (
                <div style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-emerald-soft)',
                    color: 'var(--accent-emerald)',
                    fontSize: '13px',
                    fontWeight: '600',
                    marginBottom: '16px'
                }}>
                    {actionMsg}
                </div>
            )}
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="Enter Stock Symbol (e.g., RELIANCE, TCS, INFY)"
                    className="soft-input"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    style={{ flex: 1, padding: '12px 16px' }}
                />
                <button
                    onClick={handleAdd}
                    className="soft-btn soft-btn-primary"
                    style={{ padding: '12px 24px' }}
                >
                    + Add Stock
                </button>
            </div>

            {watchlist.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Your watchlist is empty. Add your favorite Indian stocks above!
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {watchlist.map((item) => (
                        <div
                            key={item.symbol}
                            onClick={() => onSelectStock(item.symbol)}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '14px 18px',
                                background: 'var(--bg-inset)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                e.currentTarget.style.transform = 'translateX(4px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-color)';
                                e.currentTarget.style.transform = 'translateX(0)';
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <StockLogo symbol={item.symbol} name={item.name} size={36} />
                                <div>
                                    <div style={{ fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)' }}>{item.symbol}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.name}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <span style={{ fontWeight: '800', fontSize: '15px', color: 'var(--accent-emerald)' }}>
                                    ₹{item.price ? item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : 'N/A'}
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectStock && onSelectStock(item.symbol);
                                    }}
                                    style={{
                                        background: 'var(--accent-primary-soft)',
                                        border: '1px solid var(--accent-primary)',
                                        color: 'var(--accent-primary)',
                                        borderRadius: '4px',
                                        padding: '3px 8px',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                    title={`View ${item.symbol} news`}
                                >
                                    📰 News
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemove(item.symbol);
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--accent-rose)',
                                        cursor: 'pointer',
                                        fontSize: '18px',
                                        padding: '4px'
                                    }}
                                    title="Remove from watchlist"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Watchlist;