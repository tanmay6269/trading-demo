import React, { useState } from 'react';
import api from '../../api';

const Recharge = ({ onRecharge, balance }) => {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const plans = [
        { amount: 500, credits: 50000, label: '₹50,000 Credits', desc: 'Starter Trader Pack' },
        { amount: 1000, credits: 110000, label: '₹1,10,000 Credits', desc: 'Popular Trader Pack' },
        { amount: 5000, credits: 600000, label: '₹6,00,000 Credits', desc: 'Pro Investor Pack' }
    ];

    const handleRecharge = async (plan) => {
        setLoading(true);
        setMessage('');
        try {
            const data = await api.rechargeBalance(plan.amount);
            setMessage(data.message || 'Recharge successful!');
            if (data.balance !== undefined && onRecharge) {
                onRecharge(data.balance);
            }
        } catch (error) {
            setMessage(error.message || 'Error recharging funds');
        }
        setLoading(false);
    };

    return (
        <div className="soft-card fade-in" style={{ padding: '32px', maxWidth: '640px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'var(--accent-emerald-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-emerald)',
                    fontSize: '22px'
                }}>
                    💳
                </div>
                <div>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '20px', fontWeight: '800' }}>
                        Top-Up Demo Cash
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                        Instant virtual credit injection to test trading strategies risk-free.
                    </p>
                </div>
            </div>

            <div style={{
                background: '#111927',
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Current Virtual Balance</span>
                <span style={{ color: 'var(--accent-emerald)', fontSize: '20px', fontWeight: '800' }}>
                    ₹{(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
            </div>
            
            {message && (
                <div style={{
                    padding: '14px',
                    marginBottom: '20px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-emerald-soft)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    textAlign: 'center',
                    color: 'var(--accent-emerald)',
                    fontWeight: '700',
                    fontSize: '14px'
                }}>
                    ✨ {message}
                </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px' }}>
                {plans.map((plan) => (
                    <div
                        key={plan.amount}
                        onClick={() => !loading && handleRecharge(plan)}
                        className="soft-card"
                        style={{
                            padding: '20px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#111927',
                            border: '1px solid var(--border-color)',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) {
                                e.currentTarget.style.borderColor = 'var(--accent-emerald)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600' }}>
                            {plan.desc}
                        </div>
                        <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--accent-emerald)' }}>
                            {plan.label}
                        </div>
                        <button
                            className="soft-btn soft-btn-success"
                            style={{ width: '100%', marginTop: '8px', fontSize: '13px', padding: '8px' }}
                        >
                            + Add Cash
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Recharge;