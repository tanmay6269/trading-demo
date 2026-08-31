import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';
import StockLogo from '../ui/StockLogo';

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

const SEE_MORE_STOCKS_DEFINITIONS = [
    { symbol: 'RELIANCE', name: 'Reliance Industries' },
    { symbol: 'TCS', name: 'Tata Consultancy Services' },
    { symbol: 'HDFCBANK', name: 'HDFC Bank' },
    { symbol: 'INFY', name: 'Infosys Limited' },
    { symbol: 'ICICIBANK', name: 'ICICI Bank' },
    { symbol: 'SBIN', name: 'State Bank of India' },
    { symbol: 'TATAMOTORS', name: 'Tata Motors' },
    { symbol: 'BHARTIARTL', name: 'Bharti Airtel' },
    { symbol: 'MARUTI', name: 'Maruti Suzuki' },
    { symbol: 'WIPRO', name: 'Wipro Limited' },
    { symbol: 'ITC', name: 'ITC Limited' },
    { symbol: 'LT', name: 'Larsen & Toubro' },
    { symbol: 'TITAN', name: 'Titan Company' },
    { symbol: 'ASIANPAINT', name: 'Asian Paints' },
    { symbol: 'BAJFINANCE', name: 'Bajaj Finance' },
    { symbol: 'SUNPHARMA', name: 'Sun Pharma' }
];

const Explore = ({ onSelectStock, onOpenAllIndices, onOpenOptionChain, portfolio = [], showToast = () => {}, onViewHoldings }) => {
    const formatChangeAndPct = (change, pct) => {
        const changeNum = typeof change === 'number' ? change : (parseFloat(change) || 0);
        const pctNum = typeof pct === 'number' ? pct : (parseFloat(pct) || 0);
        const isPos = changeNum >= 0;
        const absChange = Math.abs(changeNum).toFixed(2);
        const absPct = Math.abs(pctNum).toFixed(2);
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
    const [showSeeMoreModal, setShowSeeMoreModal] = useState(false);
    const [mostTradedStocks, setMostTradedStocks] = useState(MOST_TRADED_DEFINITIONS.map(s => ({ ...s, price: null, change: 0, change_percent: 0 })));
    const [seeMoreStocks, setSeeMoreStocks] = useState(SEE_MORE_STOCKS_DEFINITIONS.map(s => ({ ...s, price: null, change: 0, change_percent: 0 })));
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
            console.error("Index load error:", e);
        }

        // 2. Load Watchlist
        try {
            const wlData = await api.getWatchlist();
            if (Array.isArray(wlData)) {
                setWatchlist(wlData.map((item) => item.symbol));
            }
        } catch (e) {
            console.error("Watchlist load error:", e);
        }

        // 3. Fetch Real-Time Batch Quotes for All Stocks on Explore Page
        try {
            const allSymbols = [
                ...MOST_TRADED_DEFINITIONS.map(s => s.symbol),
                ...SEE_MORE_STOCKS_DEFINITIONS.map(s => s.symbol),
                ...CATEGORY_DEFINITIONS.large.map(s => s.symbol),
                ...CATEGORY_DEFINITIONS.mid.map(s => s.symbol),
                ...CATEGORY_DEFINITIONS.small.map(s => s.symbol)
            ];

            const quotesMap = await api.getPrices(allSymbols);

            if (quotesMap) {
                const mapStockQuotes = (defs) => defs.map(s => {
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
                });

                // Update Most Traded Live Data
                setMostTradedStocks(mapStockQuotes(MOST_TRADED_DEFINITIONS));
                setSeeMoreStocks(mapStockQuotes(SEE_MORE_STOCKS_DEFINITIONS));

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

        const interval = setInterval(loadAllLiveData, 3000);

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
                background: 'var(--bg-surface)',
                padding: '12px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-card)',
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

                {/* All Indices Button */}
                <button
                    onClick={onOpenAllIndices}
                    title="View All Indian & Global Indices"
                    className="soft-btn soft-btn-ghost"
                    style={{
                        padding: '7px 14px',
                        fontSize: '12px'
                    }}
                >
                    All Indices
                </button>
            </div>

            {/* BIG SEARCH BAR RIGHT BELOW THE MARKET TICKER BAR */}
            <div ref={searchRef} style={{ position: 'relative', width: '100%' }}>
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        className="soft-input"
                        placeholder="Search stocks & indices (e.g. RELIANCE, TCS, HDFCBANK)..."
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() => searchQuery.length >= 1 && setShowSearchResults(true)}
                        style={{
                            width: '100%',
                            padding: '16px 24px',
                            paddingRight: '48px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '15px',
                            fontWeight: '500',
                            background: 'var(--bg-surface)',
                            border: '2px solid var(--border-color)',
                            boxShadow: 'var(--shadow-card)'
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
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21 12a9 9 0 0 1-9 9c-2.5 0-4.8-1-6.5-2.7L21 4.7" />
                                <path d="M9 4.5A9 9 0 0 1 21 12" />
                            </svg>
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
                        border: '1px solid var(--border-color-strong)',
                        borderRadius: 'var(--radius-md)',
                        maxHeight: '400px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 16px 40px rgba(0,0,0,0.6)'
                    }}>
                        {searchResults.map((stock) => {
                            const isStarred = watchlist.includes(stock.symbol);
                            const isOption = stock.type === 'option';
                            const isCall = stock.option_type === 'CE' || (stock.name && stock.name.includes('Call'));
                            
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
                                        
                                        {isOption ? (
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '8px',
                                                background: isCall ? 'rgba(0, 184, 148, 0.15)' : 'rgba(255, 118, 117, 0.15)',
                                                color: isCall ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '11px',
                                                fontWeight: '900',
                                                border: `1px solid ${isCall ? 'rgba(0, 184, 148, 0.4)' : 'rgba(255, 118, 117, 0.4)'}`
                                            }}>
                                                {isCall ? 'CE' : 'PE'}
                                            </div>
                                        ) : (
                                            <StockLogo symbol={stock.symbol} name={stock.name} size={36} />
                                        )}

                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>
                                                    {stock.display_name || stock.symbol}
                                                </span>
                                                {isOption && (
                                                    <span style={{
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '10px',
                                                        fontWeight: '800',
                                                        background: isCall ? 'rgba(0, 184, 148, 0.2)' : 'rgba(255, 118, 117, 0.2)',
                                                        color: isCall ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                                                    }}>
                                                        {isCall ? 'CALL' : 'PUT'}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                {stock.name} {stock.expiry ? `• Exp: ${stock.expiry}` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        {stock.has_option_chain && onOpenOptionChain && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowSearchResults(false);
                                                    onOpenOptionChain(stock.underlying || stock.symbol);
                                                }}
                                                style={{
                                                    background: 'rgba(108, 92, 231, 0.15)',
                                                    color: 'var(--accent-primary)',
                                                    border: '1px solid var(--accent-primary)',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                                title="Open Live Option Chain Matrix"
                                            >
                                                Option Chain
                                            </button>
                                        )}

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
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Recently Viewed Options Bar */}
            {recentlyViewed.length > 0 && (
                <div>
                    <h3 className="sec-label" style={{ marginBottom: '10px' }}>
                        Recently Viewed
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {recentlyViewed.map((sym) => {
                            const isStarred = watchlist.includes(sym);
                            return (
                                <div
                                    key={sym}
                                    onClick={() => handleStockClick(sym)}
                                    className="soft-btn soft-btn-ghost"
                                    style={{
                                        padding: '7px 14px',
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
                                Most traded stocks on BullX
                            </h3>
                            <span 
                                onClick={() => setShowSeeMoreModal(true)} 
                                style={{ color: 'var(--accent-primary)', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                            >
                                See all
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
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-primary)'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <StockLogo symbol={stk.symbol} name={stk.name} size={36} />
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
                                    background: moverTab === 'gainers' ? 'var(--accent-emerald)' : 'var(--bg-inset)',
                                    color: moverTab === 'gainers' ? '#ffffff' : 'var(--text-secondary)',
                                    border: moverTab === 'gainers' ? 'none' : '1px solid var(--border-color)',
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
                                    background: moverTab === 'losers' ? 'var(--accent-rose)' : 'var(--bg-inset)',
                                    color: moverTab === 'losers' ? '#ffffff' : 'var(--text-secondary)',
                                    border: moverTab === 'losers' ? 'none' : '1px solid var(--border-color)',
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
                            background: 'var(--bg-inset)', 
                            padding: '4px', 
                            borderRadius: 'var(--radius-md)',
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
                                        padding: '6px 16px',
                                        borderRadius: 'var(--radius-sm)',
                                        background: categoryTab === cat.id ? 'var(--accent-primary)' : 'transparent',
                                        color: categoryTab === cat.id ? '#ffffff' : 'var(--text-secondary)',
                                        border: 'none',
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
                        <div className="soft-card" style={{ padding: '0', overflow: 'hidden' }}>
                            <table className="bx-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-inset)' }}>
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
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <StockLogo symbol={row.symbol} name={row.name} size={32} />
                                                        <div>
                                                            <div>{row.name}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>{row.symbol}</div>
                                                        </div>
                                                    </div>
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
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '700', marginBottom: '18px' }}>
                            Your investments
                        </h3>

                        {portfolio && portfolio.length > 0 ? (
                            <>
                                <div style={{

                                    background: 'var(--accent-emerald-soft)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '16px 18px',
                                    marginBottom: '14px'
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px' }}>
                                        Active Equities Value
                                    </div>
                                    <div style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                                        ₹{portfolio.reduce((sum, i) => sum + (i.current_value || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-emerald)', marginTop: '6px' }}>
                                        ● {portfolio.length} holdings
                                    </div>
                                </div>
                                <button
                                    onClick={onViewHoldings}
                                    className="soft-btn-primary"
                                    style={{ width: '100%', padding: '12px' }}
                                >
                                    View Holdings
                                </button>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--text-secondary)' }}>
                                <div style={{
                                    width: '64px',
                                    height: '64px',
                                    margin: '0 auto 14px',
                                    borderRadius: '20px',
                                    background: 'var(--accent-primary-soft)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16v16H4z" />
                                        <path d="M4 9h16" />
                                        <path d="M9 9v8M15 9v8" />
                                    </svg>
                                </div>
                                <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>No investments yet</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
                                    Start paper trading with ₹1,00,000 demo funds.
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Products & Tools Menu */}
                    <div className="soft-card" style={{ padding: '20px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '700', marginBottom: '14px' }}>
                            Products & Tools
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {[
                                { title: 'IPO', badge: '7 open', icon: 'M12 3v18M3 12h18M5 5l14 14M19 5L5 19', accent: 'var(--accent-rose)' },
                                { title: 'Bonds', badge: '6 open', icon: 'M8 6h8M8 12h8M8 18h8', accent: 'var(--accent-primary)' },
                                { title: 'ETFs', icon: 'M4 4h16v16H4zM4 9h16M9 4v5', accent: 'var(--accent-emerald)' },
                                { title: 'Intraday Screener', icon: 'M21 12a9 9 0 1 1-9-9M21 3l-9 9M15 3h6v6', accent: 'var(--accent-amber)' },
                                { title: 'Stocks SIP', icon: 'M3 20h18M5 20V10M12 20V4M19 20V13', accent: 'var(--accent-primary)' },
                                { title: 'MTF stocks', icon: 'M3 13l9-8 9 8M5 11v9h5v-5h4v5h5v-9', accent: 'var(--accent-emerald)' }
                            ].map((item) => (
                                <div
                                    key={item.title}
                                    style={{
                                        padding: '11px 10px',
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
                                        <span style={{
                                            width: '36px',
                                            height: '36px',
                                            borderRadius: '11px',
                                            background: 'var(--bg-inset)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: item.accent
                                        }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d={item.icon} />
                                            </svg>
                                        </span>
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
                                            background: 'var(--bg-inset)',
                                            color: 'var(--text-secondary)'
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

            {/* SEE MORE MOST TRADED STOCKS ON BULLX MODAL */}
            {showSeeMoreModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(5, 10, 20, 0.85)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div className="soft-card fade-in" style={{
                        width: '100%',
                        maxWidth: '780px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '24px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-lg)'
                    }}>
                        {/* Modal Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)' }}>
                            <div>
                                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '20px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Most Traded Stocks
                                </h2>
                                <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                    Top 16 highest volume Indian equities with live price updates
                                </p>
                            </div>
                            <button
                                onClick={() => setShowSeeMoreModal(false)}
                                style={{
                                    background: 'var(--bg-inset)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-secondary)',
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '700'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Stock List Table */}
                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-inset)' }}>
                                        <th style={{ padding: '12px 16px' }}>COMPANY</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>MARKET PRICE</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>1D CHANGE</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>ACTION</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {seeMoreStocks.map((stk) => {
                                        const isPos = (stk.change || 0) >= 0;
                                        const isStarred = watchlist.includes(stk.symbol);
                                        return (
                                            <tr
                                                key={stk.symbol}
                                                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                onClick={() => {
                                                    setShowSeeMoreModal(false);
                                                    handleStockClick(stk.symbol);
                                                }}
                                            >
                                                <td style={{ padding: '12px 16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <StockLogo symbol={stk.symbol} name={stk.name} size={36} />
                                                        <div>
                                                            <div style={{ fontSize: '14px', fontWeight: '800' }}>{stk.name}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>{stk.symbol}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '800', color: 'var(--text-primary)', fontSize: '14px' }}>
                                                    {stk.price ? `₹${stk.price.toFixed(2)}` : 'Loading...'}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontSize: '13px' }}>
                                                    {formatChangeAndPct(stk.change, stk.change_percent)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                        <button
                                                            onClick={(e) => toggleWatchlist(e, stk.symbol)}
                                                            style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                                                            title={isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}
                                                        >
                                                            {isStarred ? '⭐' : '☆'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setShowSeeMoreModal(false);
                                                                handleStockClick(stk.symbol);
                                                            }}
                                                            className="soft-btn soft-btn-primary"
                                                            style={{ padding: '6px 14px', fontSize: '12px' }}
                                                        >
                                                            Trade ➔
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Explore;