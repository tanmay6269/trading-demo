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
        const today = new Date();
        if (d.toDateString() === today.toDateString()) {
            return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
        }
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

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 120px)',
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '16px',
            color: '#f1f5f9',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            {/* Header Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '14px',
                borderBottom: '1px solid #1e293b',
                marginBottom: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>📰</span>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '700', letterSpacing: '-0.02em' }}>
                            BullX News Terminal
                        </h1>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            Live Indian & Global financial market feeds
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
                    fontWeight: '600',
                    background: connectionStatus === 'LIVE' ? 'rgba(16, 185, 129, 0.15)' :
                                connectionStatus === 'CONNECTING' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: connectionStatus === 'LIVE' ? '#10b981' :
                           connectionStatus === 'CONNECTING' ? '#f59e0b' : '#ef4444',
                    border: `1px solid ${
                        connectionStatus === 'LIVE' ? 'rgba(16, 185, 129, 0.3)' :
                        connectionStatus === 'CONNECTING' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'
                    }`
                }}>
                    <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: connectionStatus === 'LIVE' ? '#10b981' :
                                         connectionStatus === 'CONNECTING' ? '#f59e0b' : '#ef4444',
                        boxShadow: connectionStatus === 'LIVE' ? '0 0 8px #10b981' : 'none'
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
                gap: '12px',
                marginBottom: '14px'
            }}>
                {/* Compact Category Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    overflowX: 'auto',
                    paddingBottom: '4px',
                    scrollbarWidth: 'none'
                }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontSize: '13px',
                                fontWeight: selectedCategory === cat.id ? '600' : '500',
                                background: selectedCategory === cat.id ? '#2563eb' : '#1e293b',
                                color: selectedCategory === cat.id ? '#ffffff' : '#94a3b8',
                                border: '1px solid',
                                borderColor: selectedCategory === cat.id ? '#3b82f6' : '#334155',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Search Input */}
                <div style={{ position: 'relative', minWidth: '220px', flex: '1', maxWidth: '320px' }}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search news, stocks, keywords..."
                        style={{
                            width: '100%',
                            padding: '8px 12px 8px 34px',
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '6px',
                            color: '#f8fafc',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                    <span style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '14px',
                        color: '#64748b'
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
                                color: '#94a3b8',
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
                    style={{
                        padding: '8px 16px',
                        background: '#2563eb',
                        color: '#ffffff',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        textAlign: 'center',
                        cursor: 'pointer',
                        marginBottom: '12px',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        animation: 'bounce 1s infinite alternate'
                    }}
                >
                    ↑ {unreadCount} NEW NEWS • Click to view latest
                </div>
            )}

            {/* News Articles Feed Container */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    scrollbarColor: '#334155 #0f172a'
                }}
            >
                {loading && articles.length === 0 ? (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '300px',
                        color: '#94a3b8',
                        gap: '12px'
                    }}>
                        <div style={{
                            width: '32px',
                            height: '32px',
                            border: '3px solid #334155',
                            borderTopColor: '#3b82f6',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite'
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
                        color: '#94a3b8',
                        gap: '8px'
                    }}>
                        <span style={{ fontSize: '32px' }}>📭</span>
                        <span style={{ fontSize: '15px', fontWeight: '600' }}>No news articles found</span>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>
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
                                margin: '14px 0 8px 0',
                                color: '#64748b',
                                fontSize: '11px',
                                fontWeight: '700',
                                letterSpacing: '0.05em'
                            }}>
                                <span>{dateHeader}</span>
                                <span style={{
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#10b981',
                                    borderRadius: '4px',
                                    fontWeight: '600'
                                }}>
                                    • LIVE
                                </span>
                                <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
                            </div>

                            {/* News Items List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {dateArticles.map((article) => (
                                    <div
                                        key={article.id || article.title}
                                        style={{
                                            padding: '12px 14px',
                                            background: '#1e293b',
                                            borderRadius: '6px',
                                            border: '1px solid #334155',
                                            transition: 'transform 0.15s ease, border-color 0.15s ease',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px'
                                        }}
                                    >
                                        {/* Metadata Row: Source, Time, Importance, Category */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            fontSize: '12px',
                                            color: '#94a3b8'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    background: 'rgba(59, 130, 246, 0.15)',
                                                    color: '#60a5fa'
                                                }}>
                                                    {article.source || 'News'}
                                                </span>
                                                <span style={{ color: '#64748b' }}>•</span>
                                                <span style={{ fontWeight: '500', color: '#cbd5e1' }}>
                                                    {getRelativeTime(article.publishedAt)}
                                                </span>
                                                {article.importance === 'HIGH' && (
                                                    <span style={{
                                                        padding: '1px 5px',
                                                        borderRadius: '3px',
                                                        fontSize: '10px',
                                                        fontWeight: '700',
                                                        background: 'rgba(239, 68, 68, 0.2)',
                                                        color: '#f87171',
                                                        border: '1px solid rgba(239, 68, 68, 0.4)'
                                                    }}>
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
                                                            style={{
                                                                padding: '2px 6px',
                                                                background: 'rgba(16, 185, 129, 0.15)',
                                                                color: '#34d399',
                                                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: '600',
                                                                cursor: 'pointer',
                                                                transition: 'background 0.15s'
                                                            }}
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
                                                color: '#f8fafc',
                                                fontSize: '14px',
                                                fontWeight: '600',
                                                lineHeight: '1.4',
                                                textDecoration: 'none',
                                                cursor: 'pointer'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = '#f8fafc'}
                                        >
                                            {article.title}
                                        </a>

                                        {/* Short Summary (if available) */}
                                        {article.summary && (
                                            <p style={{
                                                margin: 0,
                                                fontSize: '12px',
                                                color: '#94a3b8',
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
                        color: '#94a3b8',
                        fontSize: '13px'
                    }}>
                        Loading older articles...
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes bounce {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-4px); }
                }
            `}</style>
        </div>
    );
};

export default NewsTerminal;
