import React, { useState } from 'react';
import BullMarketIcon from './BullMarketIcon';

const Navbar = ({ username, balance, onLogout, onLockApp = () => {}, setActiveTab, activeTab, onOpenProfile = () => {}, profilePic, onOpenOptionChain }) => {
    const [topCategory, setTopCategory] = useState('stocks');
    const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
        try { localStorage.setItem('bx_theme', nextTheme); } catch (e) {}
    };

    const subTabs = [
        { id: 'explore', label: 'Explore' },
        { id: 'news', label: 'News', icon: '📰' },
        { id: 'holdings', label: 'Holdings' },
        { id: 'positions', label: 'Positions' },
        { id: 'orders', label: 'Orders' },
        { id: 'watchlist', label: 'Watchlist' },
        { id: 'recharge', label: 'Recharge Funds' },
    ];

    const navStyle = {
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: 'var(--shadow-soft)'
    };

    return (
        <header style={navStyle}>
            {/* Top row */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 24px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
                    <div
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                        onClick={() => setActiveTab('explore')}
                    >
                        <BullMarketIcon size={36} />
                        <h2 style={{
                            margin: 0,
                            fontSize: '20px',
                            fontWeight: '800',
                            letterSpacing: '-0.5px',
                            color: 'var(--text-primary)'
                        }}>
                            Bull<span style={{ color: 'var(--accent-primary)' }}>X</span>
                        </h2>
                    </div>

                    <div className="hide-on-mobile" style={{ display: 'flex', gap: '22px', alignItems: 'center' }}>
                        {['stocks', 'fno', 'mf'].map((cat) => {
                            const label = cat === 'stocks' ? 'Stocks' : cat === 'fno' ? 'F&O' : 'Mutual Funds';
                            const isActive = topCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setTopCategory(cat)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        fontSize: '14px',
                                        fontWeight: isActive ? '700' : '500',
                                        cursor: 'pointer',
                                        padding: '4px 2px',
                                        transition: 'color 0.15s ease'
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="nav-user-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        style={{
                            background: 'var(--bg-inset)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            width: '38px',
                            height: '38px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontSize: '15px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {theme === 'dark' ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <circle cx="12" cy="12" r="4" />
                                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                            </svg>
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        )}
                    </button>

                    <div className="nav-balance-pill" style={{
                        background: 'var(--bg-inset)',
                        border: '1px solid var(--border-color)',
                        padding: '7px 14px',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        lineHeight: 1.2
                    }}>
                        <span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Balance
                        </span>
                        <span style={{ fontWeight: '800', color: 'var(--text-primary)', fontSize: '14px' }}>
                            ₹{(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    <button
                        onClick={onLockApp}
                        className="soft-btn soft-btn-ghost hide-on-mobile"
                        title="Lock Terminal"
                        style={{ padding: '9px 14px', fontSize: '13px' }}
                    >
                        Lock
                    </button>

                    <div
                        onClick={onOpenProfile}
                        style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '12px',
                            background: 'var(--accent-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontSize: '15px',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            boxShadow: '0 2px 8px var(--accent-primary-soft)'
                        }}
                        title={`Logged in as ${username}`}
                    >
                        {profilePic ? (
                            <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            username ? username.charAt(0).toUpperCase() : 'U'
                        )}
                    </div>
                </div>
            </div>

            {/* Sub navigation */}
            <div className="desktop-subtabs" style={{
                display: 'flex',
                padding: '0 24px',
                gap: '28px',
                background: 'var(--bg-surface)',
                overflowX: 'auto',
                borderTop: '1px solid var(--border-color)'
            }}>
                {subTabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '12px 0',
                                background: 'transparent',
                                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                border: 'none',
                                borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: isActive ? '700' : '500',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
                {onOpenOptionChain && (
                    <button
                        onClick={onOpenOptionChain}
                        style={{
                            marginLeft: 'auto',
                            padding: '12px 0',
                            background: 'transparent',
                            color: 'var(--accent-primary)',
                            border: 'none',
                            borderBottom: '2px solid transparent',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600'
                        }}
                    >
                        Option Chain
                    </button>
                )}
            </div>
        </header>
    );
};

export default Navbar;
