import React, { useState } from 'react';
import BullMarketIcon from './BullMarketIcon';

const Navbar = ({ username, balance, onLogout, onLockApp = () => {}, setActiveTab, activeTab, onOpenProfile = () => {}, profilePic, onOpenOptionChain }) => {
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
        { id: 'option-chain', label: 'Option Chain ⚡' },
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
                        <BullMarketIcon size={42} />
                        <h2 style={{ 
                            margin: 0, 
                            fontSize: '20px', 
                            fontWeight: '800', 
                            letterSpacing: '-0.5px',
                            color: 'var(--text-primary)'
                        }}>
                            Bull<span style={{ color: '#6C5CE7' }}>X</span>
                        </h2>
                    </div>

                    {/* Category Selector Tabs: Stocks | F&O | Mutual Funds */}
                    <div className="hide-on-mobile" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
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
                                        color: isActive ? '#6C5CE7' : 'var(--text-secondary)',
                                        fontSize: '14px',
                                        fontWeight: isActive ? '700' : '500',
                                        cursor: 'pointer',
                                        transition: 'color 0.15s ease'
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* User & Balance Bar */}
                <div className="nav-user-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                    {/* Theme Switcher Toggle */}
                    <button
                        onClick={toggleTheme}
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        style={{
                            background: 'var(--bg-surface-hover)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>{theme === 'dark' ? '☀️ Light' : '🌙 Dark'}</span>
                    </button>

                    {/* Notification Bell Badge */}
                    <div className="hide-on-mobile" style={{
                        position: 'relative',
                        background: '#14161d',
                        padding: '6px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '34px',
                        height: '34px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <span style={{ fontSize: '14px' }}>🔔</span>
                        <span style={{
                            position: 'absolute',
                            top: '-3px',
                            right: '-3px',
                            background: '#6C5CE7',
                            color: '#ffffff',
                            fontSize: '9px',
                            fontWeight: '700',
                            borderRadius: '50%',
                            width: '14px',
                            height: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>5</span>
                    </div>

                    {/* Live Balance Pill */}
                    <div className="nav-balance-pill" style={{
                        background: 'rgba(108, 92, 231, 0.08)',
                        border: '1px solid rgba(108, 92, 231, 0.2)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span className="hide-on-mobile" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Demo:</span>
                        <span style={{ fontWeight: '700', color: '#6C5CE7', fontSize: '13px' }}>
                            ₹{(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    {/* Lock Terminal Button */}
                    <button
                        onClick={onLockApp}
                        className="soft-btn hide-on-mobile"
                        title="Lock Terminal"
                        style={{
                            background: '#14161d',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Lock
                    </button>

                    {/* User Avatar */}
                    <div 
                        style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '6px',
                            background: '#6C5CE7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontSize: '14px',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            border: '1px solid #6C5CE7'
                        }} 
                        title={`Logged in as ${username}`} 
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

            {/* Sub Navigation Bar */}
            <div className="desktop-subtabs" style={{
                display: 'flex',
                padding: '0 24px',
                gap: '24px',
                background: 'var(--bg-surface)',
                overflowX: 'auto'
            }}>
                {subTabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                if (tab.id === 'option-chain' && onOpenOptionChain) {
                                    onOpenOptionChain();
                                } else {
                                    setActiveTab(tab.id);
                                }
                            }}
                            style={{
                                padding: '10px 0',
                                background: 'transparent',
                                color: isActive ? '#6C5CE7' : 'var(--text-secondary)',
                                border: 'none',
                                borderBottom: isActive ? '2px solid #6C5CE7' : '2px solid transparent',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: isActive ? '700' : '500',
                                transition: 'all 0.15s ease',
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