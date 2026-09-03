import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
} from 'recharts';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '../ui/chart';

const chartConfig = {
    pnl: {
        label: 'P&L',
        color: 'var(--accent-primary)',
    },
};

const PerformanceMetrics = ({ holdings = [], balance = 0 }) => {
    const totalValue = holdings.reduce((sum, item) => sum + (item.current_value || 0), 0);
    const totalInvested = holdings.reduce((sum, item) => sum + (item.invested || 0), 0);
    const totalPnl = totalValue - totalInvested;
    const pnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const netWorth = totalValue + balance;
    const isPnlPos = totalPnl >= 0;

    const chartData = holdings.map((h) => ({
        symbol: h.symbol,
        pnl: Math.round((h.pnl || 0) * 100) / 100,
        pnl_percent: Math.round((h.pnl_percent || 0) * 100) / 100,
    }));

    return (
        <div style={{ marginBottom: '20px' }}>
            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div className="soft-card" style={{
                    padding: '18px 20px',
                    gridColumn: 'span 2',
                    background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-strong) 100%)',
                    border: 'none',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '6px'
                }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', opacity: 0.85 }}>Net Account Worth</div>
                    <div style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                        ₹{netWorth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '700' }}>
                        Current Portfolio: ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} · Available Cash: ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="soft-card" style={{
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '4px'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Total Invested</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        ₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="soft-card" style={{
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '4px'
                }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Unrealized P&L</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: isPnlPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                        {isPnlPos ? '+' : '−'}₹{Math.abs(totalPnl).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: isPnlPos ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                        {isPnlPos ? '+' : '−'}{Math.abs(pnlPercent).toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* shadcn Holdings P&L Bar Chart */}
            {chartData.length > 0 && (
                <div className="soft-card fade-in" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                                📊 Holdings P&amp;L Breakdown
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                                Per-stock unrealized profit &amp; loss
                            </p>
                        </div>
                    </div>

                    <ChartContainer config={chartConfig} className="h-[220px]">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                                tickFormatter={(v) => (v >= 0 ? `+₹${Math.abs(v).toFixed(0)}` : `-₹${Math.abs(v).toFixed(0)}`)}
                                width={58}
                            />
                            <ChartTooltip
                                cursor={{ fill: 'var(--bg-inset)', radius: 4 }}
                                content={
                                    <ChartTooltipContent
                                        formatter={(value) => [
                                            value >= 0 ? `+₹${Math.abs(value).toLocaleString('en-IN')}` : `-₹${Math.abs(value).toLocaleString('en-IN')}`,
                                            'P&L'
                                        ]}
                                        indicator="dot"
                                    />
                                }
                            />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={36}>
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.pnl >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </div>
            )}
        </div>
    );
};

export default PerformanceMetrics;
