import React, { useState, useEffect } from 'react';
import { api } from '../../api';

const OptionChainModal = ({ isOpen, onClose, symbol = 'NIFTY 50', onSelectContract = () => {} }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedExpiry, setSelectedExpiry] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'ce' | 'pe'
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        const fetchChain = async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                const res = await api.getOptionChain(symbol, selectedExpiry);
                if (res && res.chain) {
                    setData(res);
                    if (!selectedExpiry && res.expiries && res.expiries.length > 0) {
                        setSelectedExpiry(res.expiries[0]);
                    }
                } else {
                    setErrorMsg('Option chain data unavailable for this symbol.');
                }
            } catch (err) {
                console.error('Option chain error:', err);
                setErrorMsg('Unable to load Option Chain. Please check connection.');
            } finally {
                setLoading(false);
            }
        };

        fetchChain();
        const interval = setInterval(fetchChain, 5000);
        return () => clearInterval(interval);
    }, [isOpen, symbol, selectedExpiry]);

    if (!isOpen) return null;

    const spotPrice = data?.spot_price || 0;
    const isSpotPos = (data?.change || 0) >= 0;

    return (
        <div className="profile-modal-container" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(10, 15, 26, 0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '12px'
        }}>
            <div className="profile-modal-card" style={{
                width: '100%',
                maxWidth: '1240px',
                maxHeight: '94vh',
                background: '#111927',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Header Bar */}
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#182234',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '22px' }}>⚡</span>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    {symbol} Option Chain
                                </h3>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    Real-Time Call (CE) & Put (PE) Derivative Matrix
                                </div>
                            </div>
                        </div>

                        {/* Spot Price Pill */}
                        {spotPrice > 0 && (
                            <div style={{
                                background: '#111927',
                                border: '1px solid var(--border-color)',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SPOT:</span>
                                <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    ₹{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                                <span style={{
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    color: isSpotPos ? '#00d09c' : '#eb5b56'
                                }}>
                                    {isSpotPos ? '+' : ''}{data?.change?.toFixed(2)} ({isSpotPos ? '+' : ''}{data?.change_percent?.toFixed(2)}%)
                                </span>
                            </div>
                        )}

                        {/* PCR Indicator Badge */}
                        {data?.pcr !== undefined && (
                            <div style={{
                                background: 'rgba(108, 92, 231, 0.12)',
                                border: '1px solid rgba(108, 92, 231, 0.3)',
                                color: '#6C5CE7',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '700'
                            }}>
                                PCR: {data.pcr} ({data.pcr >= 1.0 ? '🐂 Bullish' : '🐻 Bearish'})
                            </div>
                        )}
                    </div>

                    {/* Expiry Selector & Close Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {data?.expiries && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Expiry:</span>
                                <select
                                    value={selectedExpiry}
                                    onChange={(e) => setSelectedExpiry(e.target.value)}
                                    style={{
                                        background: '#111927',
                                        border: '1px solid #6C5CE7',
                                        color: '#ffffff',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {data.expiries.map((exp) => (
                                        <option key={exp} value={exp}>{exp}</option>
                                    ))}
                                </select>
                            </div>
                        )}

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
                </div>

                {/* Subheader Toolbar: Calls vs Puts Filter & Lot Size Info */}
                <div style={{
                    padding: '8px 20px',
                    background: '#0d131f',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px'
                }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {['all', 'ce', 'pe'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: activeTab === tab ? '#6C5CE7' : 'transparent',
                                    color: activeTab === tab ? '#ffffff' : 'var(--text-secondary)',
                                    fontSize: '12px',
                                    fontWeight: activeTab === tab ? '700' : '500',
                                    cursor: 'pointer',
                                    textTransform: 'uppercase'
                                }}
                            >
                                {tab === 'all' ? 'CE & PE Chain' : tab === 'ce' ? 'CALLS (CE)' : 'PUTS (PE)'}
                            </button>
                        ))}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        📦 Lot Size: <strong style={{ color: 'var(--text-primary)' }}>{data?.lot_size || 50} Qty</strong> | 
                        Total Call OI: <strong style={{ color: '#00d09c' }}>{data?.total_ce_oi?.toLocaleString()}</strong> | 
                        Total Put OI: <strong style={{ color: '#eb5b56' }}>{data?.total_pe_oi?.toLocaleString()}</strong>
                    </div>
                </div>

                {/* Main Option Chain Grid Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#6C5CE7', fontWeight: '700' }}>
                            ⚡ Loading real-time Option Chain for {symbol}...
                        </div>
                    ) : errorMsg ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#eb5b56', fontWeight: '700' }}>
                            ⚠️ {errorMsg}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#182234', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                                    {(activeTab === 'all' || activeTab === 'ce') && (
                                        <>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>CALL OI</th>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>OI CHG</th>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>VOL</th>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>IV</th>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>LTP</th>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#00d09c' }}>TRADE CE</th>
                                        </>
                                    )}

                                    <th style={{ padding: '10px', textAlign: 'center', background: '#243247', color: '#ffffff', minWidth: '100px', fontWeight: '800' }}>
                                        STRIKE
                                    </th>

                                    {(activeTab === 'all' || activeTab === 'pe') && (
                                        <>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#eb5b56' }}>TRADE PE</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>LTP</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>IV</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>VOL</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>OI CHG</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>PUT OI</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data?.chain?.map((row) => {
                                    const isAtm = row.is_atm;
                                    const ceItm = row.ce.is_itm;
                                    const peItm = row.pe.is_itm;

                                    return (
                                        <tr
                                            key={row.strike}
                                            style={{
                                                borderBottom: '1px solid #1c2638',
                                                background: isAtm ? 'rgba(108, 92, 231, 0.18)' : 'transparent',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {/* CALLS (CE) SIDE */}
                                            {(activeTab === 'all' || activeTab === 'ce') && (
                                                <>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                        {row.ce.oi.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: row.ce.oi_change >= 0 ? '#00d09c' : '#eb5b56' }}>
                                                        {row.ce.oi_change >= 0 ? '+' : ''}{row.ce.oi_change.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-muted)' }}>
                                                        {row.ce.volume.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-muted)' }}>
                                                        {row.ce.iv}%
                                                    </td>
                                                    <td 
                                                        onClick={() => {
                                                            onSelectContract(row.ce.symbol, 'BUY', row.ce.ltp);
                                                            onClose();
                                                        }}
                                                        style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', fontWeight: '700', color: '#00d09c', cursor: 'pointer' }}
                                                        title={`Click to open ${row.ce.symbol} chart & trade panel`}
                                                    >
                                                        ₹{row.ce.ltp.toFixed(2)} 📈
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent' }}>
                                                        <button
                                                            onClick={() => {
                                                                onSelectContract(row.ce.symbol, 'BUY', row.ce.ltp);
                                                                onClose();
                                                            }}
                                                            style={{
                                                                background: '#00d09c',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                padding: '4px 10px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            BUY CE
                                                        </button>
                                                    </td>
                                                </>
                                            )}

                                            {/* CENTER STRIKE */}
                                            <td 
                                                onClick={() => {
                                                    onSelectContract(row.ce.symbol, 'BUY', row.ce.ltp);
                                                    onClose();
                                                }}
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    background: isAtm ? '#6C5CE7' : '#182234',
                                                    color: '#ffffff',
                                                    fontWeight: '800',
                                                    fontSize: '13px',
                                                    cursor: 'pointer'
                                                }}
                                                title={`Click to view ${row.strike} CE chart & trade panel`}
                                            >
                                                {row.strike.toFixed(2)}
                                                {isAtm && <span style={{ display: 'block', fontSize: '9px', opacity: 0.9 }}>ATM</span>}
                                            </td>

                                            {/* PUTS (PE) SIDE */}
                                            {(activeTab === 'all' || activeTab === 'pe') && (
                                                <>
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent' }}>
                                                        <button
                                                            onClick={() => {
                                                                onSelectContract(row.pe.symbol, 'BUY', row.pe.ltp);
                                                                onClose();
                                                            }}
                                                            style={{
                                                                background: '#eb5b56',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                padding: '4px 10px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            BUY PE
                                                        </button>
                                                    </td>
                                                    <td 
                                                        onClick={() => {
                                                            onSelectContract(row.pe.symbol, 'BUY', row.pe.ltp);
                                                            onClose();
                                                        }}
                                                        style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', fontWeight: '700', color: '#eb5b56', cursor: 'pointer' }}
                                                        title={`Click to open ${row.pe.symbol} chart & trade panel`}
                                                    >
                                                        📈 ₹{row.pe.ltp.toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-muted)' }}>
                                                        {row.pe.iv}%
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-muted)' }}>
                                                        {row.pe.volume.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: row.pe.oi_change >= 0 ? '#00d09c' : '#eb5b56' }}>
                                                        {row.pe.oi_change >= 0 ? '+' : ''}{row.pe.oi_change.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                        {row.pe.oi.toLocaleString()}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OptionChainModal;
