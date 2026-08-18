import React from 'react';

const Sidebar = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'explore', label: '📊 Explore', icon: '📊' },
        { id: 'holdings', label: '💼 Holdings', icon: '💼' },
        { id: 'positions', label: '📈 Positions', icon: '📈' },
        { id: 'orders', label: '📋 Orders', icon: '📋' },
        { id: 'watchlist', label: '⭐ Watchlist', icon: '⭐' },
        { id: 'recharge', label: '💳 Recharge', icon: '💳' },
        { id: 'trading', label: '📈 Trading', icon: '📈' },
    ];

    return (
        <div style={{
            width: '200px',
            background: '#141b2b',
            borderRight: '1px solid #2a3a5c',
            minHeight: 'calc(100vh - 65px)',
            padding: '20px 0'
        }}>
            {tabs.map((tab) => (
                <div
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    style={{
                        padding: '12px 20px',
                        margin: '4px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: activeTab === tab.id ? '#1a2332' : 'transparent',
                        color: activeTab === tab.id ? '#4CAF50' : '#8a9bb5',
                        borderLeft: activeTab === tab.id ? '3px solid #4CAF50' : '3px solid transparent',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        if (activeTab !== tab.id) {
                            e.target.style.background = '#1a2332';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (activeTab !== tab.id) {
                            e.target.style.background = 'transparent';
                        }
                    }}
                >
                    <span style={{ marginRight: '10px' }}>{tab.icon}</span>
                    {tab.label}
                </div>
            ))}
        </div>
    );
};

export default Sidebar;