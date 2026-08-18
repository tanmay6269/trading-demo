import React from 'react';

const StatsCards = ({ portfolio }) => {
    const totalValue = portfolio.reduce((sum, item) => sum + item.current_value, 0);
    const totalInvested = portfolio.reduce((sum, item) => sum + item.invested, 0);
    const totalPnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    const stats = [
        { label: 'Total Value', value: `₹${totalValue.toFixed(2)}`, color: '#e0e6ed' },
        { label: 'Total Invested', value: `₹${totalInvested.toFixed(2)}`, color: '#8a9bb5' },
        { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? '#4CAF50' : '#dc3545' },
        { label: 'P&L %', value: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`, color: pnlPercent >= 0 ? '#4CAF50' : '#dc3545' },
    ];

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px',
            marginBottom: '20px'
        }}>
            {stats.map((stat) => (
                <div key={stat.label} style={{
                    background: '#141b2b',
                    padding: '15px',
                    borderRadius: '10px',
                    border: '1px solid #2a3a5c',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '12px', color: '#8a9bb5' }}>{stat.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: stat.color }}>
                        {stat.value}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StatsCards;