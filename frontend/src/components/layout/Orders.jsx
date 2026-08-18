import React, { useState, useEffect } from 'react';

const Orders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setOrders([
            { id: 1, symbol: 'RELIANCE', type: 'BUY', quantity: 10, price: 1323.90, status: 'EXECUTED', date: 'Just now' },
            { id: 2, symbol: 'TCS', type: 'BUY', quantity: 5, price: 2445.70, status: 'EXECUTED', date: 'Today, 10:15 AM' },
            { id: 3, symbol: 'HDFCBANK', type: 'SELL', quantity: 20, price: 729.00, status: 'EXECUTED', date: 'Yesterday' },
        ]);
        setLoading(false);
    }, []);

    if (loading) {
        return <div className="soft-card" style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading order log...</div>;
    }

    return (
        <div className="soft-card fade-in" style={{ padding: '20px', overflowX: 'auto' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                📋 Order History & Executed Trades
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ color: 'var(--text-muted)', fontSize: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>SYMBOL</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>TYPE</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>QUANTITY</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>PRICE</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>STATUS</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>DATE & TIME</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((order) => (
                        <tr key={order.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '14px 12px', fontWeight: '700', color: 'var(--text-primary)' }}>{order.symbol}</td>
                            <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                <span className={`soft-badge ${order.type === 'BUY' ? 'positive' : 'negative'}`}>
                                    {order.type}
                                </span>
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '600' }}>{order.quantity}</td>
                            <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                                ₹{order.price.toFixed(2)}
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                <span style={{
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    background: 'rgba(56, 189, 248, 0.12)',
                                    color: 'var(--accent-primary)'
                                }}>
                                    {order.status}
                                </span>
                            </td>
                            <td style={{ padding: '14px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                {order.date}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Orders;