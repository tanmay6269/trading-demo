import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import api from '../../api';

const PERIODS = [
    { label: '1D', value: '1d', interval: '1m' },
    { label: '1W', value: '5d', interval: '5m' },
    { label: '1M', value: '1mo', interval: '15m' },
    { label: '3M', value: '3mo', interval: '1h' },
    { label: '6M', value: '6mo', interval: '1d' },
    { label: '1Y', value: '1y', interval: '1d' },
    { label: '5Y', value: '5y', interval: '1wk' },
    { label: 'ALL', value: 'max', interval: '1mo' },
];

const IST_OFFSET_SEC = 5.5 * 3600; // +19800 seconds (5 hours 30 mins IST Offset)

const roundNum = (n) => Math.round(n * 100) / 100;

const calcEMA = (data, period) => {
    if (!data || data.length < period) return [];
    const k = 2 / (period + 1);
    let ema = data[0].close;
    const res = [];
    for (let i = 0; i < data.length; i++) {
        const c = data[i].close;
        if (i === 0) {
            ema = c;
        } else {
            ema = c * k + ema * (1 - k);
        }
        if (i >= period - 1) {
            res.push({ time: data[i].time, value: roundNum(ema) });
        }
    }
    return res;
};

const calcBollingerBands = (data, period = 20, stdDev = 2) => {
    if (!data || data.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [], middle = [], lower = [];
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const sum = slice.reduce((acc, d) => acc + d.close, 0);
        const mean = sum / period;
        const variance = slice.reduce((acc, d) => acc + Math.pow(d.close - mean, 2), 0) / period;
        const sd = Math.sqrt(variance);
        const t = data[i].time;
        middle.push({ time: t, value: roundNum(mean) });
        upper.push({ time: t, value: roundNum(mean + stdDev * sd) });
        lower.push({ time: t, value: roundNum(mean - stdDev * sd) });
    }
    return { upper, middle, lower };
};

const PriceChart = ({ symbol = 'RELIANCE', portfolio = [], onSell = () => {}, onBuy = () => {}, showToast = () => {} }) => {
    const chartContainerRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const seriesInstanceRef = useRef(null);
    const priceLineRef = useRef(null);
    const lastCandleRef = useRef(null);
    const rawDataRef = useRef([]);
    const prevCloseRef = useRef(null);
    const prevCloseLineRef = useRef(null);
    const ema20Ref = useRef(null);
    const ema50Ref = useRef(null);
    const bbUpperRef = useRef(null);
    const bbMidRef = useRef(null);
    const bbLowerRef = useRef(null);
    
    const [loading, setLoading] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState('1D');
    const [chartType, setChartType] = useState('candlestick'); // 'candlestick' | 'line'
    const [errorMsg, setErrorMsg] = useState('');
    const [livePrice, setLivePrice] = useState(null);
    const [prevClose, setPrevClose] = useState(null);
    const [hoverLegend, setHoverLegend] = useState(null);
    const [showEma20, setShowEma20] = useState(false);
    const [showEma50, setShowEma50] = useState(false);
    const [showBollinger, setShowBollinger] = useState(false);

    // Detect Index Benchmark symbols (NIFTY, SENSEX, BANK NIFTY, VIX, BSE indices, etc.)
    const isIndexSymbol = symbol.startsWith('^') || 
                          symbol.includes('NIFTY') || 
                          symbol.includes('SENSEX') || 
                          symbol.includes('VIX') || 
                          symbol.includes('BSE-') || 
                          symbol.includes('MIDCAP') || 
                          symbol.includes('SMALLCAP') || 
                          symbol.includes('FIN_SERVICE');

    // Active position strictly for tradeable equity stocks only (never for indices)
    const activePosition = !isIndexSymbol && portfolio && Array.isArray(portfolio)
        ? portfolio.find(p => (p.symbol === symbol || p.symbol === symbol.replace('.NS', '').replace('.BO', '')) && p.quantity > 0)
        : null;

    // Fetch official previous close for precise % change reference
    useEffect(() => {
        const fetchMetadata = async () => {
            try {
                const info = await api.getStockInfo(symbol);
                if (info && info.prev_close) {
                    setPrevClose(info.prev_close);
                    prevCloseRef.current = info.prev_close;
                }
            } catch (e) {}
        };
        fetchMetadata();
    }, [symbol]);

    const fetchData = useCallback(async (seriesInstance, pLabel, cType) => {
        setLoading(true);
        setErrorMsg('');
        try {
            const pConfig = PERIODS.find(p => p.label === pLabel) || PERIODS[0];
            const data = await api.getHistoricalData(symbol, pConfig.value, pConfig.interval);
            
            if (data && data.length > 0) {
                let cleanData = [];
                let lastTime = 0;
                const isIntraday = pLabel === '1D' || pLabel === '1W';

                for (const item of data) {
                    // Apply IST Offset (+19800s) to 1D and 1W intraday timeframes so Lightweight Charts x-axis strictly displays Indian Standard Time (09:15 AM - 03:30 PM IST)
                    const adjustedTime = isIntraday ? item.time + IST_OFFSET_SEC : item.time;
                    if (adjustedTime > lastTime) {
                        cleanData.push({
                            ...item,
                            time: adjustedTime,
                            rawTime: item.time
                        });
                        lastTime = adjustedTime;
                    }
                }
                rawDataRef.current = cleanData;

                if (cType === 'line') {
                    const lineData = cleanData.map(c => ({ time: c.time, value: c.close }));
                    const refPrice = prevCloseRef.current || (cleanData.length > 0 ? cleanData[0].close : 1000);
                    const lastVal = cleanData.length > 0 ? cleanData[cleanData.length - 1].close : refPrice;
                    const isPos = lastVal >= refPrice;
                    
                    try {
                        seriesInstance.applyOptions({
                            lineColor: isPos ? '#00d09c' : '#eb5b56',
                            topColor: isPos ? 'rgba(0, 208, 156, 0.28)' : 'rgba(235, 91, 86, 0.28)',
                            bottomColor: isPos ? 'rgba(0, 208, 156, 0.02)' : 'rgba(235, 91, 86, 0.02)',
                        });
                    } catch (e) {}
                    seriesInstance.setData(lineData);
                } else {
                    seriesInstance.setData(cleanData);
                }

                if (cleanData.length > 0) {
                    lastCandleRef.current = { ...cleanData[cleanData.length - 1] };
                    setLivePrice(lastCandleRef.current.close);

                    if (ema20Ref.current) {
                        ema20Ref.current.setData(calcEMA(cleanData, 20));
                    }
                    if (ema50Ref.current) {
                        ema50Ref.current.setData(calcEMA(cleanData, 50));
                    }
                    if (bbUpperRef.current && bbMidRef.current && bbLowerRef.current) {
                        const bb = calcBollingerBands(cleanData, 20, 2);
                        bbUpperRef.current.setData(bb.upper);
                        bbMidRef.current.setData(bb.middle);
                        bbLowerRef.current.setData(bb.lower);
                    }
                }

                if (chartInstanceRef.current) {
                    chartInstanceRef.current.timeScale().fitContent();
                }
            } else {
                setErrorMsg('No trading chart data available for this timeframe.');
            }
        } catch (error) {
            console.error('Error fetching chart data:', error);
            setErrorMsg('Unable to load chart. Please check backend connection.');
        }
        setLoading(false);
    }, [symbol]);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        if (chartInstanceRef.current) {
            const chartToDispose = chartInstanceRef.current;
            chartInstanceRef.current = null;
            seriesInstanceRef.current = null;
            ema20Ref.current = null;
            ema50Ref.current = null;
            bbUpperRef.current = null;
            bbMidRef.current = null;
            bbLowerRef.current = null;
            setTimeout(() => {
                try {
                    chartToDispose.remove();
                } catch (e) {}
            }, 0);
        }

        const isIntraday = selectedPeriod === '1D' || selectedPeriod === '1W';

        // Initialize TradingView Lightweight Chart
        const newChart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 440,
            layout: {
                background: { color: '#182234' },
                textColor: '#94a3b8',
                fontSize: 12,
            },
            grid: {
                vertLines: { color: '#243247' },
                horzLines: { color: '#243247' },
            },
            crosshair: {
                mode: 0,
            },
            timeScale: {
                borderColor: '#26354d',
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: (time) => {
                    const date = new Date(time * 1000);
                    if (isIntraday) {
                        return date.toLocaleTimeString('en-IN', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
                    }
                    return date.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
                }
            },
            rightPriceScale: {
                borderColor: '#26354d',
                autoScale: true
            },
        });

        // Add Selected Series Type: Candlestick vs Baseline Dual-Color Line Graph
        let newSeries;
        if (chartType === 'line') {
            const isPos = livePrice && prevClose ? (livePrice >= prevClose) : true;
            newSeries = newChart.addAreaSeries({
                topColor: isPos ? 'rgba(0, 208, 156, 0.28)' : 'rgba(235, 91, 86, 0.28)',
                bottomColor: isPos ? 'rgba(0, 208, 156, 0.02)' : 'rgba(235, 91, 86, 0.02)',
                lineColor: isPos ? '#00d09c' : '#eb5b56',
                lineWidth: 2
            });
        } else {
            newSeries = newChart.addCandlestickSeries({
                upColor: '#10b981',
                downColor: '#f43f5e',
                borderVisible: true,
                borderUpColor: '#10b981',
                borderDownColor: '#f43f5e',
                wickUpColor: '#10b981',
                wickDownColor: '#f43f5e',
            });
        }

        // Add Technical Indicator Overlays
        if (showEma20) {
            ema20Ref.current = newChart.addLineSeries({
                color: '#00cec9',
                lineWidth: 1.5,
                title: 'EMA 20'
            });
        }
        if (showEma50) {
            ema50Ref.current = newChart.addLineSeries({
                color: '#fdcb6e',
                lineWidth: 1.5,
                title: 'EMA 50'
            });
        }
        if (showBollinger) {
            bbUpperRef.current = newChart.addLineSeries({
                color: 'rgba(162, 155, 254, 0.7)',
                lineWidth: 1,
                lineStyle: 2,
                title: 'BB Upper'
            });
            bbMidRef.current = newChart.addLineSeries({
                color: 'rgba(162, 155, 254, 0.4)',
                lineWidth: 1,
                title: 'BB Mid'
            });
            bbLowerRef.current = newChart.addLineSeries({
                color: 'rgba(162, 155, 254, 0.7)',
                lineWidth: 1,
                lineStyle: 2,
                title: 'BB Lower'
            });
        }

        // Crosshair Move Hover Listener
        newChart.subscribeCrosshairMove((param) => {
            if (!param || !param.time || param.point === undefined || param.point.x < 0 || param.point.y < 0) {
                setHoverLegend(null);
                return;
            }

            const dataPoint = param.seriesData.get(newSeries);
            if (dataPoint) {
                const dateObj = new Date(param.time * 1000);
                const dateStr = isIntraday
                    ? dateObj.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + dateObj.toLocaleTimeString('en-IN', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
                    : dateObj.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

                if (chartType === 'line') {
                    const priceVal = dataPoint.value;
                    const refPrice = prevCloseRef.current;
                    const change = refPrice ? (priceVal - refPrice) : 0;
                    const pct = refPrice ? ((change / refPrice) * 100) : 0;

                    setHoverLegend({
                        timeStr: dateStr,
                        price: priceVal,
                        change: change,
                        changePercent: pct
                    });
                } else {
                    const open = dataPoint.open;
                    const high = dataPoint.high;
                    const low = dataPoint.low;
                    const close = dataPoint.close;
                    const volume = dataPoint.volume || 0;

                    const refPrice = prevCloseRef.current || open;
                    const change = refPrice ? (close - refPrice) : 0;
                    const pct = refPrice ? ((change / refPrice) * 100) : 0;

                    setHoverLegend({
                        timeStr: dateStr,
                        open: open,
                        high: high,
                        low: low,
                        close: close,
                        volume: volume,
                        change: change,
                        changePercent: pct
                    });
                }
            } else {
                setHoverLegend(null);
            }
        });

        chartInstanceRef.current = newChart;
        seriesInstanceRef.current = newSeries;

        fetchData(newSeries, selectedPeriod, chartType);

        const handleResize = () => {
            if (chartContainerRef.current && chartInstanceRef.current) {
                chartInstanceRef.current.resize(
                    chartContainerRef.current.clientWidth,
                    440
                );
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartInstanceRef.current) {
                const chartToDispose = chartInstanceRef.current;
                chartInstanceRef.current = null;
                seriesInstanceRef.current = null;
                setTimeout(() => {
                    try {
                        chartToDispose.remove();
                    } catch (e) {}
                }, 0);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, chartType, selectedPeriod, showEma20, showEma50, showBollinger, fetchData]);

    // Live Position Price Line overlay directly on graph canvas (Strictly for single equity stocks with active position)
    useEffect(() => {
        if (priceLineRef.current && seriesInstanceRef.current) {
            try {
                seriesInstanceRef.current.removePriceLine(priceLineRef.current);
            } catch (e) {}
            priceLineRef.current = null;
        }

        if (!isIndexSymbol && activePosition && activePosition.buy_price && seriesInstanceRef.current) {
            const pnlVal = livePrice ? (livePrice - activePosition.buy_price) * activePosition.quantity : 0;
            const isProfit = pnlVal >= 0;
            const pnlText = `${isProfit ? '+' : '-'}\u20B9${Math.abs(pnlVal).toFixed(2)}`;

            try {
                priceLineRef.current = seriesInstanceRef.current.createPriceLine({
                    price: activePosition.buy_price,
                    color: isProfit ? '#10b981' : '#f43f5e',
                    lineWidth: 2,
                    lineStyle: 0, // Solid line
                    axisLabelVisible: true,
                    title: `BUY ${activePosition.quantity} Qty @ \u20B9${activePosition.buy_price.toFixed(2)} (P&L: ${pnlText})`
                });
            } catch (e) {}
        }

        return () => {
            if (priceLineRef.current && seriesInstanceRef.current) {
                try {
                    seriesInstanceRef.current.removePriceLine(priceLineRef.current);
                } catch (e) {}
                priceLineRef.current = null;
            }
        };
    }, [activePosition, livePrice, symbol, isIndexSymbol]);

    // Prev Close Reference Line on Chart
    useEffect(() => {
        if (prevCloseLineRef.current && seriesInstanceRef.current) {
            try {
                seriesInstanceRef.current.removePriceLine(prevCloseLineRef.current);
            } catch (e) {}
            prevCloseLineRef.current = null;
        }

        if (prevClose && seriesInstanceRef.current && (selectedPeriod === '1D' || selectedPeriod === '1W')) {
            try {
                prevCloseLineRef.current = seriesInstanceRef.current.createPriceLine({
                    price: prevClose,
                    color: '#64748b',
                    lineWidth: 1,
                    lineStyle: 2, // Dashed line
                    axisLabelVisible: true,
                    title: `Prev Close \u20B9${prevClose.toFixed(2)}`
                });
            } catch (e) {}
        }

        return () => {
            if (prevCloseLineRef.current && seriesInstanceRef.current) {
                try {
                    seriesInstanceRef.current.removePriceLine(prevCloseLineRef.current);
                } catch (e) {}
                prevCloseLineRef.current = null;
            }
        };
    }, [prevClose, selectedPeriod]);

    // Real-Time Live Candle Tick Updating every 5 seconds
    useEffect(() => {
        const liveInterval = setInterval(async () => {
            if (!seriesInstanceRef.current || !lastCandleRef.current) return;
            try {
                const quoteData = await api.getPrice(symbol);
                const price = typeof quoteData === 'object' ? quoteData.price : quoteData;
                if (price && price > 0) {
                    setLivePrice(price);
                    const last = lastCandleRef.current;
                    const updatedCandle = {
                        time: last.time,
                        open: last.open,
                        high: Math.max(last.high, price),
                        low: Math.min(last.low, price),
                        close: price,
                        volume: last.volume
                    };
                    lastCandleRef.current = updatedCandle;

                    if (chartType === 'line') {
                        seriesInstanceRef.current.update({ time: last.time, value: price });

                        // Dynamically update line chart color against previous close
                        const refPrice = prevCloseRef.current || (rawDataRef.current.length > 0 ? rawDataRef.current[0].close : null);
                        if (refPrice && seriesInstanceRef.current) {
                            const isPos = price >= refPrice;
                            seriesInstanceRef.current.applyOptions({
                                lineColor: isPos ? '#00d09c' : '#eb5b56',
                                topColor: isPos ? 'rgba(0, 208, 156, 0.25)' : 'rgba(235, 91, 86, 0.25)',
                                bottomColor: isPos ? 'rgba(0, 208, 156, 0.0)' : 'rgba(235, 91, 86, 0.0)',
                            });
                        }
                    } else {
                        seriesInstanceRef.current.update(updatedCandle);
                    }
                }
            } catch (e) {}
        }, 5000);

        return () => clearInterval(liveInterval);
    }, [symbol, chartType]);

    // Calculate Dynamic Change in Header
    const headerChange = prevClose && livePrice ? livePrice - prevClose : 0;
    const headerChangePct = prevClose && livePrice ? (headerChange / prevClose) * 100 : 0;
    const isHeaderPos = headerChange >= 0;

    return (
        <div className="soft-card" style={{ padding: '20px', position: 'relative' }}>
            {/* Header Toolbar: Symbol, Price, Timeframes, Indicators, Chart Type Toggle */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '18px', fontWeight: '800' }}>
                        {chartType === 'line' ? '📈' : '📊'} {symbol} Real-Time Chart
                    </h3>
                    {livePrice && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                                fontSize: '16px', 
                                fontWeight: '800', 
                                color: 'var(--text-primary)',
                                background: '#111927',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)'
                            }}>
                                ₹{livePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                            {prevClose && (
                                <span style={{
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    color: isHeaderPos ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                    background: isHeaderPos ? 'var(--accent-emerald-soft)' : 'var(--accent-rose-soft)',
                                    padding: '4px 8px',
                                    borderRadius: '6px'
                                }}>
                                    {isHeaderPos ? '+' : '-'}{Math.abs(headerChange).toFixed(2)} ({isHeaderPos ? '+' : '-'}{Math.abs(headerChangePct).toFixed(2)}%)
                                </span>
                            )}
                        </div>
                    )}
                    {loading && (
                        <span style={{ color: 'var(--accent-primary)', fontSize: '13px', fontWeight: '600' }}>
                            Loading chart...
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Technical Indicators Pill Controls (EMA 20, EMA 50, Bollinger Bands) */}
                    <div style={{ display: 'flex', gap: '4px', background: '#111927', padding: '4px', borderRadius: '10px' }}>
                        <button
                            onClick={() => setShowEma20(!showEma20)}
                            style={{
                                padding: '5px 10px',
                                background: showEma20 ? 'rgba(0, 206, 201, 0.2)' : 'transparent',
                                color: showEma20 ? '#00cec9' : 'var(--text-secondary)',
                                border: showEma20 ? '1px solid #00cec9' : '1px solid transparent',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '700',
                                transition: 'all 0.15s'
                            }}
                            title="Toggle 20 Exponential Moving Average"
                        >
                            EMA 20
                        </button>
                        <button
                            onClick={() => setShowEma50(!showEma50)}
                            style={{
                                padding: '5px 10px',
                                background: showEma50 ? 'rgba(253, 203, 110, 0.2)' : 'transparent',
                                color: showEma50 ? '#fdcb6e' : 'var(--text-secondary)',
                                border: showEma50 ? '1px solid #fdcb6e' : '1px solid transparent',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '700',
                                transition: 'all 0.15s'
                            }}
                            title="Toggle 50 Exponential Moving Average"
                        >
                            EMA 50
                        </button>
                        <button
                            onClick={() => setShowBollinger(!showBollinger)}
                            style={{
                                padding: '5px 10px',
                                background: showBollinger ? 'rgba(162, 155, 254, 0.2)' : 'transparent',
                                color: showBollinger ? '#a29bfe' : 'var(--text-secondary)',
                                border: showBollinger ? '1px solid #a29bfe' : '1px solid transparent',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '700',
                                transition: 'all 0.15s'
                            }}
                            title="Toggle Bollinger Bands (20, 2)"
                        >
                            BB
                        </button>
                    </div>

                    {/* Timeframe Selector Pills (1D, 1W, 1M, 3M, 6M, 1Y, 5Y, ALL) */}
                    <div style={{ display: 'flex', gap: '4px', background: '#111927', padding: '4px', borderRadius: '10px' }}>
                        {PERIODS.map((p) => {
                            const isSelected = selectedPeriod === p.label;
                            return (
                                <button
                                    key={p.label}
                                    onClick={() => setSelectedPeriod(p.label)}
                                    style={{
                                        padding: '5px 10px',
                                        background: isSelected ? 'var(--accent-primary)' : 'transparent',
                                        color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: isSelected ? '700' : '500',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Chart Type Toggle Button: 📊 Candlestick vs 📈 Line / Arrow */}
                    <div style={{ display: 'flex', gap: '4px', background: '#111927', padding: '4px', borderRadius: '10px' }}>
                        <button
                            onClick={() => setChartType('candlestick')}
                            title="Switch to Candlestick Chart"
                            style={{
                                padding: '5px 12px',
                                background: chartType === 'candlestick' ? 'var(--accent-emerald)' : 'transparent',
                                color: chartType === 'candlestick' ? '#ffffff' : 'var(--text-secondary)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                            }}
                        >
                            📊 Candle
                        </button>
                        <button
                            onClick={() => setChartType('line')}
                            title="Switch to Dynamic Green/Red Line Chart"
                            style={{
                                padding: '5px 12px',
                                background: chartType === 'line' ? (isHeaderPos ? '#00d09c' : '#eb5b56') : 'transparent',
                                color: chartType === 'line' ? '#ffffff' : 'var(--text-secondary)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {isHeaderPos ? '📈 Line' : '📉 Line'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Interactive Hover Crosshair Legend Bar */}
            {hoverLegend ? (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    background: '#111927',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    marginBottom: '12px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    flexWrap: 'wrap'
                }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>📅 {hoverLegend.timeStr}</span>
                    {chartType === 'line' ? (
                        <>
                            <span>Price: <strong style={{ color: 'var(--text-primary)' }}>₹{hoverLegend.price?.toFixed(2)}</strong></span>
                            {hoverLegend.change !== undefined && (
                                <span style={{ color: hoverLegend.change >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: '700' }}>
                                    {hoverLegend.change >= 0 ? '+' : '-'}{Math.abs(hoverLegend.change).toFixed(2)} ({hoverLegend.change >= 0 ? '+' : '-'}{Math.abs(hoverLegend.changePercent).toFixed(2)}%)
                                </span>
                            )}
                        </>
                    ) : (
                        <>
                            <span>Open: <strong style={{ color: 'var(--text-primary)' }}>₹{hoverLegend.open?.toFixed(2)}</strong></span>
                            <span>High: <strong style={{ color: 'var(--text-primary)' }}>₹{hoverLegend.high?.toFixed(2)}</strong></span>
                            <span>Low: <strong style={{ color: 'var(--text-primary)' }}>₹{hoverLegend.low?.toFixed(2)}</strong></span>
                            <span>Close: <strong style={{ color: 'var(--text-primary)' }}>₹{hoverLegend.close?.toFixed(2)}</strong></span>
                            <span>Vol: <strong style={{ color: 'var(--text-primary)' }}>{hoverLegend.volume?.toLocaleString('en-IN')}</strong></span>
                            <span style={{ color: hoverLegend.change >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)', fontWeight: '700' }}>
                                {hoverLegend.change >= 0 ? '+' : '-'}{Math.abs(hoverLegend.change).toFixed(2)} ({hoverLegend.change >= 0 ? '+' : '-'}{Math.abs(hoverLegend.changePercent).toFixed(2)}%)
                            </span>
                        </>
                    )}
                </div>
            ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    💡 Hover cursor over any candle or point on graph to view exact OHLC, Volume, and % Change.
                </div>
            )}

            {/* TradingView Lightweight Chart Canvas */}
            <div style={{ position: 'relative' }}>
                <div ref={chartContainerRef} style={{ width: '100%', height: '440px', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }} />

                {/* Live Active Position Overlay Toolbar Directly ON TOP of Graph Canvas */}
                {activePosition && (
                    <div style={{
                        position: 'absolute',
                        top: '16px',
                        left: '16px',
                        right: '16px',
                        background: 'rgba(17, 25, 39, 0.92)',
                        border: '1px solid var(--accent-emerald)',
                        backdropFilter: 'blur(8px)',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '18px' }}>🎯</span>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                                    LONG {activePosition.quantity} {symbol} @ ₹{activePosition.buy_price?.toFixed(2)}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    Live Price: ₹{livePrice?.toFixed(2) || '---'}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Floating P&L</div>
                                {livePrice && activePosition.buy_price && (
                                    <div style={{
                                        fontSize: '14px',
                                        fontWeight: '800',
                                        color: (livePrice - activePosition.buy_price) >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                                    }}>
                                        {(livePrice - activePosition.buy_price) >= 0 ? '+' : '-'}\u20B9{Math.abs((livePrice - activePosition.buy_price) * activePosition.quantity).toFixed(2)} ({(((livePrice - activePosition.buy_price) / activePosition.buy_price) * 100).toFixed(2)}%)
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => onBuy(5)}
                                style={{
                                    background: 'var(--accent-emerald-soft)',
                                    color: 'var(--accent-emerald)',
                                    border: '1px solid var(--accent-emerald)',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    fontSize: '12px'
                                }}
                            >
                                ➕ Add 5 Qty
                            </button>

                            <button
                                onClick={() => onSell(activePosition.quantity)}
                                style={{
                                    background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                                    color: '#ffffff',
                                    border: 'none',
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    fontSize: '12px',
                                    boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)'
                                }}
                            >
                                ⚡ Close Position ({activePosition.quantity})
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {errorMsg && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'rgba(23, 33, 49, 0.95)',
                    padding: '16px 24px',
                    borderRadius: '12px',
                    border: '1px solid var(--accent-rose)',
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    boxShadow: 'var(--shadow-soft)'
                }}>
                    ⚠️ {errorMsg}
                </div>
            )}
        </div>
    );
};

export default PriceChart;