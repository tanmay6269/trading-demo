import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';

const formatOrderDate = (isoString) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';

    const now = new Date();
    const isSameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (isSameDay) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${time}`;
};

const Orders = () => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = useCallback(async () => {
        try {
            const data = await api.getOrders();
            if (data && Array.isArray(data.orders)) {
                setOrders(data.orders);
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchOrders();
        const interval = setInterval(fetchOrders, 15000);
        return () => clearInterval(interval);
    }, [fetchOrders]);

    if (loading) {
        return <div className="soft-card" style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading order log...</div>;
    }

    if (orders.length === 0) {
        return (
            <div className="soft-card fade-in" style={{ padding: '40px 20px', textAlign: 'center' }}>
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
                        <path d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" />
                    </svg>
                </div>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '6px' }}>No Orders Yet</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    Buy or sell a stock and your executed orders will show up here.
                </p>
            </div>
        );
    }

    return (
        <div className="soft-card fade-in" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '20px 20px 8px' }}>
                <h3 style={{ margin: '0', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>
                    Order History & Executed Trades
                </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table className="bx-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>SYMBOL</th>
                            <th style={{ textAlign: 'center' }}>TYPE</th>
                            <th style={{ textAlign: 'right' }}>QUANTITY</th>
                            <th style={{ textAlign: 'right' }}>PRICE</th>
                            <th style={{ textAlign: 'right' }}>P&amp;L</th>
                            <th style={{ textAlign: 'center' }}>STATUS</th>
                            <th style={{ textAlign: 'center' }}>DATE &amp; TIME</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => {
                            const hasPnl = order.pnl !== null && order.pnl !== undefined;
                            const isPnlPos = hasPnl && order.pnl >= 0;
                            return (
                                <tr key={order.id}>
                                    <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{order.symbol}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className={`soft-badge ${order.type === 'BUY' ? 'positive' : 'negative'}`}>
                                            {order.type}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '600' }}>{order.quantity}</td>
                                    <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>
                                        ₹{order.price.toFixed(2)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: '700', color: hasPnl ? (isPnlPos ? 'var(--accent-emerald)' : 'var(--accent-rose)') : 'var(--text-muted)' }}>
                                        {hasPnl ? `${isPnlPos ? '+' : ''}₹${order.pnl.toFixed(2)}` : '—'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className="soft-badge neutral">
                                            {order.status}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                                        {formatOrderDate(order.timestamp)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Orders;
