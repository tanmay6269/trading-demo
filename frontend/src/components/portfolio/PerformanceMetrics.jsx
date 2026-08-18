import React from 'react';

const PerformanceMetrics = ({ holdings = [], balance = 0 }) => {
    const totalValue = holdings.reduce((sum, item) => sum + (item.current_value || 0), 0);
    const totalInvested = holdings.reduce((sum, item) => sum + (item.invested || 0), 0);
    const totalPnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const netWorth = totalValue + balance;

    const metrics = [
        { label: 'Total Invested', value: `₹${totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'var(--text-primary)' },
        { label: 'Current Portfolio Value', value: `₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'var(--text-primary)' },
        { label: 'Total Un-realized P&L', value: `${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' },
        { label: 'Total Return %', value: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`, color: pnlPercent >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' },
        { label: 'Available Demo Cash', value: `₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'var(--accent-emerald)' },
        { label: 'Net Account Worth', value: `₹${netWorth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'var(--accent-primary)' },
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '20px'
        }}>
            {metrics.map((metric) => (
                <div key={metric.label} className="soft-card" style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '4px'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>
                        {metric.label}
                    </div>
                    <div style={{
                        fontSize: '18px',
                        fontWeight: '800',
                        color: metric.color,
                        marginTop: '2px'
                    }}>
                        {metric.value}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PerformanceMetrics;