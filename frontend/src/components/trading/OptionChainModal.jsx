import React, { useState, useEffect } from 'react';
import { api } from '../../api';

const OptionChainModal = ({ isOpen, onClose, symbol = 'NIFTY 50', onSelectContract = () => {} }) => {
    const [exchange, setExchange] = useState('NSE'); // 'NSE' | 'BSE'
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedExpiry, setSelectedExpiry] = useState('');
    const [activeSide, setActiveSide] = useState('all'); // 'all' | 'ce' | 'pe'
    const [columnView, setColumnView] = useState('compact'); // 'compact' | 'greeks' | 'full'
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;

        const fetchChain = async () => {
            setLoading(true);
            setErrorMsg('');
            try {
                const res = await api.getOptionChain(symbol, selectedExpiry, exchange);
                if (!isMounted) return;

                if (res && res.chain && res.chain.length > 0) {
                    setData(res);
                    if (!selectedExpiry || !res.expiries?.includes(selectedExpiry)) {
                        setSelectedExpiry(res.selected_expiry || res.expiries?.[0] || '');
                    }
                } else {
                    setErrorMsg(`Option chain data temporarily unavailable for ${symbol} on ${exchange}.`);
                }
            } catch (err) {
                console.error('Option chain error:', err);
                if (isMounted) setErrorMsg(`Unable to fetch ${symbol} Option Chain on ${exchange}. Please retry.`);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchChain();
        const interval = setInterval(fetchChain, 4000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [isOpen, symbol, selectedExpiry, exchange]);

    if (!isOpen) return null;

    const spotPrice = data?.spot_price || 0;
    const isSpotPos = (data?.change || 0) >= 0;
    const vix = data?.india_vix;

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
                maxWidth: '1280px',
                maxHeight: '94vh',
                background: '#111927',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* 1. Header Bar: Exchange Switcher, Stock Symbol & India VIX */}
                <div style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#182234',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        
                        {/* Exchange Toggle Switcher (NSE / BSE) */}
                        <div style={{
                            display: 'flex',
                            background: '#111927',
                            padding: '3px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)'
                        }}>
                            {['NSE', 'BSE'].map((ex) => (
                                <button
                                    key={ex}
                                    onClick={() => {
                                        setExchange(ex);
                                        setSelectedExpiry('');
                                    }}
                                    style={{
                                        padding: '5px 14px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: exchange === ex ? '#6C5CE7' : 'transparent',
                                        color: exchange === ex ? '#ffffff' : 'var(--text-secondary)',
                                        fontWeight: '800',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {ex}
                                </button>
                            ))}
                        </div>

                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {symbol} Option Chain
                                <span style={{
                                    fontSize: '10px',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: exchange === 'NSE' ? 'rgba(0, 208, 156, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                    color: exchange === 'NSE' ? '#00d09c' : '#eab308',
                                    fontWeight: '800'
                                }}>
                                    {exchange} DERIVATIVES
                                </span>
                            </h3>
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

                        {/* India VIX Badge */}
                        {vix && (
                            <div style={{
                                background: 'rgba(234, 179, 8, 0.12)',
                                border: '1px solid rgba(234, 179, 8, 0.3)',
                                color: '#eab308',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }} title="India Volatility Index">
                                <span>🇮🇳 INDIA VIX: {vix.price}</span>
                                <span style={{ fontSize: '10px' }}>({vix.change >= 0 ? '+' : ''}{vix.change_percent}%)</span>
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

                {/* 2. Subheader Metrics: SEBI Expiry Badge, PCR, Max Pain & Column View Filter */}
                <div style={{
                    padding: '8px 20px',
                    background: '#0d131f',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* SEBI 2024 Compliance Badge */}
                        <div style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: data?.is_weekly ? 'rgba(0, 208, 156, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            color: data?.is_weekly ? '#00d09c' : '#38bdf8',
                            fontSize: '11px',
                            fontWeight: '800'
                        }}>
                            {data?.is_weekly ? '📅 Weekly Contract' : '🗓️ Monthly Contract Only (SEBI Rule)'}
                        </div>

                        {/* PCR Badge */}
                        {data?.pcr !== undefined && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                                PCR: <strong style={{ color: '#6C5CE7' }}>{data.pcr}</strong> ({data.pcr >= 1.0 ? '🐂 Bullish' : '🐻 Bearish'})
                            </div>
                        )}

                        {/* Max Pain Strike */}
                        {data?.max_pain && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                                Max Pain: <strong style={{ color: '#eab308' }}>₹{data.max_pain}</strong>
                            </div>
                        )}

                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            📦 Lot Size: <strong style={{ color: 'var(--text-primary)' }}>{data?.lot_size || 250} Qty</strong>
                        </div>
                    </div>

                    {/* Columns View Switcher (Compact | Greeks | Full) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '4px', background: '#111927', padding: '2px', borderRadius: '6px' }}>
                            {[
                                { id: 'compact', label: 'Compact' },
                                { id: 'greeks', label: 'Greeks (Δ, Γ, Θ, ν)' },
                                { id: 'full', label: 'Full View' }
                            ].map((v) => (
                                <button
                                    key={v.id}
                                    onClick={() => setColumnView(v.id)}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: columnView === v.id ? '#6C5CE7' : 'transparent',
                                        color: columnView === v.id ? '#ffffff' : 'var(--text-secondary)',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>

                        {/* Calls / Puts Filter */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {['all', 'ce', 'pe'].map((side) => (
                                <button
                                    key={side}
                                    onClick={() => setActiveSide(side)}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)',
                                        background: activeSide === side ? '#182234' : 'transparent',
                                        color: activeSide === side ? '#6C5CE7' : 'var(--text-muted)',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {side}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 3. Main Option Chain Matrix Table */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    {loading && !data ? (
                        /* Skeleton Loading Placeholder */
                        <div style={{ padding: '24px' }}>
                            {[...Array(10)].map((_, i) => (
                                <div key={i} style={{
                                    height: '36px',
                                    background: i % 2 === 0 ? '#141c2b' : '#111927',
                                    borderRadius: '6px',
                                    marginBottom: '6px',
                                    opacity: 0.6,
                                    animation: 'pulse 1.2s infinite ease-in-out'
                                }} />
                            ))}
                            <div style={{ textAlign: 'center', color: '#6C5CE7', fontWeight: '700', marginTop: '12px' }}>
                                ⚡ Fetching live {exchange} {symbol} Option Chain & Black-Scholes Greeks...
                            </div>
                        </div>
                    ) : errorMsg ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#eb5b56', fontWeight: '700' }}>
                            ⚠️ {errorMsg}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#182234', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                                    
                                    {/* CALLS (CE) HEADERS */}
                                    {(activeSide === 'all' || activeSide === 'ce') && (
                                        <>
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>CALL OI</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>OI CHG</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>VOL</th>}
                                            
                                            {(columnView === 'greeks' || columnView === 'full') && (
                                                <>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: '#38bdf8' }}>DELTA (Δ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: '#38bdf8' }}>GAMMA (Γ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: '#38bdf8' }}>THETA (Θ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: '#38bdf8' }}>VEGA (ν)</th>
                                                </>
                                            )}

                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>IV</th>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#00d09c' }}>CE LTP</th>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#00d09c' }}>TRADE CE</th>
                                        </>
                                    )}

                                    {/* STRIKE PRICE HEADER */}
                                    <th style={{ padding: '10px', textAlign: 'center', background: '#243247', color: '#ffffff', minWidth: '110px', fontWeight: '800' }}>
                                        STRIKE
                                    </th>

                                    {/* PUTS (PE) HEADERS */}
                                    {(activeSide === 'all' || activeSide === 'pe') && (
                                        <>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#eb5b56' }}>TRADE PE</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>PE LTP</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>IV</th>

                                            {(columnView === 'greeks' || columnView === 'full') && (
                                                <>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: '#38bdf8' }}>DELTA (Δ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: '#38bdf8' }}>GAMMA (Γ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: '#38bdf8' }}>THETA (Θ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: '#38bdf8' }}>VEGA (ν)</th>
                                                </>
                                            )}

                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>VOL</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>OI CHG</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'left', color: '#eb5b56' }}>PUT OI</th>}
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
                                            {(activeSide === 'all' || activeSide === 'ce') && (
                                                <>
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                            {row.ce.oi.toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: row.ce.oi_change >= 0 ? '#00d09c' : '#eb5b56' }}>
                                                            {row.ce.oi_change >= 0 ? '+' : ''}{row.ce.oi_change.toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', background: ceItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-muted)' }}>
                                                            {row.ce.volume.toLocaleString()}
                                                        </td>
                                                    )}

                                                    {(columnView === 'greeks' || columnView === 'full') && (
                                                        <>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#38bdf8', fontWeight: '600' }}>{row.ce.delta}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#38bdf8' }}>{row.ce.gamma}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#38bdf8' }}>{row.ce.theta}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#38bdf8' }}>{row.ce.vega}</td>
                                                        </>
                                                    )}

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

                                            {/* CENTER STRIKE PRICE */}
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
                                                    cursor: 'pointer',
                                                    position: 'relative'
                                                }}
                                                title={row.corp_action || `Click to view ${row.strike} CE chart & trade panel`}
                                            >
                                                {row.strike.toFixed(2)}
                                                {isAtm && <span style={{ display: 'block', fontSize: '9px', opacity: 0.9 }}>ATM</span>}
                                                {row.corp_action && <span style={{ display: 'block', fontSize: '8px', color: '#eab308' }}>⚠️ EX-DIV</span>}
                                            </td>

                                            {/* PUTS (PE) SIDE */}
                                            {(activeSide === 'all' || activeSide === 'pe') && (
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

                                                    {(columnView === 'greeks' || columnView === 'full') && (
                                                        <>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: '#38bdf8', fontWeight: '600' }}>{row.pe.delta}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: '#38bdf8' }}>{row.pe.gamma}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: '#38bdf8' }}>{row.pe.theta}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: '#38bdf8' }}>{row.pe.vega}</td>
                                                        </>
                                                    )}

                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-muted)' }}>
                                                            {row.pe.volume.toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: row.pe.oi_change >= 0 ? '#00d09c' : '#eb5b56' }}>
                                                            {row.pe.oi_change >= 0 ? '+' : ''}{row.pe.oi_change.toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', background: peItm ? 'rgba(234, 179, 8, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                            {row.pe.oi.toLocaleString()}
                                                        </td>
                                                    )}
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
