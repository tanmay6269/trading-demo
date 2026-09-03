/**
 * PortfolioChart — shadcn/ui-style area chart showing P&L over time.
 * Built on Recharts via the BullX shadcn chart wrappers.
 *
 * Props:
 *   portfolio   — array of { symbol, buy_price, quantity, current_price? }
 *   balance     — current cash balance
 */
import React, { useMemo } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
} from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
} from '../ui/chart';

// Chart config — maps dataKey → { label, color }
const chartConfig = {
    value: {
        label: 'Portfolio Value',
        color: 'var(--accent-primary)',
    },
    pnl: {
        label: 'P&L',
        color: 'var(--accent-emerald)',
    },
};

const PortfolioChart = ({ portfolio = [], balance = 1000000 }) => {
    // Build a synthetic intra-session value series from portfolio positions
    const data = useMemo(() => {
        const invested = portfolio.reduce((sum, p) => sum + (p.buy_price || 0) * (p.quantity || 0), 0);
        const currentValue = portfolio.reduce((sum, p) => sum + ((p.current_price || p.buy_price || 0) * (p.quantity || 0)), 0);

        // Generate 10-point simulated intraday curve
        const now = Date.now();
        const points = 10;
        return Array.from({ length: points }, (_, i) => {
            const t = new Date(now - (points - 1 - i) * 30 * 60 * 1000);
            const progress = i / (points - 1);
            const val = balance + invested * 0.95 + (currentValue - invested * 0.95) * progress;
            const pnlVal = val - balance - invested;
            return {
                time: t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                value: Math.round(val),
                pnl: Math.round(pnlVal),
            };
        });
    }, [portfolio, balance]);

    const lastPnl = data[data.length - 1]?.pnl ?? 0;
    const isProfit = lastPnl >= 0;

    return (
        <div className="soft-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                        📊 Portfolio Performance
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        Today's intraday value trend
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '16px',
                        fontWeight: '800',
                        color: isProfit ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                    }}>
                        {isProfit ? '+' : ''}₹{lastPnl.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unrealized P&L</div>
                </div>
            </div>

            <ChartContainer config={chartConfig} className="h-[220px]">
                <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                        <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="fillPnl" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={isProfit ? 'var(--accent-emerald)' : 'var(--accent-rose)'} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={isProfit ? 'var(--accent-emerald)' : 'var(--accent-rose)'} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border-color)"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="time"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        tickMargin={8}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                        width={52}
                    />
                    <ChartTooltip
                        cursor={{ stroke: 'var(--border-color-strong)', strokeWidth: 1 }}
                        content={
                            <ChartTooltipContent
                                formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                                indicator="dot"
                            />
                        }
                    />
                    <Area
                        dataKey="value"
                        type="monotone"
                        fill="url(#fillValue)"
                        stroke="var(--accent-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--accent-primary)' }}
                    />
                    <ChartLegend
                        content={
                            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent-primary)' }} />
                                    Portfolio Value
                                </span>
                            </div>
                        }
                    />
                </AreaChart>
            </ChartContainer>
        </div>
    );
};

export default PortfolioChart;
