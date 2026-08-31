import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const getRelativeTime = (dateStr) => {
    if (!dateStr) return 'just now';
    try {
        const diffMs = new Date() - new Date(dateStr);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        return `${diffDays}d`;
    } catch {
        return 'just now';
    }
};

const WatchlistNews = ({ onSelectStock }) => {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasWatchlist, setHasWatchlist] = useState(true);

    const fetchWatchlistNews = useCallback(async () => {
        try {
            const data = await api.getWatchlistNews();
            setArticles(data.articles || []);
            setHasWatchlist((data.watchlist || []).length > 0);
        } catch (e) {
            console.error('Error fetching watchlist news:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchWatchlistNews();
        const interval = setInterval(fetchWatchlistNews, 60000);
        return () => clearInterval(interval);
    }, [fetchWatchlistNews]);

    if (loading) return null;
    if (!hasWatchlist && articles.length === 0) return null;

    return (
        <div className="soft-card fade-in" style={{ padding: '20px', marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '18px' }}>📰</span>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '16px', fontWeight: '800' }}>
                    Latest News for Your Watchlist
                </h3>
            </div>

            {articles.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No recent news for the stocks in your watchlist yet.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {articles.slice(0, 8).map((article) => (
                        <a
                            key={article.id}
                            href={article.sourceUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'block',
                                padding: '12px 14px',
                                background: 'var(--bg-inset)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)',
                                textDecoration: 'none'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                <span className="soft-badge neutral">{article.source || 'News'}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>• {getRelativeTime(article.publishedAt)}</span>
                                {(article.symbols || []).slice(0, 3).map((sym) => (
                                    <span
                                        key={sym}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (onSelectStock) onSelectStock(sym);
                                        }}
                                        className="soft-badge positive"
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {sym} ↗
                                    </span>
                                ))}
                            </div>
                            <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700', lineHeight: 1.4 }}>
                                {article.title}
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WatchlistNews;
