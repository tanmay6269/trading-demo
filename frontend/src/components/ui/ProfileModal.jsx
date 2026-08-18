import React, { useState, useRef } from 'react';
import { api } from '../../api';

const ProfileModal = ({ isOpen, onClose, userInfo, onLogout, onLockApp, onProfileUpdated }) => {
    const [activeTab, setActiveTab] = useState('account'); // 'account' | 'reports' | 'orders' | 'banks' | 'support'
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);
    const fileInputRef = useRef(null);

    // Profile State
    const [profilePic, setProfilePic] = useState(userInfo?.profile_pic || '');
    const [formData, setFormData] = useState({
        username: userInfo?.username || 'Trader',
        email: userInfo?.email || 'trader@groww.com',
        phone: userInfo?.phone || '+91 9876543210',
        dob: userInfo?.dob || '15-08-1998',
        pan_number: userInfo?.pan_number || 'ABCDE1234F',
        gender: userInfo?.gender || 'Male',
        marital_status: userInfo?.marital_status || 'Single',
        occupation: userInfo?.occupation || 'Professional',
        income_range: userInfo?.income_range || '5-10 Lakhs',
        father_name: userInfo?.father_name || 'Rajesh Sharma'
    });

    if (!isOpen) return null;

    const handlePhotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64Photo = reader.result;
                setProfilePic(base64Photo);
                try {
                    await api.updateProfilePhoto(base64Photo);
                    setMsg({ type: 'success', text: 'Profile photo updated successfully!' });
                    if (onProfileUpdated) onProfileUpdated();
                } catch (err) {
                    setMsg({ type: 'error', text: err.message || 'Failed to update photo' });
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await api.updateProfile(formData);
            setMsg({ type: 'success', text: res.message || 'Profile details saved successfully!' });
            setIsEditing(false);
            if (onProfileUpdated) onProfileUpdated();
        } catch (err) {
            setMsg({ type: 'error', text: err.message || 'Failed to update profile' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(10, 15, 26, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '900px',
                maxHeight: '90vh',
                background: '#111927',
                border: '1px solid var(--border-color)',
                borderRadius: '20px',
                boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'fadeIn 0.2s ease-out'
            }}>
                {/* Header Bar */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#182234'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>👤</span>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                            User Profile & Account Settings
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            fontSize: '22px',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: '6px'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Main Body */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Left Sidebar Menu */}
                    <div style={{
                        width: '260px',
                        background: '#0d131f',
                        borderRight: '1px solid var(--border-color)',
                        padding: '20px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <div>
                            {/* Profile Photo & Name Section */}
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <div 
                                    style={{
                                        position: 'relative',
                                        width: '84px',
                                        height: '84px',
                                        margin: '0 auto 12px auto',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                    title={profilePic ? 'Click to Edit Photo' : 'Click to Add Photo'}
                                >
                                    {profilePic ? (
                                        <img 
                                            src={profilePic} 
                                            alt="Profile" 
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                borderRadius: '50%',
                                                objectFit: 'cover',
                                                border: '3px solid #00d09c',
                                                boxShadow: '0 4px 14px rgba(0,208,156,0.3)'
                                            }} 
                                        />
                                    ) : (
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #00d09c 0%, #38bdf8 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '32px',
                                            color: '#ffffff',
                                            fontWeight: '800',
                                            border: '3px solid rgba(255,255,255,0.2)'
                                        }}>
                                            {formData.username ? formData.username[0].toUpperCase() : 'T'}
                                        </div>
                                    )}
                                    {/* Overlay Camera Icon */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        right: 0,
                                        background: '#00d09c',
                                        color: '#ffffff',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '14px',
                                        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                        border: '2px solid #0d131f'
                                    }}>
                                        📷
                                    </div>
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handlePhotoChange} 
                                    accept="image/*" 
                                    style={{ display: 'none' }} 
                                />
                                <div 
                                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                    style={{ 
                                        fontSize: '12px', 
                                        color: '#00d09c', 
                                        fontWeight: '700', 
                                        cursor: 'pointer',
                                        marginBottom: '6px'
                                    }}
                                >
                                    {profilePic ? '✏️ Edit Photo' : '➕ Add Photo'}
                                </div>

                                <h4 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    {formData.username}
                                </h4>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    {formData.email}
                                </div>
                                <div style={{
                                    display: 'inline-block',
                                    marginTop: '8px',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    background: 'rgba(0,208,156,0.15)',
                                    color: '#00d09c',
                                    fontSize: '10px',
                                    fontWeight: '800'
                                }}>
                                    🐂 BULL TRADER
                                </div>
                            </div>

                            {/* Menu Options List */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {[
                                    { id: 'account', label: 'Account Details', icon: '📝' },
                                    { id: 'reports', label: 'Reports & Statements', icon: '📊' },
                                    { id: 'orders', label: 'Orders & Trades', icon: '📦' },
                                    { id: 'banks', label: 'Add Banks & Funds', icon: '🏦' },
                                    { id: 'support', label: 'Customer Support', icon: '🎧' },
                                ].map((menu) => (
                                    <button
                                        key={menu.id}
                                        onClick={() => setActiveTab(menu.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: activeTab === menu.id ? 'var(--accent-primary)' : 'transparent',
                                            color: activeTab === menu.id ? '#ffffff' : 'var(--text-secondary)',
                                            fontWeight: activeTab === menu.id ? '700' : '500',
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <span>{menu.icon}</span>
                                        <span>{menu.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bottom Actions: Lock & Logout */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                            <button
                                onClick={() => { onClose(); onLockApp(); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                🔒 Lock App with PIN
                            </button>
                            <button
                                onClick={() => { onClose(); onLogout(); }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #eb5b56',
                                    background: 'rgba(235, 91, 86, 0.1)',
                                    color: '#eb5b56',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                🚪 Logout
                            </button>
                        </div>
                    </div>

                    {/* Right Content Area */}
                    <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: '#111927' }}>
                        {msg && (
                            <div style={{
                                padding: '10px 14px',
                                borderRadius: '8px',
                                marginBottom: '16px',
                                background: msg.type === 'success' ? 'rgba(0,208,156,0.15)' : 'rgba(235,91,86,0.15)',
                                color: msg.type === 'success' ? '#00d09c' : '#eb5b56',
                                border: `1px solid ${msg.type === 'success' ? '#00d09c' : '#eb5b56'}`,
                                fontSize: '13px',
                                fontWeight: '600'
                            }}>
                                {msg.text}
                            </div>
                        )}

                        {/* Account Details Tab */}
                        {activeTab === 'account' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                            Personal & KYC Account Details
                                        </h3>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            Your verified trader profile details
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsEditing(!isEditing)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid #00d09c',
                                            background: isEditing ? '#00d09c' : 'transparent',
                                            color: isEditing ? '#ffffff' : '#00d09c',
                                            fontWeight: '700',
                                            fontSize: '13px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {isEditing ? 'Cancel Edit' : '✏️ Edit Profile'}
                                    </button>
                                </div>

                                {/* Profile Fields Grid */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                    gap: '16px'
                                }}>
                                    {/* 1. Full Name */}
                                    <ProfileField 
                                        label="Full Name" 
                                        icon="👤"
                                        value={formData.username} 
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, username: v })} 
                                    />

                                    {/* 2. Mobile Number */}
                                    <ProfileField 
                                        label="Mobile Number" 
                                        icon="📱"
                                        value={formData.phone} 
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, phone: v })} 
                                    />

                                    {/* 3. Email Address */}
                                    <ProfileField 
                                        label="Email Address" 
                                        icon="✉️"
                                        value={formData.email} 
                                        isEditing={false} // Email remains verified ID
                                        hint="Verified ID"
                                    />

                                    {/* 4. Date of Birth */}
                                    <ProfileField 
                                        label="Date of Birth" 
                                        icon="🎂"
                                        value={formData.dob} 
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, dob: v })} 
                                    />

                                    {/* 5. PAN Number */}
                                    <ProfileField 
                                        label="PAN Number" 
                                        icon="🪪"
                                        value={formData.pan_number} 
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, pan_number: v.toUpperCase() })} 
                                    />

                                    {/* 6. Gender */}
                                    <ProfileSelectField 
                                        label="Gender" 
                                        icon="👥"
                                        value={formData.gender} 
                                        options={['Male', 'Female', 'Other']}
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, gender: v })} 
                                    />

                                    {/* 7. Marital Status */}
                                    <ProfileSelectField 
                                        label="Marital Status" 
                                        icon="💍"
                                        value={formData.marital_status} 
                                        options={['Single', 'Married']}
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, marital_status: v })} 
                                    />

                                    {/* 8. Father's Name */}
                                    <ProfileField 
                                        label="Father's Name" 
                                        icon="👨"
                                        value={formData.father_name} 
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, father_name: v })} 
                                    />

                                    {/* 9. Occupation */}
                                    <ProfileSelectField 
                                        label="Occupation" 
                                        icon="💼"
                                        value={formData.occupation} 
                                        options={['Professional', 'Business', 'Salaried', 'Student', 'Self-Employed']}
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, occupation: v })} 
                                    />

                                    {/* 10. Annual Income Range */}
                                    <ProfileSelectField 
                                        label="Annual Income Range" 
                                        icon="💰"
                                        value={formData.income_range} 
                                        options={['Below 1 Lakh', '1-5 Lakhs', '5-10 Lakhs', '10-25 Lakhs', '25+ Lakhs']}
                                        isEditing={isEditing} 
                                        onChange={(v) => setFormData({ ...formData, income_range: v })} 
                                    />
                                </div>

                                {isEditing && (
                                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            style={{
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color)',
                                                background: 'transparent',
                                                color: 'var(--text-secondary)',
                                                fontWeight: '600',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveProfile}
                                            disabled={saving}
                                            style={{
                                                padding: '10px 24px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: '#00d09c',
                                                color: '#ffffff',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 14px rgba(0,208,156,0.3)'
                                            }}
                                        >
                                            {saving ? 'Saving...' : '💾 Save Profile Changes'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Reports Tab */}
                        {activeTab === 'reports' && (
                            <div>
                                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>📊 Reports & Statements</h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Download tax P&L, contract notes, and trade logs.</p>
                                <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                                    {['Tax P&L Statement FY 2025-26', 'Annual Holding Statement', 'F&O Trade Ledger Log'].map((doc, idx) => (
                                        <div key={idx} style={{ padding: '14px', background: '#182234', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>📄 {doc}</span>
                                            <button style={{ padding: '6px 12px', background: '#00d09c', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>Download PDF</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Orders Tab */}
                        {activeTab === 'orders' && (
                            <div>
                                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>📦 Orders & Execution History</h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>View executed market orders and active trades.</p>
                            </div>
                        )}

                        {/* Add Banks Tab */}
                        {activeTab === 'banks' && (
                            <div>
                                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>🏦 Add Bank Accounts & UPI</h3>
                                <div style={{ padding: '16px', background: '#182234', borderRadius: '12px', marginBottom: '16px' }}>
                                    <div style={{ fontWeight: '700', color: '#00d09c' }}>HDFC Bank (Primary)</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>A/C No: •••••••• 4921 | IFSC: HDFC0001234</div>
                                </div>
                                <button style={{ padding: '10px 16px', background: '#00d09c', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>➕ Add Primary Bank Account</button>
                            </div>
                        )}

                        {/* Customer Support Tab */}
                        {activeTab === 'support' && (
                            <div>
                                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>🎧 24x7 Customer Support & Help</h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Need help with trades, PIN, or account verification?</p>
                                <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                                    <div style={{ padding: '14px', background: '#182234', borderRadius: '10px' }}>
                                        <div style={{ fontWeight: '700' }}>📞 Priority Support Helpline</div>
                                        <div style={{ fontSize: '12px', color: '#00d09c', marginTop: '4px' }}>1800-419-8765 (Toll Free)</div>
                                    </div>
                                    <div style={{ padding: '14px', background: '#182234', borderRadius: '10px' }}>
                                        <div style={{ fontWeight: '700' }}>✉️ Support Email Ticket</div>
                                        <div style={{ fontSize: '12px', color: '#00d09c', marginTop: '4px' }}>support@zenithx.com</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProfileField = ({ label, icon, value, isEditing, onChange, hint }) => (
    <div style={{
        background: '#182234',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {icon} {label}
            </span>
            {hint && <span style={{ fontSize: '10px', color: '#00d09c', fontWeight: '700' }}>{hint}</span>}
        </div>
        {isEditing ? (
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#111927',
                    border: '1px solid #00d09c',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    outline: 'none'
                }}
            />
        ) : (
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {value || '—'}
            </div>
        )}
    </div>
);

const ProfileSelectField = ({ label, icon, value, options, isEditing, onChange }) => (
    <div style={{
        background: '#182234',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)'
    }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
            {icon} {label}
        </div>
        {isEditing ? (
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#111927',
                    border: '1px solid #00d09c',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    outline: 'none'
                }}
            >
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
        ) : (
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {value || '—'}
            </div>
        )}
    </div>
);

export default ProfileModal;
