import React from 'react';

const HoldingsTable = ({ holdings }) => {
    if (!holdings || holdings.length === 0) {
        return (
            <div className="soft-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>💼</div>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>No Holdings Yet</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Search for any NSE or BSE stock in the Explore or Trade tab to make your first demo trade!
                </p>
            </div>
        );
    }

    return (
        <div className="soft-card fade-in" style={{ padding: '20px', overflowX: 'auto' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                💼 Current Investment Portfolio
            </h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ color: 'var(--text-muted)', fontSize: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>SYMBOL</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>QTY</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>AVG PRICE</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>LIVE PRICE</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>CURRENT VALUE</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>TOTAL P&L</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>RETURN %</th>
                    </tr>
                </thead>
                <tbody>
                    {holdings.map((item) => {
                        const isPos = item.pnl >= 0;
                        return (
                            <tr key={item.symbol} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                                <td style={{ padding: '14px 12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--accent-primary)' }}>📈</span>
                                        <span>{item.symbol}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '600' }}>{item.quantity}</td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    ₹{item.avg_price ? item.avg_price.toFixed(2) : '0.00'}
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    ₹{item.current_price ? item.current_price.toFixed(2) : '0.00'}
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700' }}>
                                    ₹{item.current_value ? item.current_value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                                </td>
                                <td style={{
                                    padding: '14px 12px',
                                    textAlign: 'right',
                                    color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                    fontWeight: '700'
                                }}>
                                    {isPos ? '+' : ''}₹{item.pnl ? item.pnl.toFixed(2) : '0.00'}
                                </td>
                                <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                                    <span className={`soft-badge ${isPos ? 'positive' : 'negative'}`}>
                                        {isPos ? '+' : ''}{item.pnl_percent ? item.pnl_percent.toFixed(2) : '0.00'}%
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default HoldingsTable;