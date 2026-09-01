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
        let attempts = 0;

        const fetchChain = async () => {
            if (attempts === 0) setLoading(true);
            try {
                const res = await api.getOptionChain(symbol, selectedExpiry, exchange);
                if (!isMounted) return;

                if (res && res.chain && res.chain.length > 0) {
                    setData(res);
                    setErrorMsg('');
                    if (!selectedExpiry || !res.expiries?.includes(selectedExpiry)) {
                        setSelectedExpiry(res.selected_expiry || res.expiries?.[0] || '');
                    }
                } else if (res && res.error) {
                    setErrorMsg(res.error);
                } else {
                    setErrorMsg(`Option chain temporarily unavailable for ${symbol} on ${exchange}.`);
                }
            } catch (err) {
                console.error('Option chain fetch error:', err);
                attempts += 1;
                if (isMounted) {
                    if (attempts >= 3) {
                        setErrorMsg(`Data source temporarily unavailable for ${symbol}. Click 'Retry' to reconnect.`);
                    } else {
                        setErrorMsg(`Connecting to live exchange data for ${symbol} (attempt ${attempts}/3)...`);
                    }
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchChain();
        const interval = setInterval(() => {
            if (attempts < 3) {
                fetchChain();
            }
        }, 3500);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [isOpen, symbol, selectedExpiry, exchange]);

    if (!isOpen) return null;

    const spotPrice = data?.spot_price || 0;
    const isSpotPos = (data?.change || 0) >= 0;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 10, 20, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '1280px',
                maxHeight: '92vh',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                color: 'var(--text-primary)',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
            }}>
                {/* 1. Header Bar: Exchange Switcher, Stock Symbol & Spot */}
                <div style={{
                    padding: '14px 20px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-inset)',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        {/* Exchange Toggle Switcher (NSE / BSE) */}
                        <div style={{
                            display: 'flex',
                            backgroundColor: 'var(--bg-surface)',
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
                                        backgroundColor: exchange === ex ? 'var(--accent-primary)' : 'transparent',
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
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    backgroundColor: exchange === 'NSE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                    color: exchange === 'NSE' ? '#34d399' : '#facc15',
                                    fontWeight: '800'
                                }}>
                                    {exchange} F&O LIVE
                                </span>
                            </h3>
                        </div>

                        {/* Spot Price Pill */}
                        {spotPrice > 0 && (
                            <div style={{
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-color)',
                                padding: '4px 14px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>SPOT:</span>
                                <span style={{ fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>
                                    ₹{spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                                <span style={{
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    color: isSpotPos ? '#10b981' : '#ef4444'
                                }}>
                                    {isSpotPos ? '+' : ''}{(data?.change || 0).toFixed(2)} ({isSpotPos ? '+' : ''}{(data?.change_percent || 0).toFixed(2)}%)
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Expiry Selector & Close Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {data?.expiries && data.expiries.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Expiry:</span>
                                <select
                                    value={selectedExpiry}
                                    onChange={(e) => setSelectedExpiry(e.target.value)}
                                    style={{
                                        backgroundColor: 'var(--bg-surface)',
                                        border: '1px solid var(--accent-primary)',
                                        color: 'var(--text-primary)',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {data.expiries.map((exp) => (
                                        <option key={exp} value={exp} style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                                            {exp}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            style={{
                                backgroundColor: 'transparent',
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

                {/* 2. Subheader Metrics: PCR, Max Pain, Lot Size, and Column Switcher */}
                <div style={{
                    padding: '8px 20px',
                    backgroundColor: '#090d16',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        {/* PCR Badge */}
                        {data?.pcr !== undefined && (
                            <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: '600' }}>
                                PCR: <strong style={{ color: '#818cf8' }}>{data.pcr}</strong> ({data.pcr >= 1.0 ? '🐂 Bullish' : '🐻 Bearish'})
                            </div>
                        )}

                        {/* Max Pain Strike */}
                        {data?.max_pain && (
                            <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: '600' }}>
                                Max Pain: <strong style={{ color: '#facc15' }}>₹{data.max_pain}</strong>
                            </div>
                        )}

                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            📦 Lot Size: <strong style={{ color: 'var(--text-primary)' }}>{data?.lot_size || 25} Qty</strong>
                        </div>
                    </div>

                    {/* Columns View Switcher (Compact | Greeks | Full) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-inset)', padding: '3px', borderRadius: '6px' }}>
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
                                        backgroundColor: columnView === v.id ? 'var(--accent-primary)' : 'transparent',
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
                                        backgroundColor: activeSide === side ? 'var(--border-color)' : 'transparent',
                                        color: activeSide === side ? '#818cf8' : '#64748b',
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
                    <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-surface)' }}>
                    {loading && !data ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#818cf8', fontWeight: '700' }}>
                            ⚡ Loading {exchange} {symbol} Option Chain & Greeks...
                        </div>
                    ) : errorMsg ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444', fontWeight: '700' }}>
                            ⚠️ {errorMsg}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 5 }}>
                                    {/* CALLS (CE) HEADERS */}
                                    {(activeSide === 'all' || activeSide === 'ce') && (
                                        <>
                                            {columnView === 'full' && <th style={{ padding: '10px', textAlign: 'right', color: 'var(--accent-primary)' }}>BID</th>}
                                            {columnView === 'full' && <th style={{ padding: '10px', textAlign: 'right', color: 'var(--accent-primary)' }}>ASK</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'right', color: '#34d399' }}>CALL OI</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'right', color: '#34d399' }}>VOL</th>}
                                            
                                            {(columnView === 'greeks' || columnView === 'full') && (
                                                <>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: 'var(--accent-primary)' }}>DELTA (Δ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: 'var(--accent-primary)' }}>GAMMA (Γ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: 'var(--accent-primary)' }}>THETA (Θ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'right', color: 'var(--accent-primary)' }}>VEGA (ν)</th>
                                                </>
                                            )}

                                            <th style={{ padding: '10px', textAlign: 'right', color: '#34d399' }}>IV</th>
                                            <th style={{ padding: '10px', textAlign: 'right', color: '#34d399', fontWeight: '800' }}>CE LTP</th>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#34d399' }}>TRADE</th>
                                        </>
                                    )}

                                    {/* STRIKE PRICE HEADER */}
                                    <th style={{ padding: '10px', textAlign: 'center', backgroundColor: 'var(--border-color)', color: '#ffffff', minWidth: '100px', fontWeight: '800' }}>
                                        STRIKE
                                    </th>

                                    {/* PUTS (PE) HEADERS */}
                                    {(activeSide === 'all' || activeSide === 'pe') && (
                                        <>
                                            <th style={{ padding: '10px', textAlign: 'center', color: '#f87171' }}>TRADE</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#f87171', fontWeight: '800' }}>PE LTP</th>
                                            <th style={{ padding: '10px', textAlign: 'left', color: '#f87171' }}>IV</th>

                                            {(columnView === 'greeks' || columnView === 'full') && (
                                                <>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: 'var(--accent-primary)' }}>DELTA (Δ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: 'var(--accent-primary)' }}>GAMMA (Γ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: 'var(--accent-primary)' }}>THETA (Θ)</th>
                                                    <th style={{ padding: '10px', textAlign: 'left', color: 'var(--accent-primary)' }}>VEGA (ν)</th>
                                                </>
                                            )}

                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'left', color: '#f87171' }}>VOL</th>}
                                            {columnView !== 'greeks' && <th style={{ padding: '10px', textAlign: 'left', color: '#f87171' }}>PUT OI</th>}
                                            {columnView === 'full' && <th style={{ padding: '10px', textAlign: 'left', color: 'var(--accent-primary)' }}>BID</th>}
                                            {columnView === 'full' && <th style={{ padding: '10px', textAlign: 'left', color: 'var(--accent-primary)' }}>ASK</th>}
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {data?.chain?.map((row) => {
                                    const isAtm = row.is_atm;
                                    const ce = row.ce || {};
                                    const pe = row.pe || {};
                                    const ceItm = ce.is_itm;
                                    const peItm = pe.is_itm;

                                    return (
                                        <tr
                                            key={row.strike}
                                            style={{
                                                borderBottom: '1px solid var(--border-color)',
                                                backgroundColor: isAtm ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                                transition: 'background-color 0.15s'
                                            }}
                                        >
                                            {/* CALLS (CE) SIDE */}
                                            {(activeSide === 'all' || activeSide === 'ce') && (
                                                <>
                                                    {columnView === 'full' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                            {ce.bid_price ? `₹${ce.bid_price.toFixed(2)}` : '-'}
                                                        </td>
                                                    )}
                                                    {columnView === 'full' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                            {ce.ask_price ? `₹${ce.ask_price.toFixed(2)}` : '-'}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', backgroundColor: ceItm ? 'rgba(16, 185, 129, 0.08)' : 'transparent', color: '#cbd5e1' }}>
                                                            {(ce.oi || 0).toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'right', backgroundColor: ceItm ? 'rgba(16, 185, 129, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                            {(ce.volume || 0).toLocaleString()}
                                                        </td>
                                                    )}

                                                    {(columnView === 'greeks' || columnView === 'full') && (
                                                        <>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent-primary)', fontWeight: '600' }}>{ce.delta !== undefined ? ce.delta : '-'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent-primary)' }}>{ce.gamma !== undefined ? ce.gamma : '-'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent-primary)' }}>{ce.theta !== undefined ? ce.theta : '-'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--accent-primary)' }}>{ce.vega !== undefined ? ce.vega : '-'}</td>
                                                        </>
                                                    )}

                                                    <td style={{ padding: '8px 10px', textAlign: 'right', backgroundColor: ceItm ? 'rgba(16, 185, 129, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                        {ce.iv ? `${ce.iv}%` : '-'}
                                                    </td>
                                                    <td 
                                                        onClick={() => {
                                                            onSelectContract(ce.symbol || `${symbol}${row.strike}CE`, 'BUY', ce.ltp || 0);
                                                            onClose();
                                                        }}
                                                        style={{
                                                            padding: '8px 10px',
                                                            textAlign: 'right',
                                                            backgroundColor: ceItm ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                                                            fontWeight: '800',
                                                            color: '#34d399',
                                                            cursor: 'pointer',
                                                            fontSize: '13px'
                                                        }}
                                                        title={`Click to trade ${ce.symbol}`}
                                                    >
                                                        ₹{(ce.ltp || 0).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', backgroundColor: ceItm ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                                                        <button
                                                            onClick={() => {
                                                                onSelectContract(ce.symbol || `${symbol}${row.strike}CE`, 'BUY', ce.ltp || 0);
                                                                onClose();
                                                            }}
                                                            style={{
                                                                backgroundColor: '#10b981',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                padding: '4px 10px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            BUY
                                                        </button>
                                                    </td>
                                                </>
                                            )}

                                            {/* CENTER STRIKE PRICE */}
                                            <td 
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    backgroundColor: isAtm ? 'var(--accent-primary)' : 'var(--bg-inset)',
                                                    color: '#ffffff',
                                                    fontWeight: '800',
                                                    fontSize: '13px',
                                                    position: 'relative'
                                                }}
                                            >
                                                {(row.strike || 0).toFixed(2)}
                                                {isAtm && <span style={{ display: 'block', fontSize: '9px', opacity: 0.9 }}>ATM</span>}
                                            </td>

                                            {/* PUTS (PE) SIDE */}
                                            {(activeSide === 'all' || activeSide === 'pe') && (
                                                <>
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', backgroundColor: peItm ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                                                        <button
                                                            onClick={() => {
                                                                onSelectContract(pe.symbol || `${symbol}${row.strike}PE`, 'BUY', pe.ltp || 0);
                                                                onClose();
                                                            }}
                                                            style={{
                                                                backgroundColor: '#ef4444',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                padding: '4px 10px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            BUY
                                                        </button>
                                                    </td>
                                                    <td 
                                                        onClick={() => {
                                                            onSelectContract(pe.symbol || `${symbol}${row.strike}PE`, 'BUY', pe.ltp || 0);
                                                            onClose();
                                                        }}
                                                        style={{
                                                            padding: '8px 10px',
                                                            textAlign: 'left',
                                                            backgroundColor: peItm ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                                                            fontWeight: '800',
                                                            color: '#f87171',
                                                            cursor: 'pointer',
                                                            fontSize: '13px'
                                                        }}
                                                        title={`Click to trade ${pe.symbol}`}
                                                    >
                                                        ₹{(pe.ltp || 0).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '8px 10px', textAlign: 'left', backgroundColor: peItm ? 'rgba(239, 68, 68, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                        {pe.iv ? `${pe.iv}%` : '-'}
                                                    </td>

                                                    {(columnView === 'greeks' || columnView === 'full') && (
                                                        <>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--accent-primary)', fontWeight: '600' }}>{pe.delta !== undefined ? pe.delta : '-'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--accent-primary)' }}>{pe.gamma !== undefined ? pe.gamma : '-'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--accent-primary)' }}>{pe.theta !== undefined ? pe.theta : '-'}</td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--accent-primary)' }}>{pe.vega !== undefined ? pe.vega : '-'}</td>
                                                        </>
                                                    )}

                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', backgroundColor: peItm ? 'rgba(239, 68, 68, 0.08)' : 'transparent', color: 'var(--text-secondary)' }}>
                                                            {(pe.volume || 0).toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView !== 'greeks' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', backgroundColor: peItm ? 'rgba(239, 68, 68, 0.08)' : 'transparent', color: '#cbd5e1' }}>
                                                            {(pe.oi || 0).toLocaleString()}
                                                        </td>
                                                    )}
                                                    {columnView === 'full' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                                            {pe.bid_price ? `₹${pe.bid_price.toFixed(2)}` : '-'}
                                                        </td>
                                                    )}
                                                    {columnView === 'full' && (
                                                        <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                                            {pe.ask_price ? `₹${pe.ask_price.toFixed(2)}` : '-'}
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
