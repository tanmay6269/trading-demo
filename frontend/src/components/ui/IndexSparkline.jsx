/**
 * IndexSparkline — tiny shadcn Area sparkline for each market index card.
 * Shows a simulated intraday trend based on current change_percent.
 * Rendered inside each index tile on the Explore page.
 */
import React, { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';

const IndexSparkline = ({ changePercent = 0, height = 48 }) => {
    const isPos = changePercent >= 0;
    const color = isPos ? 'var(--accent-emerald)' : 'var(--accent-rose)';

    // Generate a 12-point simulated sparkline curve using change_percent as endpoint drift
    const data = useMemo(() => {
        const pts = 12;
        const base = 100;
        let prev = base;
        return Array.from({ length: pts }, (_, i) => {
            const progress = i / (pts - 1);
            // Drift toward the final % change with slight noise
            const noise = (Math.random() - 0.5) * Math.abs(changePercent) * 0.3;
            const drift = base + changePercent * progress + noise;
            prev = i === 0 ? base : drift;
            return { v: Math.round(prev * 100) / 100 };
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [changePercent]);

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id={`sg-${isPos ? 'pos' : 'neg'}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="10%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="90%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"
                    dataKey="v"
                    stroke={color}
                    strokeWidth={1.5}
                    fill={`url(#sg-${isPos ? 'pos' : 'neg'})`}
                    dot={false}
                    isAnimationActive={false}
                />
                <Tooltip
                    content={() => null}
                    cursor={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
};

export default IndexSparkline;
