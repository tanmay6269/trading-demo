import React, { useState } from 'react';

const Navbar = ({ username, balance, onLogout, onLockApp = () => {}, setActiveTab, activeTab, onOpenProfile = () => {}, profilePic }) => {
    const [topCategory, setTopCategory] = useState('stocks'); // 'stocks' | 'fno' | 'mf'
    const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        document.documentElement.setAttribute('data-theme', nextTheme);
    };

    const subTabs = [
        { id: 'explore', label: 'Explore' },
        { id: 'holdings', label: 'Holdings' },
        { id: 'positions', label: 'Positions' },
        { id: 'orders', label: 'Orders' },
        { id: 'watchlist', label: 'Watchlist' },
        { id: 'trading', label: 'Trade & Chart' },
        { id: 'recharge', label: 'Recharge Funds' },
    ];

    return (
        <header style={{
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-color)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            boxShadow: 'var(--shadow-soft)'
        }}>
            {/* Top Groww Navigation Row */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 28px',
                borderBottom: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                {/* Groww Logo & Top Category Tabs */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                    <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                        onClick={() => setActiveTab('explore')}
                    >
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #f59e0b 0%, #00d09c 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: '900',
                            fontSize: '22px',
                            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)'
                        }}>
                            🐂
                        </div>
                        <h2 style={{ 
                            margin: 0, 
                            fontSize: '22px', 
                            fontWeight: '900', 
                            letterSpacing: '-0.5px',
                            color: 'var(--text-primary)'
                        }}>
                            Bull<span style={{ color: '#00d09c' }}>X</span>
                        </h2>
                    </div>

                    {/* Category Selector Tabs: Stocks | F&O | Mutual Funds */}
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
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
                                        fontSize: '15px',
                                        fontWeight: isActive ? '800' : '600',
                                        cursor: 'pointer',
                                        transition: 'color 0.2s ease'
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* User & Balance Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

                    {/* Theme Switcher Toggle (☀️ Light / 🌙 Dark) */}
                    <button
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        style={{
                            background: 'var(--bg-surface-hover)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
                        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
                    </button>

                    {/* Notification Bell Badge */}
                    <div style={{
                        position: 'relative',
                        background: '#111927',
                        padding: '8px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '36px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <span style={{ fontSize: '15px' }}>🔔</span>
                        <span style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-2px',
                            background: 'var(--accent-rose)',
                            color: '#ffffff',
                            fontSize: '10px',
                            fontWeight: '800',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>5</span>
                    </div>

                    {/* Live Balance Pill */}
                    <div style={{
                        background: 'var(--accent-emerald-soft)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>💰 Demo</span>
                        <span style={{ fontWeight: '800', color: 'var(--accent-emerald)', fontSize: '14px' }}>
                            ₹{(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    {/* Lock Terminal Button */}
                    <button
                        onClick={onLockApp}
                        className="soft-btn"
                        title="Lock Groww Terminal with 4-Digit Security PIN"
                        style={{
                            background: '#111927',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        🔒 Lock
                    </button>

                    {/* User Avatar */}
                    <div 
                        style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: profilePic ? 'none' : 'linear-gradient(135deg, #818cf8 0%, #00d09c 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: '800',
                            fontSize: '15px',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0, 208, 156, 0.3)',
                            overflow: 'hidden',
                            border: '2px solid #00d09c'
                        }} 
                        title={`Logged in as ${username} · Click to View & Edit Profile`} 
                        onClick={onOpenProfile}
                    >
                        {profilePic ? (
                            <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            username ? username.charAt(0).toUpperCase() : 'U'
                        )}
                    </div>
                </div>
            </div>

            {/* Sub Navigation Bar: Explore | Holdings | Positions | Orders | Watchlist | Terminal */}
            <div style={{
                display: 'flex',
                padding: '0 28px',
                gap: '24px',
                background: 'var(--bg-surface)',
                overflowX: 'auto'
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
                                borderBottom: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: isActive ? '700' : '600',
                                transition: 'all 0.2s ease',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
        </header>
    );
};

export default Navbar;