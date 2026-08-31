import React from 'react';
import StockLogo from '../ui/StockLogo';

const HoldingsTable = ({ holdings }) => {
    if (!holdings || holdings.length === 0) {
        return (
            <div className="soft-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
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
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>No Holdings Yet</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Buy your first stock from Explore or the Trade tab to start building your portfolio.
                </p>
            </div>
        );
    }

    return (
        <div className="soft-card fade-in" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '20px 20px 8px' }}>
                <h3 style={{ margin: '0', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                    Current Investment Portfolio
                </h3>
            </div>
            <table className="bx-table">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left' }}>SYMBOL</th>
                        <th style={{ textAlign: 'right' }}>QTY</th>
                        <th style={{ textAlign: 'right' }}>AVG PRICE</th>
                        <th style={{ textAlign: 'right' }}>LIVE PRICE</th>
                        <th style={{ textAlign: 'right' }}>CURRENT VALUE</th>
                        <th style={{ textAlign: 'right' }}>TOTAL P&L</th>
                        <th style={{ textAlign: 'right' }}>RETURN %</th>
                    </tr>
                </thead>
                <tbody>
                    {holdings.map((item) => {
                        const isPos = item.pnl >= 0;
                        return (
                            <tr key={item.symbol}>
                                <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <StockLogo symbol={item.symbol} size={32} />
                                        <span>{item.symbol}</span>
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '600' }}>{item.quantity}</td>
                                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    ₹{item.avg_price ? item.avg_price.toFixed(2) : '0.00'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    ₹{item.current_price ? item.current_price.toFixed(2) : '0.00'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: '700' }}>
                                    ₹{item.current_value ? item.current_value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                                </td>
                                <td style={{
                                    textAlign: 'right',
                                    color: isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                    fontWeight: '700'
                                }}>
                                    {isPos ? '+' : ''}₹{item.pnl ? item.pnl.toFixed(2) : '0.00'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
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