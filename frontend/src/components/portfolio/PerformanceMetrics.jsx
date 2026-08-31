import React from 'react';

const PerformanceMetrics = ({ holdings = [], balance = 0 }) => {
    const totalValue = holdings.reduce((sum, item) => sum + (item.current_value || 0), 0);
    const totalInvested = holdings.reduce((sum, item) => sum + (item.invested || 0), 0);
    const totalPnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const netWorth = totalValue + balance;

    const isPnlPos = totalPnl >= 0;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {/* Portfolio value highlight card */}
            <div className="soft-card" style={{
                padding: '18px 20px',
                gridColumn: 'span 2',
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-strong) 100%)',
                border: 'none',
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '6px'
            }}>
                <div style={{ fontSize: '12px', fontWeight: '600', opacity: 0.85 }}>Net Account Worth</div>
                <div style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                    ₹{netWorth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700' }}>
                    Current Portfolio: ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} · Available Cash: ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
            </div>

            <div className="soft-card" style={{
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '4px'
            }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Total Invested</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    ₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
            </div>

            <div className="soft-card" style={{
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '4px'
            }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Unrealized P&L</div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: isPnlPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                    {isPnlPos ? '+' : '−'}₹{Math.abs(totalPnl).toFixed(2)}
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: isPnlPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                    {isPnlPos ? '+' : '−'}{Math.abs(pnlPercent).toFixed(2)}%
                </div>
            </div>
        </div>
    );
};

export default PerformanceMetrics;
