import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, API_BASE_URL } from '../../api';

// Helper for relative time from publishedAt
const getRelativeTime = (dateStr) => {
    if (!dateStr) return 'just now';
    try {
        const published = new Date(dateStr);
        const now = new Date();
        const diffMs = now - published;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 45) return 'just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays === 1) return '1d';
        if (diffDays < 7) return `${diffDays}d`;
        return published.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
        return 'just now';
    }
};

// Helper for date formatting
const formatDateHeader = (dateStr) => {
    if (!dateStr) return 'TODAY';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    } catch {
        return 'TODAY';
    }
};

const CATEGORIES = [
    { id: 'ALL', label: 'All' },
    { id: 'STOCKS', label: 'Stocks' },
    { id: 'GLOBAL', label: 'Global' },
    { id: 'COMMODITIES', label: 'Commodities' },
    { id: 'RESULTS', label: 'Results' },
    { id: 'IPO', label: 'IPO' },
    { id: 'CORPORATE', label: 'Corporate' },
    { id: 'OTHER', label: 'Other' },
];

export const NewsTerminal = ({ onSelectStock }) => {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('CONNECTING'); // 'LIVE' | 'CONNECTING' | 'OFFLINE'
    const [unreadCount, setUnreadCount] = useState(0);
    const [isAtTop, setIsAtTop] = useState(true);

    const containerRef = useRef(null);
    const eventSourceRef = useRef(null);
    const pendingArticlesRef = useRef([]);

    // Fetch initial news
    const fetchNews = useCallback(async (cat = selectedCategory, offset = 0, isAppend = false) => {
        try {
            if (offset === 0) setLoading(true);
            else setLoadingMore(true);

            let res;
            if (searchQuery.trim()) {
                res = await api.searchNews(searchQuery.trim());
            } else {
                res = await api.getNews(30, offset, cat);
            }

            const newItems = res.articles || [];
            if (isAppend) {
                setArticles(prev => {
                    const existingIds = new Set(prev.map(a => a.id));
                    const uniqueNew = newItems.filter(a => !existingIds.has(a.id));
                    return [...prev, ...uniqueNew];
                });
            } else {
                setArticles(newItems);
            }

            setHasMore(newItems.length >= 30 && !searchQuery.trim());
        } catch (err) {
            console.error('Failed to load news feed:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [selectedCategory, searchQuery]);

    // Initial load and filter change
    useEffect(() => {
        fetchNews(selectedCategory, 0, false);
    }, [selectedCategory, fetchNews]);

    // Handle Search with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchNews(selectedCategory, 0, false);
        }, 350);
        return () => clearTimeout(timer);
    }, [searchQuery, selectedCategory, fetchNews]);

    // Setup SSE connection for real-time live news updates
    useEffect(() => {
        let reconnectTimeout;
        const connectSSE = () => {
            try {
                const sseUrl = `${API_BASE_URL}/news/stream`;
                const es = new EventSource(sseUrl);
                eventSourceRef.current = es;

                es.addEventListener('connected', () => {
                    setConnectionStatus('LIVE');
                });

                es.addEventListener('heartbeat', () => {
                    setConnectionStatus('LIVE');
                });

                es.addEventListener('NEW_NEWS', (event) => {
                    try {
                        const newArticle = JSON.parse(event.data);
                        if (!newArticle || !newArticle.id) return;

                        // If user is at top of the feed, insert immediately
                        if (isAtTop) {
                            setArticles(prev => {
                                if (prev.some(a => a.id === newArticle.id || a.title === newArticle.title)) return prev;
                                return [newArticle, ...prev];
                            });
                        } else {
                            // User is scrolled down, queue article and show banner
                            pendingArticlesRef.current.push(newArticle);
                            setUnreadCount(prev => prev + 1);
                        }
                    } catch (e) {
                        console.error('Error parsing SSE news message:', e);
                    }
                });

                es.onerror = () => {
                    setConnectionStatus('OFFLINE');
                    es.close();
                    // Reconnect after 5 seconds
                    reconnectTimeout = setTimeout(connectSSE, 5000);
                };
            } catch (err) {
                setConnectionStatus('OFFLINE');
                reconnectTimeout = setTimeout(connectSSE, 5000);
            }
        };

        connectSSE();

        return () => {
            if (eventSourceRef.current) eventSourceRef.current.close();
            clearTimeout(reconnectTimeout);
        };
    }, [isAtTop]);

    // Scroll listener for smart scroll and infinite pagination
    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const atTop = scrollTop < 40;
        setIsAtTop(atTop);

        if (atTop && unreadCount > 0) {
            applyPendingArticles();
        }

        // Infinite scroll trigger
        if (scrollHeight - scrollTop - clientHeight < 150 && hasMore && !loadingMore && !loading) {
            fetchNews(selectedCategory, articles.length, true);
        }
    };

    const applyPendingArticles = () => {
        if (pendingArticlesRef.current.length > 0) {
            const pending = [...pendingArticlesRef.current];
            pendingArticlesRef.current = [];
            setArticles(prev => {
                const existingIds = new Set(prev.map(a => a.id));
                const unique = pending.filter(a => !existingIds.has(a.id));
                return [...unique, ...prev];
            });
            setUnreadCount(0);
        }
    };

    const scrollToTop = () => {
        if (containerRef.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        applyPendingArticles();
    };

    // Group articles by date for section dividers
    const groupedArticles = articles.reduce((acc, article) => {
        const dateKey = formatDateHeader(article.publishedAt);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(article);
        return acc;
    }, {});

    const statusColor = connectionStatus === 'LIVE' ? 'var(--accent-emerald)' :
        connectionStatus === 'CONNECTING' ? 'var(--accent-amber)' : 'var(--accent-rose)';
    const statusSoft = connectionStatus === 'LIVE' ? 'var(--accent-emerald-soft)' :
        connectionStatus === 'CONNECTING' ? 'var(--accent-amber-soft)' : 'var(--accent-rose-soft)';

    return (
        <div className="fade-in" style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 180px)',
            maxWidth: '900px',
            margin: '0 auto',
            gap: '16px'
        }}>
            {/* Header Bar */}
            <div className="soft-card" style={{
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>📰</span>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '19px', fontWeight: '800', letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
                            BullX News Terminal
                        </h1>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Live Indian &amp; global financial market feeds
                        </span>
                    </div>
                </div>

                {/* Live Status Pill */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '12px',
                    fontWeight: '700',
                    background: statusSoft,
                    color: statusColor,
                    border: `1px solid ${statusColor}`
                }}>
                    <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: statusColor,
                        boxShadow: connectionStatus === 'LIVE' ? `0 0 8px ${statusColor}` : 'none'
                    }} />
                    {connectionStatus}
                </div>
            </div>

            {/* Category Tabs & Search Row */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
            }}>
                {/* Compact Category Tabs */}
                <div className="pill-tabs no-scrollbar" style={{ overflowX: 'auto', maxWidth: '100%' }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={selectedCategory === cat.id ? 'active solid' : ''}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Search Input */}
                <div style={{ position: 'relative', minWidth: '220px', flex: '1', maxWidth: '320px' }}>
                    <input
                        type="text"
                        className="soft-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search news, stocks, keywords..."
                        style={{ padding: '9px 12px 9px 34px' }}
                    />
                    <span style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '14px',
                        color: 'var(--text-muted)'
                    }}>
                        🔍
                    </span>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{
                                position: 'absolute',
                                right: '10px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Smart Scroll New Articles Banner */}
            {unreadCount > 0 && (
                <div
                    onClick={scrollToTop}
                    className="soft-btn soft-btn-primary"
                    style={{
                        padding: '10px 16px',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 4px 16px var(--accent-primary-soft)'
                    }}
                >
                    ↑ {unreadCount} NEW ARTICLE{unreadCount > 1 ? 'S' : ''} • Click to view latest
                </div>
            )}

            {/* News Articles Feed Container */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="soft-card"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px 16px'
                }}
            >
                {loading && articles.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '300px',
                        color: 'var(--text-secondary)',
                        gap: '12px'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            border: '3px solid var(--border-color)',
                            borderTopColor: 'var(--accent-primary)',
                            borderRadius: '50%',
                            animation: 'bxNewsSpin 0.8s linear infinite'
                        }} />
                        <span style={{ fontSize: '14px' }}>Loading live market news...</span>
                    </div>
                ) : articles.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '300px',
                        color: 'var(--text-secondary)',
                        gap: '8px'
                    }}>
                        <span style={{ fontSize: '32px' }}>📭</span>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>No news articles found</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            {searchQuery ? `No results for "${searchQuery}"` : 'Polling feeds for new updates...'}
                        </span>
                    </div>
                ) : (
                    Object.entries(groupedArticles).map(([dateHeader, dateArticles]) => (
                        <div key={dateHeader} style={{ marginBottom: '16px' }}>
                            {/* Date Group Header */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                margin: '14px 0 8px 0'
                            }}>
                                <span className="sec-label">{dateHeader}</span>
                                <span className="soft-badge positive" style={{ fontSize: '9px', padding: '1px 6px' }}>
                                    • LIVE
                                </span>
                                <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                            </div>

                            {/* News Items List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {dateArticles.map((article) => (
                                    <div
                                        key={article.id || article.title}
                                        style={{
                                            padding: '12px 14px',
                                            background: 'var(--bg-inset)',
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--border-color)',
                                            transition: 'border-color 0.15s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-color-strong)'}
                                        onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                    >
                                        {/* Metadata Row: Source, Time, Importance, Category */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            fontSize: '12px',
                                            color: 'var(--text-secondary)',
                                            flexWrap: 'wrap',
                                            gap: '6px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="soft-badge neutral">
                                                    {article.source || 'News'}
                                                </span>
                                                <span style={{ color: 'var(--text-muted)' }}>•</span>
                                                <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
                                                    {getRelativeTime(article.publishedAt)}
                                                </span>
                                                {article.importance === 'HIGH' && (
                                                    <span className="soft-badge negative" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                                        HIGH IMPACT
                                                    </span>
                                                )}
                                            </div>

                                            {/* Stock Badges */}
                                            {article.symbols && article.symbols.length > 0 && (
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {article.symbols.map(sym => (
                                                        <button
                                                            key={sym}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (onSelectStock) onSelectStock(sym);
                                                            }}
                                                            className="soft-badge positive"
                                                            style={{ border: '1px solid var(--accent-emerald)', cursor: 'pointer', background: 'none', fontFamily: 'inherit' }}
                                                            title={`View ${sym} trading chart & details`}
                                                        >
                                                            {sym} ↗
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Headline */}
                                        <a
                                            href={article.sourceUrl || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                color: 'var(--text-primary)',
                                                fontSize: '14px',
                                                fontWeight: '700',
                                                lineHeight: '1.4',
                                                textDecoration: 'none',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                                        >
                                            {article.title}
                                        </a>

                                        {/* Short Summary (if available) */}
                                        {article.summary && (
                                            <p style={{
                                                margin: 0,
                                                fontSize: '12px',
                                                color: 'var(--text-secondary)',
                                                lineHeight: '1.45',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden'
                                            }}>
                                                {article.summary}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}

                {/* Loading More Indicator */}
                {loadingMore && (
                    <div style={{
                        textAlign: 'center',
                        padding: '16px',
                        color: 'var(--text-secondary)',
                        fontSize: '13px'
                    }}>
                        Loading older articles...
                    </div>
                )}
            </div>

            <style>{`
                @keyframes bxNewsSpin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default NewsTerminal;
