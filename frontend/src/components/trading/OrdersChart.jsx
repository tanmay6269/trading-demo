/**
 * OrdersChart — shadcn/ui-style BarChart showing order activity.
 * Displays Buy vs Sell volume per stock symbol from order history.
 * Placed above the Orders table in Orders.jsx.
 */
import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend,
} from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '../ui/chart';

const chartConfig = {
    buy: {
        label: 'Buy Value',
        color: 'var(--accent-emerald)',
    },
    sell: {
        label: 'Sell Value',
        color: 'var(--accent-rose)',
    },
};

const OrdersChart = ({ orders = [] }) => {
    // Aggregate buy/sell total value per symbol
    const data = useMemo(() => {
        const map = {};
        for (const o of orders) {
            const sym = o.symbol;
            if (!map[sym]) map[sym] = { symbol: sym, buy: 0, sell: 0 };
            const val = (o.price || 0) * (o.quantity || 0);
            if (o.type === 'BUY') map[sym].buy += val;
            else map[sym].sell += val;
        }
        return Object.values(map)
            .sort((a, b) => (b.buy + b.sell) - (a.buy + a.sell))
            .slice(0, 8); // top 8 symbols by volume
    }, [orders]);

    const totalBuy = data.reduce((s, d) => s + d.buy, 0);
    const totalSell = data.reduce((s, d) => s + d.sell, 0);

    if (data.length === 0) return null;

    return (
        <div className="soft-card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                        📈 Trading Activity
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                        Buy vs Sell volume per symbol (top 8)
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent-emerald)' }}>
                            ₹{totalBuy.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600' }}>Total Bought</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--accent-rose)' }}>
                            ₹{totalSell.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600' }}>Total Sold</div>
                    </div>
                </div>
            </div>

            <ChartContainer config={chartConfig} className="h-[200px]">
                <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={2}>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border-color)"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="symbol"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}
                        tickMargin={6}
                    />
                    <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                        width={48}
                    />
                    <ChartTooltip
                        cursor={{ fill: 'var(--bg-inset)', radius: 4 }}
                        content={
                            <ChartTooltipContent
                                formatter={(value, name) => [
                                    `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
                                    name === 'buy' ? 'Buy Volume' : 'Sell Volume'
                                ]}
                                indicator="dot"
                            />
                        }
                    />
                    <Bar dataKey="buy" name="buy" fill="var(--accent-emerald)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="sell" name="sell" fill="var(--accent-rose)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Legend
                        iconType="square"
                        iconSize={8}
                        formatter={(value) => (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}>
                                {value === 'buy' ? 'Buy Volume' : 'Sell Volume'}
                            </span>
                        )}
                        wrapperStyle={{ paddingTop: '8px' }}
                    />
                </BarChart>
            </ChartContainer>
        </div>
    );
};

export default OrdersChart;
