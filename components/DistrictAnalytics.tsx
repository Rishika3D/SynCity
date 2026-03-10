'use client';

/**
 * components/DistrictAnalytics.tsx
 *
 * Bottom panel — District Analytics.
 *
 * Horizontally scrolling cards for each Bangalore district.
 * Hover → cyan glow.  Framer Motion staggered entrance.
 * Each card shows: name, type badge, AQI, traffic density, energy MW,
 *   growth index bar, safety score, infrastructure score.
 */

import { motion }             from 'framer-motion';
import type { DistrictData }  from '@/lib/mockData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DistrictAnalyticsProps {
  districts: DistrictData[];
}

// ─── Animation ────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.4 } },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 16, scale: 0.96 },
  visible: { opacity: 1, y: 0,  scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeColor(type: DistrictData['type']): string {
  const m: Record<DistrictData['type'], string> = {
    commercial:  '#f59e0b',
    residential: '#34d399',
    industrial:  '#f87171',
    tech:        '#a78bfa',
    mixed:       '#00f3ff',
  };
  return m[type] ?? '#00f3ff';
}

function aqiColor(aqi: number): string {
  if (aqi < 100) return '#34d399';
  if (aqi < 150) return '#f59e0b';
  return '#f87171';
}

function ScoreBar({
  value, color, label,
}: { value: number; color: string; label: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[8px] text-white/30 font-mono uppercase tracking-widest">{label}</span>
        <span className="text-[9px] font-mono text-white/50">{value}</span>
      </div>
      <div className="h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}88` }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.6 }}
        />
      </div>
    </div>
  );
}

// ─── District card ────────────────────────────────────────────────────────────

function DistrictCard({ d }: { d: DistrictData }) {
  const tc = typeColor(d.type);

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ scale: 1.02, y: -2 }}
      className={[
        'relative flex-none w-[180px] px-4 py-4 rounded-xl',
        'bg-white/[0.02] border border-white/[0.07]',
        'hover:border-white/[0.18] transition-colors duration-300',
        'overflow-hidden cursor-pointer group',
      ].join(' ')}
      style={{}}
    >
      {/* Hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none rounded-xl"
        style={{ background: `radial-gradient(circle at 50% 0%, ${tc}12, transparent 70%)` }}
      />

      {/* Type badge */}
      <div
        className="inline-flex items-center px-2 py-0.5 rounded-full mb-2.5 text-[8px] font-mono tracking-widest uppercase"
        style={{
          backgroundColor: `${tc}18`,
          color:           tc,
          border:          `1px solid ${tc}30`,
        }}
      >
        {d.type}
      </div>

      {/* Name */}
      <h3 className="text-[13px] font-bold text-white/85 mb-0.5 leading-tight">
        {d.name}
      </h3>
      <p className="text-[9px] text-white/25 font-mono mb-3">
        {(d.population / 1000).toFixed(0)}K pop · {d.areaKm2} km²
      </p>

      {/* AQI + Traffic row */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-center">
          <p className="text-[8px] text-white/25 font-mono tracking-widest uppercase">AQI</p>
          <p
            className="text-[15px] font-bold font-mono tabular-nums leading-tight"
            style={{ color: aqiColor(d.aqi), textShadow: `0 0 10px ${aqiColor(d.aqi)}66` }}
          >
            {d.aqi}
          </p>
        </div>
        <div className="w-px h-8 bg-white/[0.06]" />
        <div className="text-center">
          <p className="text-[8px] text-white/25 font-mono tracking-widest uppercase">Traffic</p>
          <p className="text-[15px] font-bold font-mono tabular-nums leading-tight text-amber-400"
             style={{ textShadow: '0 0 10px #f59e0b66' }}>
            {d.trafficDensity}
          </p>
        </div>
        <div className="w-px h-8 bg-white/[0.06]" />
        <div className="text-center">
          <p className="text-[8px] text-white/25 font-mono tracking-widest uppercase">MW</p>
          <p className="text-[15px] font-bold font-mono tabular-nums leading-tight text-violet-400"
             style={{ textShadow: '0 0 10px #a78bfa66' }}>
            {d.energyUsageMW}
          </p>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-1.5">
        <ScoreBar value={d.growthIndex}         color={tc}        label="Growth" />
        <ScoreBar value={d.safetyScore}          color="#34d399"   label="Safety" />
        <ScoreBar value={d.infrastructureScore}  color="#38bdf8"   label="Infra"  />
      </div>

      {/* Incident badge */}
      {d.incidentCount > 0 && (
        <div className="absolute top-3 right-3 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20">
          <span className="w-1 h-1 rounded-full bg-rose-400" />
          <span className="text-[8px] font-mono text-rose-400">{d.incidentCount}</span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DistrictAnalytics({ districts }: DistrictAnalyticsProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Panel header */}
      <div className={[
        'flex-none px-4 py-2.5',
        'border-b border-white/[0.06]',
        'bg-[#050508]/70 backdrop-blur-xl',
        'flex items-center justify-between',
      ].join(' ')}>
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-[#34d399] shadow-[0_0_8px_#34d399]" />
          <span className="text-[10px] tracking-[0.4em] text-white/50 uppercase font-mono">
            District Analytics
          </span>
        </div>
        <span className="text-[9px] text-white/25 font-mono">
          {districts.length} zones · Bengaluru
        </span>
      </div>

      {/* Scrollable card strip */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 flex items-center gap-3 px-4 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
      >
        {districts.map((d) => (
          <DistrictCard key={d.id} d={d} />
        ))}
        {/* Right fade spacer */}
        <div className="flex-none w-2" />
      </motion.div>
    </div>
  );
}
