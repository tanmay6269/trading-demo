import React, { useState, useEffect } from 'react';
import api from '../../api';
import BullMarketIcon from './BullMarketIcon';

const AuthScreen = ({ onLoginSuccess, showToast = () => {} }) => {
    const [mode, setMode] = useState('login'); // 'login' | 'register' | 'pin_unlock'
    const [step, setStep] = useState(1); // 1: Form, 2: OTP, 3: Set MPIN

    // Form inputs
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // OTP state
    const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
    const [demoOtpHint, setDemoOtpHint] = useState('');
    const [otpTimer, setOtpTimer] = useState(60);

    // MPIN state
    const [mpin, setMpin] = useState(['', '', '', '']);
    const [confirmMpin, setConfirmMpin] = useState(['', '', '', '']);
    const [mpinPhase, setMpinPhase] = useState('create'); // 'create' | 'confirm'

    // Status & Loading
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [activeIdentifier, setActiveIdentifier] = useState('');
    const [authenticatedUser, setAuthenticatedUser] = useState('');

    // Load persistent saved user account for 1-click PIN unlock
    useEffect(() => {
        try {
            const saved = localStorage.getItem('saved_trader');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.username) {
                    setAuthenticatedUser(parsed.username);
                    setActiveIdentifier(parsed.email || parsed.username);
                    setMode('pin_unlock');
                }
            }
        } catch (e) {}
    }, []);

    // OTP Timer Effect
    useEffect(() => {
        let interval = null;
        if (step === 2 && otpTimer > 0) {
            interval = setInterval(() => setOtpTimer(t => t - 1), 1000);
        }
        return () => clearInterval(interval);
    }, [step, otpTimer]);

    // Keyboard Listener for Laptop Keypad / Physical Keyboard Numpad
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (mode !== 'pin_unlock' && step !== 3) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                handleKeypadPress(e.key);
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                handleKeypadPress('⌫');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (mode === 'pin_unlock') {
                    const pinStr = mpin.join('');
                    if (pinStr.length === 4) {
                        handleUnlockMpin(mpin);
                    }
                } else if (step === 3) {
                    handleSetMpin();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, step, mpin, confirmMpin, mpinPhase]);

    // Password strength calculation
    const getPasswordStrength = (pwd) => {
        if (!pwd) return { label: '', color: '#64748b', percent: 0 };
        let score = 0;
        if (pwd.length >= 6) score += 25;
        if (pwd.length >= 10) score += 25;
        if (/[A-Z]/.test(pwd)) score += 25;
        if (/[0-9!@#$%^&*]/.test(pwd)) score += 25;

        if (score <= 25) return { label: 'Weak', color: '#f43f5e', percent: 25 };
        if (score <= 50) return { label: 'Medium', color: '#f59e0b', percent: 50 };
        if (score <= 75) return { label: 'Strong', color: '#38bdf8', percent: 75 };
        return { label: 'Very Strong 🔒', color: '#10b981', percent: 100 };
    };

    const pwdStrength = getPasswordStrength(password);

    // Step 1 Registration Submission -> Trigger OTP
    const handleRegisterStep1 = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!username || !email || !password) {
            setErrorMsg('Please fill in all required fields.');
            return;
        }
        if (password !== confirmPassword) {
            setErrorMsg('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            const res = await api.registerStep1(username, email, phone, password);
            if (res.success) {
                setActiveIdentifier(res.identifier);
                if (res.demo_otp) setDemoOtpHint(res.demo_otp);
                setStep(2);
                setOtpTimer(60);
                showToast(`🔒 OTP sent to ${res.identifier}`);
            }
        } catch (err) {
            setErrorMsg(err.message || 'Registration failed');
        }
        setLoading(false);
    };

    // Step 2 OTP Verification Submission
    const handleVerifyOtp = async (e) => {
        if (e) e.preventDefault();
        const code = otpCode.join('');
        if (code.length !== 6) {
            setErrorMsg('Please enter all 6 digits of the OTP.');
            return;
        }
        setErrorMsg('');
        setLoading(true);
        try {
            const res = await api.verifyOTP(activeIdentifier, code);
            if (res.success) {
                setStep(3);
                showToast('✅ OTP Verified! Now set your 4-digit Security PIN');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Invalid OTP code');
        }
        setLoading(false);
    };

    // Step 3 Set 4-Digit Security PIN (MPIN)
    const handleSetMpin = async () => {
        const pinStr = mpin.join('');
        if (pinStr.length !== 4) {
            setErrorMsg('Please enter a 4-digit Security PIN.');
            return;
        }

        if (mpinPhase === 'create') {
            setMpinPhase('confirm');
            setErrorMsg('');
            return;
        }

        const confirmStr = confirmMpin.join('');
        if (pinStr !== confirmStr) {
            setErrorMsg('PINs do not match. Please try again.');
            setConfirmMpin(['', '', '', '']);
            return;
        }

        setErrorMsg('');
        setLoading(true);
        try {
            const res = await api.setMPIN(activeIdentifier, pinStr);
            if (res.success) {
                try {
                    localStorage.setItem('saved_trader', JSON.stringify({
                        username: res.user,
                        email: activeIdentifier || res.user
                    }));
                } catch (e) {}
                showToast('🎉 Security PIN created! Welcome to Groww Terminal');
                onLoginSuccess({ username: res.user, balance: res.balance });
            }
        } catch (err) {
            setErrorMsg(err.message || 'Failed to set PIN');
        }
        setLoading(false);
    };

    // Login with Password Step 1
    const handleLoginPassword = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!email || !password) {
            setErrorMsg('Please enter your email and password.');
            return;
        }
        setLoading(true);
        try {
            const res = await api.loginPassword(email, password);
            if (res.success) {
                setActiveIdentifier(res.identifier);
                setAuthenticatedUser(res.username);
                try {
                    localStorage.setItem('saved_trader', JSON.stringify({
                        username: res.username,
                        email: res.identifier
                    }));
                } catch (e) {}
                if (res.req_pin) {
                    setMode('pin_unlock');
                    setErrorMsg('');
                } else {
                    onLoginSuccess({ username: res.username });
                }
            }
        } catch (err) {
            setErrorMsg(err.message || 'Login failed');
        }
        setLoading(false);
    };

    // Unlock with 4-Digit Security PIN (MPIN)
    const handleUnlockMpin = async (pinDigits) => {
        const pinStr = (pinDigits || mpin).join('');
        if (pinStr.length !== 4) return;

        setErrorMsg('');
        setLoading(true);
        try {
            const res = await api.verifyMPIN(activeIdentifier, pinStr);
            if (res.success) {
                try {
                    localStorage.setItem('saved_trader', JSON.stringify({
                        username: res.user,
                        email: activeIdentifier || res.user
                    }));
                } catch (e) {}
                showToast(`🔓 Terminal Unlocked! Welcome ${res.user}`);
                onLoginSuccess({ username: res.user, balance: res.balance });
            }
        } catch (err) {
            setErrorMsg('Incorrect 4-digit Security PIN. Please try again.');
            setMpin(['', '', '', '']);
        }
        setLoading(false);
    };

    // Virtual Numeric Keypad Press
    const handleKeypadPress = (val) => {
        if (mode === 'pin_unlock') {
            const emptyIdx = mpin.findIndex(d => d === '');
            if (val === '⌫') {
                const lastIdx = mpin.map(d => d !== '').lastIndexOf(true);
                if (lastIdx !== -1) {
                    const newPin = [...mpin];
                    newPin[lastIdx] = '';
                    setMpin(newPin);
                }
            } else if (emptyIdx !== -1) {
                const newPin = [...mpin];
                newPin[emptyIdx] = val;
                setMpin(newPin);
                if (emptyIdx === 3) {
                    handleUnlockMpin(newPin);
                }
            }
        } else if (step === 3) {
            const targetArr = mpinPhase === 'create' ? mpin : confirmMpin;
            const setTargetArr = mpinPhase === 'create' ? setMpin : setConfirmMpin;
            const emptyIdx = targetArr.findIndex(d => d === '');

            if (val === '⌫') {
                const lastIdx = targetArr.map(d => d !== '').lastIndexOf(true);
                if (lastIdx !== -1) {
                    const newArr = [...targetArr];
                    newArr[lastIdx] = '';
                    setTargetArr(newArr);
                }
            } else if (emptyIdx !== -1) {
                const newArr = [...targetArr];
                newArr[emptyIdx] = val;
                setTargetArr(newArr);
            }
        }
    };

    // Quick Guest Demo Login
    const handleGuestDemo = async () => {
        setLoading(true);
        try {
            const res = await api.loginGuest();
            onLoginSuccess({ username: res.user, balance: res.balance });
            showToast('🚀 Logged in as Demo Trader');
        } catch (e) {
            setErrorMsg('Guest login failed');
        }
        setLoading(false);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(circle at 50% 30%, #1e2c45 0%, #0e1626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            overflowY: 'auto'
        }}>
            <div className="soft-card fade-in" style={{
                width: '100%',
                maxWidth: '440px',
                padding: '32px 28px',
                background: '#182234',
                border: '1px solid var(--border-color)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                borderRadius: '20px',
                textAlign: 'center'
            }}>
                {/* BullX Logo & Header */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <BullMarketIcon size={96} />
                    <span style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                        Bull<span style={{ color: '#00d09c' }}>X</span>
                    </span>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', fontWeight: '600' }}>
                    BSE & NSE Stock Trading Platform
                </div>

                {/* Groww Tab Mode Switcher: Sign In vs Create Account */}
                {mode !== 'pin_unlock' && step === 1 && (
                    <div style={{
                        display: 'flex',
                        background: '#111927',
                        padding: '4px',
                        borderRadius: '12px',
                        marginBottom: '24px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <button
                            onClick={() => { setMode('login'); setErrorMsg(''); }}
                            style={{
                                flex: 1,
                                padding: '9px',
                                borderRadius: '8px',
                                border: 'none',
                                background: mode === 'login' ? 'var(--accent-primary)' : 'transparent',
                                color: mode === 'login' ? '#ffffff' : 'var(--text-secondary)',
                                fontWeight: '800',
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => { setMode('register'); setErrorMsg(''); }}
                            style={{
                                flex: 1,
                                padding: '9px',
                                borderRadius: '8px',
                                border: 'none',
                                background: mode === 'register' ? 'var(--accent-emerald)' : 'transparent',
                                color: mode === 'register' ? '#ffffff' : 'var(--text-secondary)',
                                fontWeight: '800',
                                fontSize: '13px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Create Account
                        </button>
                    </div>
                )}

                {/* Error Banner */}
                {errorMsg && (
                    <div style={{
                        background: 'rgba(244, 63, 94, 0.12)',
                        border: '1px solid var(--accent-rose)',
                        color: 'var(--accent-rose)',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700',
                        marginBottom: '18px',
                        textAlign: 'center'
                    }}>
                        ⚠️ {errorMsg}
                    </div>
                )}

                {/* MODE 1: GROWW 4-DIGIT SECURITY PIN UNLOCK SCREEN */}
                {mode === 'pin_unlock' && (
                    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #818cf8 0%, #38bdf8 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '28px',
                            marginBottom: '12px',
                            boxShadow: '0 8px 24px rgba(56, 189, 248, 0.3)'
                        }}>
                            👤
                        </div>

                        <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                            Welcome Back, {authenticatedUser || 'Trader'}
                        </h3>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            🔒 Enter 4-digit Security PIN to unlock Groww Terminal
                        </div>

                        {/* 4 PIN Dots Display */}
                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '16px' }}>
                            {[0, 1, 2, 3].map((idx) => {
                                const filled = mpin[idx] !== '';
                                return (
                                    <div
                                        key={idx}
                                        style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '50%',
                                            background: filled ? 'var(--accent-emerald)' : 'transparent',
                                            border: filled ? '2px solid var(--accent-emerald)' : '2px solid var(--border-color)',
                                            boxShadow: filled ? '0 0 12px rgba(0, 208, 156, 0.6)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    />
                                );
                            })}
                        </div>

                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                            ⌨️ Type directly using your laptop keyboard or numpad
                        </div>

                        {/* Virtual Numeric Keypad */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', width: '100%', maxWidth: '280px', marginBottom: '20px' }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((val, i) => {
                                if (val === '') return <div key={i} />;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleKeypadPress(val)}
                                        style={{
                                            background: '#111927',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-primary)',
                                            padding: '14px',
                                            borderRadius: '12px',
                                            fontSize: '18px',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                                        }}
                                        className="keypad-btn"
                                    >
                                        {val}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => {
                                try { localStorage.removeItem('saved_trader'); } catch (e) {}
                                setMode('login');
                                setMpin(['', '', '', '']);
                                setErrorMsg('');
                            }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '12px', cursor: 'pointer', fontWeight: '700' }}
                        >
                            Switch Account / Password Login
                        </button>
                    </div>
                )}

                {/* MODE 2: LOGIN WITH EMAIL & PASSWORD */}
                {mode === 'login' && step === 1 && (
                    <form onSubmit={handleLoginPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                Email or Mobile Number
                            </label>
                            <input
                                type="text"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    background: '#111927',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    background: '#111927',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                background: 'linear-gradient(135deg, #00d09c 0%, #0284c7 100%)',
                                color: '#ffffff',
                                border: 'none',
                                padding: '14px',
                                borderRadius: '12px',
                                fontSize: '15px',
                                fontWeight: '800',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                marginTop: '8px',
                                boxShadow: '0 4px 14px rgba(0, 208, 156, 0.4)'
                            }}
                        >
                            {loading ? 'Verifying Credentials...' : 'Continue ›'}
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '10px 0' }}>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>OR</span>
                            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                        </div>

                        <button
                            type="button"
                            onClick={handleGuestDemo}
                            style={{
                                background: '#111927',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                padding: '12px',
                                borderRadius: '10px',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            🚀 Continue as Guest Demo Trader
                        </button>
                    </form>
                )}

                {/* MODE 3: REGISTRATION FLOW (STEPS 1, 2, 3) */}
                {mode === 'register' && (
                    <>
                        {/* STEP 1: REGISTRATION FORM */}
                        {step === 1 && (
                            <form onSubmit={handleRegisterStep1} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                        Full Name
                                    </label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Pragya"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: '#111927',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '13px'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="pragya@example.com"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: '#111927',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '13px'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                        Mobile Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+91 9876543210"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: '#111927',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '13px'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Minimum 6 characters"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: '#111927',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '13px'
                                        }}
                                    />
                                    {/* Password Strength Indicator */}
                                    {password && (
                                        <div style={{ marginTop: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: pwdStrength.color }}>
                                                <span>Strength</span>
                                                <span>{pwdStrength.label}</span>
                                            </div>
                                            <div style={{ height: '4px', background: '#111927', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                                                <div style={{ width: `${pwdStrength.percent}%`, height: '100%', background: pwdStrength.color, transition: 'all 0.3s' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                        Confirm Password
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Re-enter password"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            background: '#111927',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '13px'
                                        }}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        background: 'linear-gradient(135deg, #00d09c 0%, #0284c7 100%)',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: '800',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        marginTop: '6px'
                                    }}
                                >
                                    {loading ? 'Sending OTP...' : 'Submit & Send OTP ›'}
                                </button>
                            </form>
                        )}

                        {/* STEP 2: 6-DIGIT OTP VERIFICATION SCREEN */}
                        {step === 2 && (
                            <div className="fade-in">
                                <div style={{ fontSize: '32px', marginBottom: '10px' }}>📲</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    Enter 6-Digit OTP
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                    We sent a verification code to <strong style={{ color: 'var(--text-primary)' }}>{activeIdentifier}</strong>
                                </div>

                                {/* Demo OTP Notification Banner */}
                                {demoOtpHint && (
                                    <div style={{
                                        background: 'var(--accent-emerald-soft)',
                                        border: '1px solid var(--accent-emerald)',
                                        color: 'var(--accent-emerald)',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: '800',
                                        marginBottom: '20px'
                                    }}>
                                        🔑 Demo OTP Code: <span style={{ letterSpacing: '4px', fontSize: '16px' }}>{demoOtpHint}</span>
                                    </div>
                                )}

                                {/* 6 Digits OTP Input Boxes */}
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '24px' }}>
                                    {otpCode.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            id={`otp-box-${idx}`}
                                            type="text"
                                            maxLength="1"
                                            value={digit}
                                            onChange={(e) => {
                                                const val = e.target.value.slice(-1);
                                                const newOtp = [...otpCode];
                                                newOtp[idx] = val;
                                                setOtpCode(newOtp);
                                                if (val && idx < 5) {
                                                    const nextBox = document.getElementById(`otp-box-${idx + 1}`);
                                                    if (nextBox) nextBox.focus();
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Backspace' && !otpCode[idx] && idx > 0) {
                                                    const prevBox = document.getElementById(`otp-box-${idx - 1}`);
                                                    if (prevBox) prevBox.focus();
                                                }
                                            }}
                                            style={{
                                                width: '44px',
                                                height: '50px',
                                                borderRadius: '10px',
                                                background: '#111927',
                                                border: '2px solid var(--border-color)',
                                                color: 'var(--accent-emerald)',
                                                fontSize: '20px',
                                                fontWeight: '800',
                                                textAlign: 'center',
                                                outline: 'none'
                                            }}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={handleVerifyOtp}
                                    disabled={loading}
                                    style={{
                                        width: '100%',
                                        background: 'linear-gradient(135deg, #00d09c 0%, #0284c7 100%)',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '14px',
                                        borderRadius: '12px',
                                        fontSize: '15px',
                                        fontWeight: '800',
                                        cursor: loading ? 'not-allowed' : 'pointer',
                                        marginBottom: '16px'
                                    }}
                                >
                                    {loading ? 'Verifying OTP...' : 'Verify OTP ›'}
                                </button>

                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {otpTimer > 0 ? (
                                        <span>Resend OTP code in <strong>0:{otpTimer < 10 ? `0${otpTimer}` : otpTimer}</strong></span>
                                    ) : (
                                        <button
                                            onClick={() => setStep(1)}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: '700' }}
                                        >
                                            Resend OTP Code
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* STEP 3: CREATE 4-DIGIT SECURITY PIN (MPIN) */}
                        {step === 3 && (
                            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔐</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    {mpinPhase === 'create' ? 'Create 4-Digit Security PIN' : 'Confirm 4-Digit Security PIN'}
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                                    {mpinPhase === 'create' ? 'Set a 4-digit PIN to secure your Groww account' : 'Re-enter your 4-digit PIN to confirm'}
                                </div>

                                {/* 4 PIN Dots Display */}
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '24px' }}>
                                    {[0, 1, 2, 3].map((idx) => {
                                        const targetArr = mpinPhase === 'create' ? mpin : confirmMpin;
                                        const filled = targetArr[idx] !== '';
                                        return (
                                            <div
                                                key={idx}
                                                style={{
                                                    width: '18px',
                                                    height: '18px',
                                                    borderRadius: '50%',
                                                    background: filled ? 'var(--accent-emerald)' : 'transparent',
                                                    border: filled ? '2px solid var(--accent-emerald)' : '2px solid var(--border-color)',
                                                    boxShadow: filled ? '0 0 12px rgba(0, 208, 156, 0.6)' : 'none',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Virtual Numeric Keypad */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', width: '100%', maxWidth: '280px', marginBottom: '20px' }}>
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((val, i) => {
                                        if (val === '') return <div key={i} />;
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleKeypadPress(val)}
                                                style={{
                                                    background: '#111927',
                                                    border: '1px solid var(--border-color)',
                                                    color: 'var(--text-primary)',
                                                    padding: '14px',
                                                    borderRadius: '12px',
                                                    fontSize: '18px',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {val}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={handleSetMpin}
                                    disabled={loading}
                                    style={{
                                        width: '100%',
                                        background: 'linear-gradient(135deg, #00d09c 0%, #0284c7 100%)',
                                        color: '#ffffff',
                                        border: 'none',
                                        padding: '14px',
                                        borderRadius: '12px',
                                        fontSize: '15px',
                                        fontWeight: '800',
                                        cursor: loading ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {loading ? 'Finalizing Setup...' : (mpinPhase === 'create' ? 'Continue ›' : 'Confirm & Complete Registration ✨')}
                                </button>
                            </div>
                        )}
                    </>
                )}

            </div>
        </div>
    );
};

export default AuthScreen;
