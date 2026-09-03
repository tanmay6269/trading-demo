/**
 * shadcn/ui Chart Components for BullX
 * ======================================
 * Drop-in shadcn-style chart wrappers built on Recharts,
 * themed to BullX CSS custom properties (light + dark mode).
 *
 * Usage:
 *   import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '../components/ui/chart';
 *   import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
 *
 *   <ChartContainer config={chartConfig} className="h-[300px]">
 *     <AreaChart data={data}>
 *       <XAxis dataKey="date" />
 *       <YAxis />
 *       <ChartTooltip content={<ChartTooltipContent />} />
 *       <Area dataKey="value" />
 *     </AreaChart>
 *   </ChartContainer>
 */

import React, { createContext, useContext, useId, useMemo } from 'react';
import { ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const ChartContext = createContext(null);

function useChart() {
    const context = useContext(ChartContext);
    if (!context) {
        throw new Error('useChart must be used within a <ChartContainer />');
    }
    return context;
}

// ─────────────────────────────────────────────────────────────────────────────
// ChartContainer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} config   - Chart config map: { key: { label, color } }
 * @param {string} className - Extra CSS classes
 */
const ChartContainer = React.forwardRef(({ id, className, children, config = {}, ...props }, ref) => {
    const uniqueId = useId();
    const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

    return (
        <ChartContext.Provider value={{ config }}>
            <div
                ref={ref}
                data-chart={chartId}
                className={cn('flex aspect-video justify-center text-xs', className)}
                style={{
                    '--chart-1': 'var(--accent-primary)',
                    '--chart-2': 'var(--accent-emerald)',
                    '--chart-3': 'var(--accent-rose)',
                    '--chart-4': 'var(--accent-amber)',
                    '--chart-5': 'var(--accent-violet)',
                    ...Object.fromEntries(
                        Object.entries(config).map(([key, value], idx) => [
                            `--color-${key}`,
                            value.color || `var(--chart-${idx + 1})`
                        ])
                    )
                }}
                {...props}
            >
                <ChartStyle id={chartId} config={config} />
                <ResponsiveContainer width="100%" height="100%">
                    {children}
                </ResponsiveContainer>
            </div>
        </ChartContext.Provider>
    );
});
ChartContainer.displayName = 'ChartContainer';

// ─────────────────────────────────────────────────────────────────────────────
// ChartStyle — injects CSS variables per chart config key
// ─────────────────────────────────────────────────────────────────────────────

const ChartStyle = ({ id, config }) => {
    const colorConfig = Object.entries(config).filter(([, v]) => v.theme || v.color);
    if (!colorConfig.length) return null;

    return (
        <style>{`
            [data-chart=${id}] {
                ${colorConfig.map(([key, value]) =>
                    `--color-${key}: ${value.color || 'var(--accent-primary)'};`
                ).join('\n')}
            }
        `}</style>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// ChartTooltip — thin re-export of Recharts Tooltip
// ─────────────────────────────────────────────────────────────────────────────

const ChartTooltip = Tooltip;

// ─────────────────────────────────────────────────────────────────────────────
// ChartTooltipContent — styled shadcn tooltip body
// ─────────────────────────────────────────────────────────────────────────────

const ChartTooltipContent = React.forwardRef((
    {
        active,
        payload,
        label,
        className,
        indicator = 'dot',    // 'dot' | 'line' | 'dashed'
        hideLabel = false,
        hideIndicator = false,
        labelFormatter,
        labelClassName,
        formatter,
        color,
        nameKey,
        labelKey,
    },
    ref
) => {
    const { config } = useChart();

    const tooltipLabel = useMemo(() => {
        if (hideLabel || !payload?.length) return null;
        const item = payload[0];
        const key = labelKey || item?.dataKey || 'value';
        const itemConfig = config[key] || {};
        const val = labelFormatter ? labelFormatter(label, payload) : (itemConfig.label || label);
        return val ? (
            <div className={cn('font-medium', labelClassName)} style={{ color: 'var(--text-primary)', marginBottom: '6px', fontSize: '12px' }}>
                {val}
            </div>
        ) : null;
    }, [label, labelFormatter, labelKey, payload, hideLabel, labelClassName, config]);

    if (!active || !payload?.length) return null;

    return (
        <div
            ref={ref}
            className={cn('grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 shadow-xl text-xs', className)}
            style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
            }}
        >
            {tooltipLabel}
            <div className="grid gap-1.5">
                {payload.map((item, idx) => {
                    const key = nameKey || item.name || item.dataKey || 'value';
                    const itemConfig = config[String(key)] || {};
                    const indicatorColor = color || item.payload?.fill || item.color;

                    return (
                        <div
                            key={idx}
                            className={cn('flex w-full flex-wrap items-stretch gap-2', indicator === 'dot' && 'items-center')}
                        >
                            {!hideIndicator && (
                                <div
                                    className="shrink-0 rounded-[2px]"
                                    style={{
                                        width: indicator === 'dot' ? 8 : 3,
                                        height: indicator === 'dot' ? 8 : '100%',
                                        minHeight: indicator === 'dot' ? 0 : 14,
                                        background: indicatorColor,
                                        borderLeft: indicator === 'dashed' ? `2px dashed ${indicatorColor}` : undefined,
                                    }}
                                />
                            )}
                            <div className="flex flex-1 justify-between leading-none gap-1"
                                style={{ alignItems: indicator === 'dot' ? 'center' : 'flex-end' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    {itemConfig.label || item.name}
                                </span>
                                {item.value !== undefined && (
                                    <span className="font-mono font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                        {formatter ? formatter(item.value, item.name, item, idx, payload) : item.value?.toLocaleString('en-IN')}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
ChartTooltipContent.displayName = 'ChartTooltipContent';

// ─────────────────────────────────────────────────────────────────────────────
// ChartLegend — thin re-export of Recharts Legend
// ─────────────────────────────────────────────────────────────────────────────

const ChartLegend = Legend;

// ─────────────────────────────────────────────────────────────────────────────
// ChartLegendContent — styled shadcn legend
// ─────────────────────────────────────────────────────────────────────────────

const ChartLegendContent = React.forwardRef(
    ({ className, hideIcon = false, payload, verticalAlign = 'bottom', nameKey }, ref) => {
        const { config } = useChart();
        if (!payload?.length) return null;

        return (
            <div
                ref={ref}
                className={cn('flex items-center justify-center gap-4', verticalAlign === 'top' && 'pb-3', className)}
                style={{ paddingTop: verticalAlign === 'bottom' ? '8px' : 0, flexWrap: 'wrap' }}
            >
                {payload.map((item) => {
                    const key = nameKey || item.dataKey || 'value';
                    const itemConfig = config[String(key)] || {};
                    return (
                        <div
                            key={item.value}
                            className="flex items-center gap-1.5"
                            style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600 }}
                        >
                            {!hideIcon && (
                                <div
                                    className="h-2 w-2 shrink-0 rounded-[2px]"
                                    style={{ background: item.color }}
                                />
                            )}
                            {itemConfig.label || item.value}
                        </div>
                    );
                })}
            </div>
        );
    }
);
ChartLegendContent.displayName = 'ChartLegendContent';

export {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
    useChart,
};
