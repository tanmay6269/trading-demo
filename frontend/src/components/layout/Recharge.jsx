import React, { useState } from 'react';
import api from '../../api';

const Recharge = ({ onRecharge, balance }) => {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [utrNumber, setUtrNumber] = useState('');
    const [copied, setCopied] = useState(false);

    const upiId = "bullx@upi";
    const packageAmount = 100000;
    const realPrice = 500;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=upi://pay?pa=${upiId}&pn=BullX%20Trading&am=${realPrice}&cu=INR`;

    const handleCopyUPI = () => {
        navigator.clipboard.writeText(upiId);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    const handleSubmitPayment = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setMessage('');

        if (!utrNumber || utrNumber.trim().length < 8) {
            setErrorMsg('Please enter a valid 12-digit UPI UTR / Transaction Reference Number.');
            return;
        }

        setLoading(true);
        try {
            const res = await api.submitPaymentUTR(utrNumber.trim(), packageAmount, realPrice);
            if (res.success) {
                setMessage(res.message);
                setIsPaymentModalOpen(false);
                setUtrNumber('');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Payment submission failed. Please check your UTR number.');
        }
        setLoading(false);
    };

    return (
        <div className="soft-card fade-in" style={{ padding: '32px', maxWidth: '640px', margin: '0 auto', background: 'var(--bg-surface)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #00d09c 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '24px',
                    boxShadow: '0 4px 14px rgba(0, 208, 156, 0.3)'
                }}>
                    💳
                </div>
                <div>
                    <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '22px', fontWeight: '900' }}>
                        Recharge Demo Trading Cash
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>
                        Official UPI Payment & Wallet Credit Gateway
                    </p>
                </div>
            </div>

            {/* Current Balance */}
            <div style={{
                background: '#0d131f',
                padding: '18px 24px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>Current Wallet Balance</span>
                <span style={{ color: '#00d09c', fontSize: '22px', fontWeight: '900' }}>
                    ₹{(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
            </div>

            {/* Strict Notice Banner */}
            <div style={{
                padding: '14px 18px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '13px',
                fontWeight: '700',
                marginBottom: '24px',
                lineHeight: '1.5'
            }}>
                🔒 <strong>Direct Free Cash Add Disabled:</strong> Users cannot add funds directly. To credit <strong>₹1,00,000 Demo Trading Funds</strong>, you must complete the <strong>₹500 Real Money Payment</strong> via UPI / QR Code below.
            </div>

            {/* Status Messages */}
            {message && (
                <div style={{
                    padding: '16px',
                    marginBottom: '24px',
                    borderRadius: '12px',
                    background: 'rgba(0, 208, 156, 0.12)',
                    border: '1px solid rgba(0, 208, 156, 0.4)',
                    textAlign: 'center',
                    color: '#00d09c',
                    fontWeight: '700',
                    fontSize: '14px',
                    lineHeight: '1.5'
                }}>
                    {message}
                </div>
            )}

            {/* Package Card */}
            <div style={{
                background: 'linear-gradient(135deg, #111927 0%, #172436 100%)',
                padding: '24px',
                borderRadius: '16px',
                border: '2px solid #00d09c',
                boxShadow: '0 8px 24px rgba(0, 208, 156, 0.15)',
                textAlign: 'center',
                marginBottom: '20px'
            }}>
                <div style={{ fontSize: '12px', color: '#f59e0b', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>
                    🌟 Most Popular Pack
                </div>
                <h3 style={{ margin: '0 0 4px 0', color: '#ffffff', fontSize: '28px', fontWeight: '900' }}>
                    ₹1,00,000 <span style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: '600' }}>Demo Funds</span>
                </h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
                    Recharge Price: <strong style={{ color: '#00d09c', fontSize: '18px' }}>₹500 INR</strong> (Real Money)
                </div>

                <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    style={{
                        width: '100%',
                        padding: '14px 24px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #00d09c 0%, #10b981 100%)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(0, 208, 156, 0.4)',
                        transition: 'transform 0.2s ease'
                    }}
                >
                    💳 Pay ₹500 via UPI / QR Code
                </button>
            </div>

            {/* UPI Payment Modal */}
            {isPaymentModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div className="fade-in" style={{
                        background: '#0d131f',
                        width: '100%',
                        maxWidth: '460px',
                        borderRadius: '20px',
                        border: '1.5px solid #00d09c',
                        padding: '28px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                        textAlign: 'center',
                        position: 'relative'
                    }}>
                        {/* Close Button */}
                        <button
                            onClick={() => setIsPaymentModalOpen(false)}
                            style={{
                                position: 'absolute',
                                top: '16px',
                                right: '16px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                fontSize: '20px',
                                cursor: 'pointer'
                            }}
                        >
                            ✕
                        </button>

                        <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: '900', color: '#ffffff' }}>
                            📱 UPI / QR Payment Checkout
                        </h3>
                        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Pay <strong>₹500 INR</strong> to get <strong>₹1,00,000 Demo Cash</strong>
                        </p>

                        {/* QR Code Container */}
                        <div style={{
                            background: '#ffffff',
                            padding: '14px',
                            borderRadius: '16px',
                            display: 'inline-block',
                            marginBottom: '16px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                        }}>
                            <img 
                                src={qrUrl} 
                                alt="UPI QR Code" 
                                style={{ width: '190px', height: '190px', display: 'block' }} 
                            />
                        </div>

                        {/* UPI ID Row */}
                        <div style={{
                            background: '#162032',
                            padding: '10px 16px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            justify: 'space-between',
                            alignItems: 'center',
                            marginBottom: '20px'
                        }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>UPI ID: <strong style={{ color: '#ffffff' }}>{upiId}</strong></span>
                            <button
                                onClick={handleCopyUPI}
                                style={{
                                    background: 'rgba(0, 208, 156, 0.15)',
                                    color: '#00d09c',
                                    border: 'none',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                {copied ? '✓ Copied' : '📋 Copy'}
                            </button>
                        </div>

                        {/* UTR Verification Form */}
                        <form onSubmit={handleSubmitPayment}>
                            <div style={{ textAlign: 'left', marginBottom: '16px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '700', display: 'block', marginBottom: '6px' }}>
                                    12-Digit UPI UTR / Ref No. (From Payment Receipt)
                                </label>
                                <input
                                    type="text"
                                    value={utrNumber}
                                    onChange={(e) => setUtrNumber(e.target.value)}
                                    placeholder="e.g. 423456789012"
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        borderRadius: '10px',
                                        background: '#162032',
                                        border: '1px solid var(--border-color)',
                                        color: '#ffffff',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {errorMsg && (
                                <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '14px', fontWeight: '700' }}>
                                    ⚠️ {errorMsg}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #00d09c 0%, #10b981 100%)',
                                    color: '#ffffff',
                                    border: 'none',
                                    fontSize: '15px',
                                    fontWeight: '800',
                                    cursor: loading ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {loading ? 'Submitting...' : '✅ Submit UTR for Verification'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Recharge;