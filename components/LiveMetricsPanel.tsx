'use client';

/**
 * components/LiveMetricsPanel.tsx
 *
 * Right panel (top half) — Live Metrics · Premium Glassmorphism Edition.
 *
 * Recharts refinements (v2):
 *  - No CartesianGrid (clean, uncluttered)
 *  - Smooth AreaChart curves (type="monotone")
 *  - Vertical gradient fills that fade to transparent
 *  - Glassmorphic custom tooltip (slate-900/90 backdrop-blur)
 *  - Axes: slate-700 tick colour, no axis lines
 *  - Chart height: 100px (up from 90px)
 *  - Current-value badge pulled from latest data point
 *
 * Typography / colours follow the new system:
 *   bg-slate-950/90 · cards bg-slate-900/50 · system-ui font
 *   emerald/amber/rose for AQI/traffic health
 */

import { motion }                    from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { TimeSeriesPoint }      from '@/services/cityData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveMetricsPanelProps {
  timeSeries: TimeSeriesPoint[];
}

// ─── Animation ────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } },
};

const cardVariants = {
  hidden:  { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0,  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── Chart config ─────────────────────────────────────────────────────────────

const CHARTS = [
  {
    key:     'traffic'     as const,
    label:   'Traffic Density',
    unit:    '/100',
    stroke:  '#38bdf8',   // sky-400
    domain:  [0, 100]     as [number, number],
    format:  (v: number) => v > 70 ? 'text-rose-400' : v > 45 ? 'text-amber-400' : 'text-emerald-400',
  },
  {
    key:     'aqi'         as const,
    label:   'Air Quality (AQI)',
    unit:    '',
    stroke:  '#a78bfa',   // violet-400
    domain:  [60, 250]    as [number, number],
    format:  (v: number) => v > 150 ? 'text-rose-400' : v > 100 ? 'text-amber-400' : 'text-emerald-400',
  },
  {
    key:     'temperature' as const,
    label:   'Temperature',
    unit:    '°C',
    stroke:  '#fb923c',   // orange-400
    domain:  [14, 36]     as [number, number],
    format:  () => 'text-orange-400',
  },
  {
    key:     'energy'      as const,
    label:   'Energy (MW)',
    unit:    '',
    stroke:  '#34d399',   // emerald-400
    domain:  [1400, 3400] as [number, number],
    format:  (v: number) => v > 3000 ? 'text-amber-400' : 'text-emerald-400',
  },
] as const;

// ─── Custom glassmorphic tooltip ──────────────────────────────────────────────

function GlassTooltip({
  active, payload, label, unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?:  string;
  unit:    string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 backdrop-blur-xl shadow-xl">
      <p className="text-[0.6rem] font-medium text-slate-500 tracking-wider mb-0.5">{label}</p>
      <p className="text-[0.95rem] font-bold text-white">
        {payload[0].value.toLocaleString('en-IN')}{unit}
      </p>
    </div>
  );
}

// ─── Single chart card ────────────────────────────────────────────────────────

function ChartCard<K extends keyof TimeSeriesPoint>({
  data, label, unit, stroke, domain, dataKey, gradId, format,
}: {
  data:    TimeSeriesPoint[];
  label:   string;
  unit:    string;
  stroke:  string;
  domain:  [number, number];
  dataKey: K;
  gradId:  string;
  format:  (v: number) => string;
}) {
  const latest = data[data.length - 1]?.[dataKey] as number ?? 0;
  const valCls = format(latest);

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl bg-slate-900/50 border border-white/[0.07] overflow-hidden
                 hover:border-white/[0.12] transition-colors duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1">
        <p className="text-[0.65rem] font-medium tracking-[0.15em] uppercase text-slate-500">
          {label}
        </p>
        <span
          className={`text-[1.15rem] font-bold leading-none tabular-nums ${valCls}`}
          suppressHydrationWarning
        >
          {latest.toLocaleString('en-IN')}{unit}
        </span>
      </div>

      {/* Chart */}
      <div className="px-1 pb-3 h-[100px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 6, right: 4, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={stroke} stopOpacity={0.30} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0.00} />
              </linearGradient>
            </defs>

            {/* No CartesianGrid — clean look */}

            <XAxis
              dataKey="time"
              tick={{ fill: '#475569', fontSize: 9, fontFamily: 'system-ui' }}
              tickLine={false}
              axisLine={false}
              interval={5}
            />
            <YAxis
              domain={domain}
              tick={{ fill: '#334155', fontSize: 8, fontFamily: 'system-ui' }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              content={<GlassTooltip unit={unit} />}
              cursor={{ stroke: stroke, strokeWidth: 0.75, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey={dataKey as string}
              stroke={stroke}
              strokeWidth={1.75}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{
                r: 4,
                fill: stroke,
                stroke: '#0f172a',
                strokeWidth: 1.5,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkCard() {
  return (
    <div className="rounded-2xl bg-slate-900/50 border border-white/[0.07] p-4 space-y-3">
      <div className="flex justify-between">
        <div className="h-3 w-28 rounded-md bg-slate-800/70 animate-pulse" />
        <div className="h-5 w-14 rounded-md bg-slate-800/70 animate-pulse" />
      </div>
      <div className="h-[100px] rounded-xl bg-slate-800/40 animate-pulse" />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LiveMetricsPanel({ timeSeries }: LiveMetricsPanelProps) {
  const hasData = timeSeries.length > 0;

  return (
    <div
      className="h-full flex flex-col bg-slate-950/90 backdrop-blur-2xl border-l border-white/[0.05]"
      style={{ fontFamily: 'system-ui, -apple-system, Inter, sans-serif' }}
    >

      {/* Panel header */}
      <div className="flex-none px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <span className="w-[3px] h-5 rounded-full bg-violet-400 block shadow-[0_0_6px_#a78bfa]" />
          <span className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase text-slate-300">
            Live Metrics · 24 h
          </span>
        </div>
        <p className="text-[0.65rem] text-slate-600 mt-1 pl-[18px]">Rolling window · Bengaluru IST</p>
      </div>

      {/* Charts */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3
                   scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800"
      >
        {!hasData
          ? CHARTS.map((_, i) => <SkCard key={i} />)
          : CHARTS.map((cfg) => (
              <ChartCard
                key={cfg.key}
                data={timeSeries}
                label={cfg.label}
                unit={cfg.unit}
                stroke={cfg.stroke}
                domain={cfg.domain}
                dataKey={cfg.key}
                gradId={`grad-${cfg.key}`}
                format={cfg.format}
              />
            ))
        }

        <div className="h-2" />
      </motion.div>
    </div>
  );
}
