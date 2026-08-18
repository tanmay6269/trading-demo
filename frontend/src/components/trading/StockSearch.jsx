import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';

const StockSearch = ({ onSelectStock, showToast = () => {} }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [watchlist, setWatchlist] = useState([]);
    const wrapperRef = useRef(null);

    useEffect(() => {
        const fetchWatchlist = async () => {
            try {
                const res = await api.getWatchlist();
                if (res && Array.isArray(res.watchlist)) {
                    setWatchlist(res.watchlist);
                }
            } catch (e) {}
        };
        fetchWatchlist();

        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleWatchlist = async (e, symbol) => {
        e.stopPropagation();
        const isInWatchlist = watchlist.includes(symbol);
        try {
            if (isInWatchlist) {
                await api.removeFromWatchlist(symbol);
                setWatchlist(watchlist.filter(s => s !== symbol));
                showToast(`❌ Removed ${symbol} from Watchlist`);
            } else {
                await api.addToWatchlist(symbol);
                setWatchlist([...watchlist, symbol]);
                showToast(`⭐ Added ${symbol} to Watchlist`);
            }
        } catch (err) {
            showToast('Error updating watchlist');
        }
    };

    const searchStocks = async (searchQuery) => {
        if (!searchQuery || searchQuery.trim().length < 1) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setLoading(true);
        try {
            const data = await api.searchStocks(searchQuery);
            setSuggestions(data || []);
            setShowSuggestions(true);
        } catch (error) {
            console.error('Error searching stocks:', error);
            setSuggestions([]);
        }
        setLoading(false);
    };

    const handleInputChange = (e) => {
        const value = e.target.value.toUpperCase();
        setQuery(value);
        searchStocks(value);
    };

    const handleSelect = (symbol) => {
        setQuery('');
        setShowSuggestions(false);
        onSelectStock(symbol);
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    className="soft-input"
                    placeholder="🔍 Search Indian stocks (e.g., RELIANCE, TCS, HDFCBANK, INFY, SBIN)"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => query.length >= 1 && setShowSuggestions(true)}
                    style={{
                        width: '100%',
                        padding: '14px 20px',
                        paddingRight: '40px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '15px',
                        background: '#111927'
                    }}
                />
                {loading && (
                    <div style={{
                        position: 'absolute',
                        right: '15px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--accent-primary)'
                    }}>
                        ⏳
                    </div>
                )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '6px',
                    background: 'var(--bg-surface)',
                    border: '1px solid #2e4161',
                    borderRadius: 'var(--radius-md)',
                    maxHeight: '360px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
                }}>
                    {suggestions.map((stock) => {
                        const isStarred = watchlist.includes(stock.symbol);
                        return (
                            <div
                                key={stock.symbol}
                                onClick={() => handleSelect(stock.symbol)}
                                style={{
                                    padding: '12px 18px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--border-color)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'background 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        onClick={(e) => toggleWatchlist(e, stock.symbol)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            padding: '2px'
                                        }}
                                        title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                                    >
                                        {isStarred ? '⭐' : '☆'}
                                    </button>
                                    <div>
                                        <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>
                                            {stock.symbol}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            {stock.name}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    {stock.price ? (
                                        <div>
                                            <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>
                                                ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </div>
                                            {stock.change_percent !== undefined && stock.change_percent !== null && (
                                                <div style={{
                                                    fontSize: '12px',
                                                    fontWeight: '700',
                                                    color: (stock.change || 0) >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                                                }}>
                                                    {(stock.change || 0) >= 0 ? '+' : ''}{(stock.change || 0).toFixed(2)} ({(stock.change || 0) >= 0 ? '+' : ''}{(stock.change_percent || 0).toFixed(2)}%)
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Trade ➔</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default StockSearch;