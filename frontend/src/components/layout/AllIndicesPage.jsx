import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const flagMap = {
    'GIFT NIFTY': '🇮🇳',
    'Dow': '🇺🇸',
    'Dow Futures': '🇺🇸',
    'S&P': '🇺🇸',
    'NIKKEI': '🇯🇵',
    'HANG SENG': '🇭🇰',
    'DAX': '🇩🇪',
    'CAC': '🇫🇷',
    'KOSPI': '🇰🇷',
    'FTSE 100': '🇬🇧'
};

const AllIndicesPage = ({ onBack, onSelectStock = () => {} }) => {
    const [activeTab, setActiveTab] = useState('indian'); // 'indian' | 'global'
    const [tableData, setTableData] = useState({ indian: [], global: [] });
    const [loading, setLoading] = useState(true);

    const loadTableData = useCallback(async () => {
        try {
            const data = await api.getAllIndicesTable();
            if (data) {
                setTableData(data);
            }
        } catch (e) {
            console.error("Error loading all indices table:", e);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadTableData();
        const interval = setInterval(loadTableData, 15000);
        return () => clearInterval(interval);
    }, [loadTableData]);

    const currentRows = activeTab === 'global' ? tableData.global : tableData.indian;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Navigation Header with Back button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={onBack}
                        className="soft-btn soft-btn-ghost"
                        style={{
                            padding: '7px 14px',
                            fontSize: '13px'
                        }}
                    >
                        ← Back to Explore
                    </button>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '22px', fontWeight: '800' }}>
                        🌐 All Indices Overview
                    </h2>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '700' }}>
                    💡 Click any index to view its live chart, options & constituents
                </div>
            </div>

            {/* Groww Style Indian vs Global Indices Tabs */}
            <div style={{
                display: 'flex',
                gap: '24px',
                borderBottom: '2px solid var(--border-color)',
                paddingBottom: '2px'
            }}>
                <button
                    onClick={() => setActiveTab('indian')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 4px',
                        color: activeTab === 'indian' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontSize: '16px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'indian' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                        marginBottom: '-2px'
                    }}
                >
                    Indian Indices ({tableData.indian.length})
                </button>
                <button
                    onClick={() => setActiveTab('global')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 4px',
                        color: activeTab === 'global' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontSize: '16px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        borderBottom: activeTab === 'global' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                        marginBottom: '-2px'
                    }}
                >
                    Global Indices ({tableData.global.length})
                </button>
            </div>

            {/* Detailed Indices Table */}
            <div className="soft-card" style={{ padding: '0', overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Loading live indices records...
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{
                                color: 'var(--text-muted)',
                                fontSize: '12px',
                                textTransform: 'uppercase',
                                borderBottom: '1px solid var(--border-color)',
                                background: 'var(--bg-inset)'
                            }}>
                                <th style={{ padding: '16px 20px', fontWeight: '700' }}>Index Name</th>
                                <th style={{ padding: '16px 20px', fontWeight: '700', textAlign: 'right' }}>Last Traded</th>
                                <th style={{ padding: '16px 20px', fontWeight: '700', textAlign: 'right' }}>Day Change</th>
                                <th style={{ padding: '16px 20px', fontWeight: '700', textAlign: 'right' }}>High</th>
                                <th style={{ padding: '16px 20px', fontWeight: '700', textAlign: 'right' }}>Low</th>
                                <th style={{ padding: '16px 20px', fontWeight: '700', textAlign: 'right' }}>Open</th>
                                <th style={{ padding: '16px 20px', fontWeight: '700', textAlign: 'right' }}>Prev. Close</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentRows.map((row, idx) => {
                                const flag = activeTab === 'global' ? (flagMap[row.name] || '🌐') : '📈';

                                return (
                                    <tr 
                                        key={row.name + idx}
                                        onClick={() => onSelectStock(row.symbol || row.name)}
                                        style={{ 
                                            borderBottom: '1px solid var(--border-color)',
                                            cursor: 'pointer',
                                            transition: 'background 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        {/* Index Name + Flag */}
                                        <td style={{ padding: '16px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '20px' }}>{flag}</span>
                                                <div>
                                                    <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>
                                                        {row.name}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        Live Tick Data
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Last Traded */}
                                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '800', fontSize: '15px', color: 'var(--text-primary)' }}>
                                            {row.price ? row.price.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                                        </td>

                                        {/* Day Change & % */}
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            {(() => {
                                                const changeNum = typeof row.change === 'number' ? row.change : (parseFloat(row.change) || 0);
                                                const pctNum = typeof row.change_percent === 'number' ? row.change_percent : (parseFloat(row.change_percent) || 0);
                                                const isPos = changeNum >= 0;
                                                const sign = isPos ? '+' : '-';
                                                return (
                                                    <div style={{ 
                                                        fontWeight: '800', 
                                                        fontSize: '14px', 
                                                        color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' 
                                                    }}>
                                                        {sign}₹{Math.abs(changeNum).toFixed(2)} ({sign}{Math.abs(pctNum).toFixed(2)}%)
                                                    </div>
                                                );
                                            })()}
                                        </td>

                                        {/* High */}
                                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                            {row.high ? row.high.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                                        </td>

                                        {/* Low */}
                                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                            {row.low ? row.low.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                                        </td>

                                        {/* Open */}
                                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                            {row.open ? row.open.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                                        </td>

                                        {/* Prev. Close */}
                                        <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                            {row.prev_close ? row.prev_close.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default AllIndicesPage;
