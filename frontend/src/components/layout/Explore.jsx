import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';

const CATEGORY_DEFINITIONS = {
    'large': [
        { symbol: 'RELIANCE', name: 'Reliance Industries' },
        { symbol: 'TCS', name: 'Tata Consultancy Services' },
        { symbol: 'HDFCBANK', name: 'HDFC Bank' },
        { symbol: 'INFY', name: 'Infosys Limited' },
        { symbol: 'ICICIBANK', name: 'ICICI Bank' },
        { symbol: 'SBIN', name: 'State Bank of India' }
    ],
    'mid': [
        { symbol: 'POLYCAB', name: 'Polycab India' },
        { symbol: 'TRENT', name: 'Trent Limited' },
        { symbol: 'DIXON', name: 'Dixon Technologies' },
        { symbol: 'PERSISTENT', name: 'Persistent Systems' },
        { symbol: 'BHEL', name: 'Bharat Heavy Electricals' }
    ],
    'small': [
        { symbol: 'SUZLON', name: 'Suzlon Energy' },
        { symbol: 'IREDA', name: 'Indian Renewable Energy' },
        { symbol: 'CDSL', name: 'Central Depository Services' },
        { symbol: 'OLECTRA', name: 'Olectra Greentech' },
        { symbol: 'MAZDOCK', name: 'Mazagon Dock Shipbuilders' }
    ]
};

const MOST_TRADED_DEFINITIONS = [
    { symbol: 'RELIANCE', name: 'Reliance Industries' },
    { symbol: 'TCS', name: 'Tata Consultancy' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank' },
    { symbol: 'INFY', name: 'Infosys' }
];

const Explore = ({ onSelectStock, onOpenAllIndices, portfolio = [], showToast = () => {} }) => {
    const formatChangeAndPct = (change, pct) => {
        const isPos = (change || 0) >= 0;
        const absChange = Math.abs(change || 0).toFixed(2);
        const absPct = Math.abs(pct || 0).toFixed(2);
        const sign = isPos ? '+' : '-';
        return `${sign}${absChange} (${sign}${absPct}%)`;
    };

    const [indices, setIndices] = useState({});
    const [recentlyViewed, setRecentlyViewed] = useState([]);
    const [watchlist, setWatchlist] = useState([]);
    const [moverTab, setMoverTab] = useState('gainers'); // 'gainers' | 'losers'
    const [categoryTab, setCategoryTab] = useState('large'); // 'large' | 'mid' | 'small'

    // Big Search Bar States
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const searchRef = useRef(null);

    // Real-Time Dynamic Live Quotes State
    const [mostTradedStocks, setMostTradedStocks] = useState(MOST_TRADED_DEFINITIONS.map(s => ({ ...s, price: null, change: 0, change_percent: 0 })));
    const [categoryStocks, setCategoryStocks] = useState({
        large: CATEGORY_DEFINITIONS.large.map(s => ({ ...s, price: null, change: 0, change_percent: 0 })),
        mid: CATEGORY_DEFINITIONS.mid.map(s => ({ ...s, price: null, change: 0, change_percent: 0 })),
        small: CATEGORY_DEFINITIONS.small.map(s => ({ ...s, price: null, change: 0, change_percent: 0 }))
    });

    const loadAllLiveData = useCallback(async () => {
        // 1. Fetch Header Market Indices (Ordered: NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX, FIN NIFTY, MIDCAP NIFTY)
        try {
            const indexData = await api.getIndices();
            if (indexData) setIndices(indexData);
        } catch (e) {
            console.error("Indices load error:", e);
        }

        // 2. Fetch User Watchlist
        try {
            const wlData = await api.getWatchlist();
            if (wlData && Array.isArray(wlData.watchlist)) {
                setWatchlist(wlData.watchlist);
            }
        } catch (e) {
            console.error("Watchlist load error:", e);
        }

        // 3. Fetch Real-Time Batch Quotes for All Stocks on Explore Page
        try {
            const allSymbols = [
                ...MOST_TRADED_DEFINITIONS.map(s => s.symbol),
                ...CATEGORY_DEFINITIONS.large.map(s => s.symbol),
                ...CATEGORY_DEFINITIONS.mid.map(s => s.symbol),
                ...CATEGORY_DEFINITIONS.small.map(s => s.symbol)
            ];

            const quotesMap = await api.getPrices(allSymbols);

            if (quotesMap) {
                // Update Most Traded Live Data
                setMostTradedStocks(MOST_TRADED_DEFINITIONS.map(s => {
                    const q = quotesMap[s.symbol] || {};
                    const priceVal = typeof q === 'object' ? q.price : q;
                    const changeVal = typeof q === 'object' ? (q.change || 0.0) : 0.0;
                    const pctVal = typeof q === 'object' ? (q.change_percent || 0.0) : 0.0;
                    return {
                        ...s,
                        price: priceVal,
                        change: changeVal,
                        change_percent: pctVal
                    };
                }));

                // Update Category Movers Live Data
                const updateCategory = (list) => list.map(s => {
                    const q = quotesMap[s.symbol] || {};
                    const priceVal = typeof q === 'object' ? q.price : q;
                    const changeVal = typeof q === 'object' ? (q.change || 0.0) : 0.0;
                    const pctVal = typeof q === 'object' ? (q.change_percent || 0.0) : 0.0;
                    return {
                        ...s,
                        price: priceVal || 0.0,
                        change: changeVal,
                        change_percent: pctVal
                    };
                });

                setCategoryStocks({
                    large: updateCategory(CATEGORY_DEFINITIONS.large),
                    mid: updateCategory(CATEGORY_DEFINITIONS.mid),
                    small: updateCategory(CATEGORY_DEFINITIONS.small)
                });
            }
        } catch (e) {
            console.error("Error fetching live quotes for explore stocks:", e);
        }
    }, []);

    useEffect(() => {
        loadAllLiveData();

        const saved = localStorage.getItem('recentlyViewed');
        if (saved) {
            try { setRecentlyViewed(JSON.parse(saved)); } catch (e) {}
        }

        const interval = setInterval(loadAllLiveData, 10000);

        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            clearInterval(interval);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [loadAllLiveData]);

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

    const handleSearch = async (query) => {
        setSearchQuery(query);
        if (query.trim().length < 1) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        setSearchLoading(true);
        setShowSearchResults(true);
        try {
            const data = await api.searchStocks(query);
            setSearchResults(data || []);
        } catch (error) {
            console.error('Error searching:', error);
            setSearchResults([]);
        }
        setSearchLoading(false);
    };

    const addToRecentlyViewed = (symbol) => {
        const updated = [symbol, ...recentlyViewed.filter(s => s !== symbol)].slice(0, 8);
        setRecentlyViewed(updated);
        localStorage.setItem('recentlyViewed', JSON.stringify(updated));
    };

    const handleStockClick = (symbol) => {
        addToRecentlyViewed(symbol);
        setShowSearchResults(false);
        setSearchQuery('');
        onSelectStock(symbol);
    };

    // Filter stock data by Gainers / Losers
    const categoryStockList = categoryStocks[categoryTab] || categoryStocks['large'];
    const filteredMovers = categoryStockList.filter(s => moverTab === 'gainers' ? s.change >= 0 : s.change < 0);
    const displayMovers = filteredMovers.length > 0 ? filteredMovers : categoryStockList;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Top Index Ticker Sub-bar (Strict Order: NIFTY 50, SENSEX, BANK NIFTY, INDIA VIX, FIN NIFTY, MIDCAP NIFTY) */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#111927',
                padding: '12px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                gap: '16px',
                overflowX: 'auto'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'nowrap' }}>
                    {Object.keys(indices).length > 0 ? (
                        ['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'INDIA VIX', 'FIN NIFTY', 'MIDCAP NIFTY'].map((name) => {
                            const data = indices[name];
                            if (!data) return null;
                            const isPos = (data.change || 0) >= 0;
                            const symbolToOpen = data.symbol || (name === 'NIFTY 50' ? '^NSEI' : name === 'SENSEX' ? '^BSESN' : name === 'BANK NIFTY' ? '^NSEBANK' : name === 'INDIA VIX' ? '^INDIAVIX' : name);

                            return (
                                <div 
                                    key={name} 
                                    onClick={() => handleStockClick(symbolToOpen)}
                                    title={`Click to view live ${name} interactive candlestick & line chart`}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                                        {name}
                                    </span>
                                    <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                        {data.value ? data.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                                    </span>
                                    <span style={{ 
                                        fontSize: '12px', 
                                        fontWeight: '700',
                                        color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                                    }}>
                                        {formatChangeAndPct(data.change, data.change_percent)}
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading market indices...</span>
                    )}
                </div>

                {/* 🌐 All Indices Button */}
                <button
                    onClick={onOpenAllIndices}
                    title="View All Indian & Global Indices"
                    style={{
                        background: 'linear-gradient(135deg, #182234 0%, #26354d 100%)',
                        border: '1px solid var(--accent-primary)',
                        color: '#ffffff',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                        boxShadow: 'var(--shadow-soft)',
                        transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.04)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
                >
                    <span style={{ fontSize: '16px' }}>🌐</span>
                    <span>All Indices</span>
                </button>
            </div>

            {/* BIG SEARCH BAR RIGHT BELOW THE MARKET TICKER BAR */}
            <div ref={searchRef} style={{ position: 'relative', width: '100%' }}>
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        className="soft-input"
                        placeholder="🔍 Search Groww stocks & indices (e.g., RELIANCE, TCS, HDFCBANK, INFY, SBIN, NIFTY 50...)"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() => searchQuery.length >= 1 && setShowSearchResults(true)}
                        style={{
                            width: '100%',
                            padding: '16px 24px',
                            paddingRight: '48px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '16px',
                            fontWeight: '600',
                            background: '#111927',
                            border: '1px solid var(--accent-primary)',
                            boxShadow: '0 4px 20px rgba(56, 189, 248, 0.15)'
                        }}
                    />
                    {searchLoading && (
                        <div style={{
                            position: 'absolute',
                            right: '18px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--accent-primary)',
                            fontWeight: '700'
                        }}>
                            ⏳
                        </div>
                    )}
                </div>

                {/* Live Search Suggestions Dropdown */}
                {showSearchResults && searchResults.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '8px',
                        background: 'var(--bg-surface)',
                        border: '1px solid #2e4161',
                        borderRadius: 'var(--radius-md)',
                        maxHeight: '360px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
                    }}>
                        {searchResults.map((stock) => {
                            const isStarred = watchlist.includes(stock.symbol);
                            return (
                                <div
                                    key={stock.symbol}
                                    onClick={() => handleStockClick(stock.symbol)}
                                    style={{
                                        padding: '12px 20px',
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
                                                        {formatChangeAndPct(stock.change, stock.change_percent)}
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

            {/* Recently Viewed Options Bar */}
            {recentlyViewed.length > 0 && (
                <div>
                    <h3 style={{ 
                        color: 'var(--text-secondary)', 
                        fontSize: '12px', 
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '10px' 
                    }}>
                        🕒 Recently Viewed
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {recentlyViewed.map((sym) => {
                            const isStarred = watchlist.includes(sym);
                            return (
                                <div
                                    key={sym}
                                    onClick={() => handleStockClick(sym)}
                                    className="soft-btn"
                                    style={{
                                        background: '#111927',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)',
                                        padding: '6px 14px',
                                        borderRadius: '20px',
                                        fontSize: '13px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span>{sym}</span>
                                    <span 
                                        onClick={(e) => toggleWatchlist(e, sym)}
                                        style={{ fontSize: '14px', cursor: 'pointer' }}
                                    >
                                        {isStarred ? '⭐' : '☆'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Groww Main Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                
                {/* Left 2/3 Column: Most Traded Stocks & Category Top Movers */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Most Traded Stocks on Groww Cards (with REAL-TIME Live Prices & % Changes) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                                Most traded stocks on Groww
                            </h3>
                            <span style={{ color: 'var(--accent-emerald)', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                                See more ❯
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
                            {mostTradedStocks.map((stk) => {
                                const isStarred = watchlist.includes(stk.symbol);
                                const isPos = (stk.change || 0) >= 0;

                                return (
                                    <div 
                                        key={stk.symbol} 
                                        onClick={() => handleStockClick(stk.symbol)}
                                        className="soft-card" 
                                        style={{ padding: '16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-emerald)'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{
                                                width: '30px',
                                                height: '30px',
                                                borderRadius: '8px',
                                                background: '#111927',
                                                border: '1px solid var(--border-color)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: '800',
                                                color: 'var(--accent-emerald)',
                                                fontSize: '12px'
                                            }}>
                                                📈
                                            </div>
                                            <button
                                                onClick={(e) => toggleWatchlist(e, stk.symbol)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: '16px'
                                                }}
                                                title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                                            >
                                                {isStarred ? '⭐' : '☆'}
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                            {stk.name}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                {stk.price ? `₹${stk.price.toFixed(2)}` : 'Loading...'}
                                            </div>
                                            {stk.price && (
                                                <div style={{ fontSize: '12px', fontWeight: '700', color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                    {formatChangeAndPct(stk.change, stk.change_percent)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Top Movers Today Section (Gainers/Losers + Stock Category Bar: Large, Mid, Small Cap) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                                Top movers today
                            </h3>
                        </div>

                        {/* Row 1: Gainers vs Losers Tabs */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <button
                                onClick={() => setMoverTab('gainers')}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '20px',
                                    background: moverTab === 'gainers' ? 'var(--accent-emerald)' : '#111927',
                                    color: moverTab === 'gainers' ? '#ffffff' : 'var(--text-secondary)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '700'
                                }}
                            >
                                Gainers
                            </button>
                            <button
                                onClick={() => setMoverTab('losers')}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '20px',
                                    background: moverTab === 'losers' ? 'var(--accent-rose)' : '#111927',
                                    color: moverTab === 'losers' ? '#ffffff' : 'var(--text-secondary)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: '700'
                                }}
                            >
                                Losers
                            </button>
                        </div>

                        {/* Row 2: Category Filter Bar (Large Cap | Mid Cap | Small Cap) */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            marginBottom: '14px', 
                            background: '#111927', 
                            padding: '4px', 
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                            width: 'fit-content'
                        }}>
                            {[
                                { id: 'large', label: 'Large Cap' },
                                { id: 'mid', label: 'Mid Cap' },
                                { id: 'small', label: 'Small Cap' }
                            ].map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategoryTab(cat.id)}
                                    style={{
                                        padding: '5px 14px',
                                        borderRadius: '6px',
                                        background: categoryTab === cat.id ? '#212e44' : 'transparent',
                                        color: categoryTab === cat.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        border: categoryTab === cat.id ? '1px solid var(--accent-primary)' : 'none',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: '700'
                                    }}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Top Movers Stock List Table with Live Prices & Day Change % */}
                        <div className="soft-card" style={{ padding: '0', overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: '#111927' }}>
                                        <th style={{ padding: '12px 16px' }}>COMPANY</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>MARKET PRICE (1D)</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>DAY CHANGE</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>WATCHLIST</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayMovers.map((row) => {
                                        const isPos = (row.change || 0) >= 0;
                                        const isStarred = watchlist.includes(row.symbol);

                                        return (
                                            <tr 
                                                key={row.symbol} 
                                                onClick={() => handleStockClick(row.symbol)}
                                                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                                    {row.name} ({row.symbol})
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '800', color: 'var(--text-primary)' }}>
                                                    {row.price ? `₹${row.price.toFixed(2)}` : 'Loading...'}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                    {formatChangeAndPct(row.change, row.change_percent)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <button
                                                        onClick={(e) => toggleWatchlist(e, row.symbol)}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            fontSize: '16px'
                                                        }}
                                                        title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                                                    >
                                                        {isStarred ? '⭐' : '☆'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right 1/3 Column: Your Investments & Products/Tools */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Your Investments Card */}
                    <div className="soft-card" style={{ padding: '24px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800', marginBottom: '16px' }}>
                            Your investments
                        </h3>

                        {portfolio && portfolio.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Active Equities:</div>
                                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-emerald)' }}>
                                    ₹{portfolio.reduce((sum, i) => sum + (i.current_value || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎨</div>
                                <div style={{ fontWeight: '600', fontSize: '14px' }}>You haven't invested yet</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Start paper trading with ₹1,00,000 demo funds!</div>
                            </div>
                        )}
                    </div>

                    {/* Products & Tools Menu */}
                    <div className="soft-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800', marginBottom: '14px' }}>
                            Products & Tools
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {[
                                { title: 'IPO', badge: '7 open', icon: '📢' },
                                { title: 'Bonds', badge: '6 open', icon: '📜' },
                                { title: 'ETFs', icon: '📊' },
                                { title: 'Intraday Screener', icon: '⌛' },
                                { title: 'Stocks SIP', icon: '📅' },
                                { title: 'MTF stocks', icon: '💼' }
                            ].map((item) => (
                                <div
                                    key={item.title}
                                    style={{
                                        padding: '12px 14px',
                                        borderRadius: 'var(--radius-sm)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span style={{ fontSize: '18px' }}>{item.icon}</span>
                                        <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
                                            {item.title}
                                        </span>
                                    </div>
                                    {item.badge && (
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            padding: '2px 8px',
                                            borderRadius: '10px',
                                            background: 'var(--accent-emerald-soft)',
                                            color: 'var(--accent-emerald)'
                                        }}>
                                            {item.badge}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Explore;