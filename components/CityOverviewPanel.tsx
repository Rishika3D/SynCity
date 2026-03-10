'use client';

/**
 * components/CityOverviewPanel.tsx
 *
 * Left panel — City Overview · Premium Glassmorphism Edition.
 *
 * Design system (v2):
 *  - Background: bg-slate-950/90 backdrop-blur-2xl (no more pure black)
 *  - Cards: bg-slate-900/50 border border-white/[0.07] rounded-2xl p-5
 *  - Typography: system-ui / Inter; text-3xl for primary values
 *  - Color story: emerald (good) · amber (warning) · rose (critical)
 *  - Spacing: gap-3 between cards, p-5 internal padding
 *  - Loading: animate-pulse skeleton placeholders
 *
 * Data: accepts LiveCityData from services/cityData.ts (real APIs)
 */

import { motion }               from 'framer-motion';
import type { LiveCityData }    from '@/services/cityData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CityOverviewPanelProps {
  data:       LiveCityData | null;
  isLoading?: boolean;
}

// ─── Animation ────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── Color helpers ────────────────────────────────────────────────────────────

const c = {
  traffic:   (v: number) => v > 70 ? 'text-rose-400'    : v > 45 ? 'text-amber-400'   : 'text-emerald-400',
  aqi:       (v: number) => v > 150 ? 'text-rose-400'   : v > 100 ? 'text-amber-400'  : 'text-emerald-400',
  reservoir: (v: number) => v < 40 ? 'text-rose-400'    : v < 60 ? 'text-amber-400'   : 'text-emerald-400',
  gridLoad:  (v: number) => v > 90 ? 'text-rose-400'    : v > 75 ? 'text-amber-400'   : 'text-emerald-400',
  barBg:     (cls: string) =>
    cls.includes('rose')    ? 'bg-rose-500'
    : cls.includes('amber') ? 'bg-amber-500'
    : 'bg-emerald-500',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} rounded-lg bg-slate-800/70 animate-pulse`} />;
}

// ─── Trend arrow ──────────────────────────────────────────────────────────────

function Trend({ t }: { t: 'rising' | 'falling' | 'stable' }) {
  if (t === 'rising')  return <span className="text-rose-400 text-sm leading-none">↑</span>;
  if (t === 'falling') return <span className="text-emerald-400 text-sm leading-none">↓</span>;
  return <span className="text-slate-600 text-sm leading-none">→</span>;
}

// ─── Micro progress bar ───────────────────────────────────────────────────────

function Bar({ pct, colorClass }: { pct: number; colorClass: string }) {
  const bg = c.barBg(colorClass);
  return (
    <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${bg}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.3 }}
      />
    </div>
  );
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function Card({
  label, value, unit, sub, pct, colorClass, trend, children,
}: {
  label:      string;
  value?:     string | number;
  unit?:      string;
  sub?:       string;
  pct?:       number;
  colorClass?: string;
  trend?:     'rising' | 'falling' | 'stable';
  children?:  React.ReactNode;
}) {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
      className="p-5 rounded-2xl bg-slate-900/50 border border-white/[0.07] space-y-2"
    >
      {/* Label row */}
      <div className="flex items-center justify-between">
        <p className="text-[0.65rem] font-medium tracking-[0.18em] uppercase text-slate-500">
          {label}
        </p>
        {trend && <Trend t={trend} />}
      </div>

      {/* Primary value */}
      {value !== undefined ? (
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[2rem] font-bold leading-none tracking-tight ${colorClass ?? 'text-white'}`}>
            {value}
          </span>
          {unit && <span className="text-sm text-slate-500 font-medium">{unit}</span>}
        </div>
      ) : children}

      {/* Sub-label */}
      {sub && <p className="text-xs text-slate-500 leading-relaxed">{sub}</p>}

      {/* Progress bar */}
      {pct !== undefined && colorClass && (
        <Bar pct={pct} colorClass={colorClass} />
      )}
    </motion.div>
  );
}

// ─── Loading skeleton card ────────────────────────────────────────────────────

function SkCard() {
  return (
    <div className="p-5 rounded-2xl bg-slate-900/50 border border-white/[0.07] space-y-3">
      <Sk w="w-24" h="h-3" />
      <Sk w="w-20" h="h-8" />
      <Sk w="w-full" h="h-3" />
      <Sk w="w-full" h="h-[3px]" />
    </div>
  );
}

// ─── Weather condition emoji ──────────────────────────────────────────────────

function condEmoji(code: number): string {
  if (code === 0 || code === 1)  return '☀️';
  if (code === 2)                return '⛅';
  if (code === 3)                return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95)                return '⛈️';
  return '🌤️';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CityOverviewPanel({ data, isLoading = false }: CityOverviewPanelProps) {
  const w = data?.weather;
  const t = data?.traffic;
  const u = data?.utility;

  const trafficCls   = t ? c.traffic(t.congestionLevel)     : 'text-white';
  const aqiCls       = w ? c.aqi(w.aqi)                    : 'text-white';
  const reservoirCls = u ? c.reservoir(u.waterReservoirPct) : 'text-white';
  const gridCls      = u ? c.gridLoad(u.gridLoadPct)        : 'text-white';

  return (
    <div
      className="h-full flex flex-col bg-slate-950/90 backdrop-blur-2xl border-r border-white/[0.06]"
      style={{ fontFamily: 'system-ui, -apple-system, Inter, sans-serif' }}
    >

      {/* ── Panel header ───────────────────────────────────────────────── */}
      <div className="flex-none px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-[3px] h-5 rounded-full bg-cyan-400 block shadow-[0_0_6px_#22d3ee]" />
            <span className="text-[0.7rem] font-semibold tracking-[0.2em] uppercase text-slate-300">
              City Overview
            </span>
          </div>

          {/* Live / fallback badge */}
          <div className="flex items-center gap-1.5">
            {isLoading ? (
              <span className="text-[0.6rem] text-slate-600 font-mono tracking-wider">LOADING…</span>
            ) : data ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[0.6rem] text-slate-500 font-mono tracking-wider">LIVE</span>
              </>
            ) : null}
          </div>
        </div>

        <p className="text-[0.65rem] text-slate-600 mt-1 pl-[18px]" suppressHydrationWarning>
          Bengaluru · {new Date().toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit',
          })}
          {data && !isLoading && (
            <> · Updated {data.lastUpdated.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
            })}</>
          )}
        </p>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3
                   scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-800"
      >

        {/* ── Weather ── */}
        {isLoading ? <SkCard /> : w ? (
          <motion.div
            variants={cardVariants}
            className="p-5 rounded-2xl bg-slate-900/50 border border-white/[0.07]"
          >
            <p className="text-[0.65rem] font-medium tracking-[0.18em] uppercase text-slate-500 mb-3">
              Weather
            </p>

            {/* Temp + emoji */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[2.4rem] font-bold leading-none text-white">
                  {w.temperatureC}
                </span>
                <span className="text-xl text-slate-400 font-light">°C</span>
              </div>
              <span className="text-3xl">{condEmoji(w.weatherCode)}</span>
            </div>

            <p className="text-sm text-slate-400 mb-3">{w.condition} · Feels {w.feelsLikeC}°C</p>

            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Humidity',  value: `${w.humidity}%`         },
                { label: 'Wind',      value: `${w.windSpeedKph} km/h` },
                { label: 'UV Index',  value: String(w.uvIndex)         },
              ].map(({ label, value }) => (
                <div key={label} className="text-center px-1 py-2 rounded-xl bg-slate-800/40">
                  <p className="text-[0.6rem] text-slate-600 tracking-wider uppercase mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-300">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}

        {/* ── Traffic ── */}
        {isLoading ? <SkCard /> : t ? (
          <Card
            label="Traffic Congestion"
            value={t.congestionLevel}
            unit="/ 100"
            sub={`${t.averageSpeedKph} km/h avg · ${t.isSimulated ? 'Simulated' : 'Live TomTom'}`}
            pct={t.congestionLevel}
            colorClass={trafficCls}
            trend={t.trend}
          />
        ) : null}

        {/* ── Power Grid ── */}
        {isLoading ? <SkCard /> : u ? (
          <motion.div
            variants={cardVariants}
            className="p-5 rounded-2xl bg-slate-900/50 border border-white/[0.07] space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-[0.65rem] font-medium tracking-[0.18em] uppercase text-slate-500">
                Power Grid
              </p>
              <Trend t={u.powerTrend} />
            </div>

            <div className="flex items-baseline gap-2">
              <span className={`text-[2rem] font-bold leading-none ${gridCls}`}>
                {u.powerConsumptionMW.toLocaleString('en-IN')}
              </span>
              <span className="text-sm text-slate-500">MW</span>
            </div>

            <p className="text-xs text-slate-500">
              Grid load {u.gridLoadPct}% · {u.renewablePct}% renewable
            </p>
            <Bar pct={u.gridLoadPct} colorClass={gridCls} />

            {/* Renewable mini-bar */}
            <div className="flex items-center gap-2 pt-0.5">
              <div className="flex-1 h-[2px] rounded-full bg-white/[0.05] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${u.renewablePct}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay: 0.5 }}
                />
              </div>
              <span className="text-[0.6rem] text-emerald-500 font-mono">{u.renewablePct}% solar</span>
            </div>
          </motion.div>
        ) : null}

        {/* ── Water Network ── */}
        {isLoading ? <SkCard /> : u ? (
          <motion.div
            variants={cardVariants}
            className="p-5 rounded-2xl bg-slate-900/50 border border-white/[0.07] space-y-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-[0.65rem] font-medium tracking-[0.18em] uppercase text-slate-500">
                Water Network
              </p>
              <Trend t={u.waterTrend} />
            </div>

            <div className="flex items-baseline gap-2">
              <span className={`text-[2rem] font-bold leading-none ${reservoirCls}`}>
                {u.waterReservoirPct}
              </span>
              <span className="text-sm text-slate-500">% reservoir</span>
            </div>

            <p className="text-xs text-slate-500">
              Supply {u.waterSupplyMLD.toLocaleString('en-IN')} MLD
              {' · '}Demand {u.waterDemandMLD.toLocaleString('en-IN')} MLD
              {' · '}{u.activeLeaks} leaks
            </p>
            <Bar pct={u.waterReservoirPct} colorClass={reservoirCls} />
          </motion.div>
        ) : null}

        {/* ── Air Quality ── */}
        {isLoading ? <SkCard /> : w ? (
          <motion.div
            variants={cardVariants}
            className="p-5 rounded-2xl bg-slate-900/50 border border-white/[0.07] space-y-2"
          >
            <p className="text-[0.65rem] font-medium tracking-[0.18em] uppercase text-slate-500">
              Air Quality
            </p>

            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-2">
                <span className={`text-[2rem] font-bold leading-none ${aqiCls}`}>
                  {w.aqi}
                </span>
                <span className="text-sm text-slate-500">AQI</span>
              </div>
              <span className={`text-sm font-semibold ${aqiCls}`}>{w.aqiCategory}</span>
            </div>

            <Bar pct={(w.aqi / 300) * 100} colorClass={aqiCls} />

            {/* Pollutant chips */}
            <div className="flex gap-2 pt-1">
              {[
                { label: 'PM2.5', value: w.pm25 },
                { label: 'PM10',  value: w.pm10  },
                { label: 'NO₂',   value: w.no2   },
              ].map(({ label, value }) => (
                <div key={label} className="flex-1 text-center py-1.5 rounded-lg bg-slate-800/40">
                  <p className="text-[0.58rem] text-slate-600 uppercase tracking-wider">{label}</p>
                  <p className="text-xs font-semibold text-slate-400">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}

        {/* ── Traffic hotspots ── */}
        {!isLoading && t && t.hotspots.length > 0 && (
          <motion.div
            variants={cardVariants}
            className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20"
          >
            <p className="text-[0.65rem] font-medium tracking-[0.18em] uppercase text-amber-500/80 mb-2">
              ⚠ Traffic Hotspots
            </p>
            <div className="flex flex-wrap gap-1.5">
              {t.hotspots.map((s) => (
                <span
                  key={s}
                  className="text-xs text-amber-300/70 bg-amber-500/10 border border-amber-500/15 px-2.5 py-1 rounded-full"
                >
                  {s}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Bottom spacer */}
        <div className="h-4" />
      </motion.div>
    </div>
  );
}
