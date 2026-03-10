'use client';

/**
 * components/WeatherControlPanel.tsx
 *
 * Weather summary + interactive condition control for the analytics dashboard.
 *
 * - Current conditions card (temp, humidity, wind, UV, visibility)
 * - 5-slot hourly forecast strip
 * - Weather alert callout (if active)
 * - Condition preset buttons: Clear · Rain · Haze · Storm
 *   with Framer Motion press animations
 * - Rain intensity slider
 */

import { useState }          from 'react';
import { motion }             from 'framer-motion';
import type { WeatherExtremes } from '@/lib/mockData';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeatherControlPanelProps {
  weather: WeatherExtremes;
}

type WeatherCondition = 'clear' | 'rain' | 'haze' | 'storm';

// ─── Animation ────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

// ─── Condition presets ────────────────────────────────────────────────────────

const CONDITIONS: {
  id:    WeatherCondition;
  icon:  string;
  label: string;
  color: string;
}[] = [
  { id: 'clear', icon: '☀', label: 'CLEAR',  color: '#fbbf24' },
  { id: 'rain',  icon: '🌧', label: 'RAIN',   color: '#38bdf8' },
  { id: 'haze',  icon: '🌫', label: 'HAZE',   color: '#94a3b8' },
  { id: 'storm', icon: '⛈', label: 'STORM',  color: '#818cf8' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function conditionEmoji(c: string): string {
  const map: Record<string, string> = {
    'Partly Cloudy': '⛅',
    'Cloudy':        '☁',
    'Thunderstorm':  '⛈',
    'Light Rain':    '🌦',
    'Clear':         '☀',
  };
  return map[c] ?? '🌤';
}

function StatChip({
  label, value, unit,
}: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-white/25 font-mono tracking-widest uppercase">{label}</span>
      <span className="text-[13px] font-bold font-mono text-white/70 tabular-nums">
        {value}{unit}
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeatherControlPanel({ weather }: WeatherControlPanelProps) {
  const [condition, setCondition] = useState<WeatherCondition>(
    weather.condition.toLowerCase().includes('rain') ? 'rain'
    : weather.condition.toLowerCase().includes('storm') ? 'storm'
    : 'clear',
  );
  const [rainIntensity, setRainIntensity] = useState(60);

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Panel header */}
      <div className={[
        'flex-none px-4 py-3',
        'border-b border-white/[0.06]',
        'bg-[#050508]/60 backdrop-blur-xl',
      ].join(' ')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8]" />
            <span className="text-[10px] tracking-[0.4em] text-white/50 uppercase font-mono">
              Weather
            </span>
          </div>
          <span className="text-[10px] font-mono text-white/30">
            {weather.condition}
          </span>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 px-3 py-3 space-y-3"
      >

        {/* ── Current temp hero ──────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          className="px-4 py-4 rounded-xl bg-white/[0.03] border border-white/[0.07] text-center"
        >
          <div className="text-[36px] mb-1">
            {conditionEmoji(weather.condition)}
          </div>
          <div className="flex items-baseline justify-center gap-1.5 mb-0.5">
            <span
              className="text-[40px] font-bold font-mono tabular-nums leading-none"
              style={{
                color:      '#f87171',
                textShadow: '0 0 24px #f8717166',
              }}
            >
              {weather.temperature.currentC}
            </span>
            <span className="text-[16px] text-white/40 font-mono mb-1">°C</span>
          </div>
          <p className="text-[10px] text-white/30 font-mono">
            Feels {weather.temperature.feelsC}°C &nbsp;·&nbsp;
            H {weather.temperature.highC}° / L {weather.temperature.lowC}°
          </p>
        </motion.div>

        {/* ── Stat chips ─────────────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-4 gap-2 px-2 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"
        >
          <StatChip label="Humidity" value={weather.humidity}  unit="%" />
          <StatChip label="Wind"     value={weather.windSpeedKph} unit=" km/h" />
          <StatChip label="UV"       value={weather.uvIndex} />
          <StatChip label="Vis."     value={weather.visibilityKm} unit=" km" />
        </motion.div>

        {/* ── Hourly forecast strip ──────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <p className="text-[9px] tracking-[0.3em] text-white/30 font-mono uppercase mb-2 px-1">
            Hourly Forecast
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {weather.forecast.map((f) => (
              <div
                key={f.time}
                className="flex-none flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] min-w-[60px]"
              >
                <span className="text-[10px] text-white/40 font-mono">{f.time}</span>
                <span className="text-[16px]">{conditionEmoji(f.condition)}</span>
                <span className="text-[12px] font-bold font-mono text-white/70">{f.tempC}°</span>
                <span className="text-[9px] font-mono text-[#38bdf8]/70">
                  {f.chanceRain}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Alert callout ──────────────────────────────────────────────── */}
        {weather.alerts.length > 0 && weather.alerts.map((alert) => (
          <motion.div
            key={alert.type}
            variants={itemVariants}
            className={[
              'px-4 py-3 rounded-xl border',
              alert.severity === 'high' || alert.severity === 'critical'
                ? 'bg-rose-500/5 border-rose-500/30'
                : 'bg-amber-500/5 border-amber-500/25',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={
                alert.severity === 'high' ? 'text-rose-400' : 'text-amber-400'
              }>⚠</span>
              <span className={`text-[10px] font-mono tracking-widest uppercase ${
                alert.severity === 'high' ? 'text-rose-400' : 'text-amber-400'
              }`}>
                {alert.type}
              </span>
            </div>
            <p className="text-[10px] text-white/40 font-mono leading-relaxed">
              {alert.description}
            </p>
            <p className="text-[9px] text-white/25 font-mono mt-1">
              Until {alert.activeUntil}
            </p>
          </motion.div>
        ))}

        {/* ── Condition presets ──────────────────────────────────────────── */}
        <motion.div variants={itemVariants}>
          <p className="text-[9px] tracking-[0.3em] text-white/30 font-mono uppercase mb-2 px-1">
            Simulate Condition
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CONDITIONS.map((c) => {
              const isActive = condition === c.id;
              return (
                <motion.button
                  key={c.id}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCondition(c.id)}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl',
                    'border transition-all duration-200 text-left',
                    isActive
                      ? 'border-white/20 bg-white/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
                  ].join(' ')}
                  style={isActive ? {
                    boxShadow: `0 0 12px ${c.color}30`,
                    borderColor: `${c.color}50`,
                  } : {}}
                >
                  <span className="text-[16px] leading-none">{c.icon}</span>
                  <span
                    className="text-[10px] tracking-[0.2em] font-mono"
                    style={{ color: isActive ? c.color : 'rgba(255,255,255,0.4)' }}
                  >
                    {c.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* ── Rain intensity slider ──────────────────────────────────────── */}
        {(condition === 'rain' || condition === 'storm') && (
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="px-4 py-3 rounded-xl bg-[#38bdf8]/5 border border-[#38bdf8]/15"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-[0.25em] text-white/40 font-mono uppercase">
                Rain Intensity
              </span>
              <span className="text-[12px] font-bold font-mono text-[#38bdf8]">
                {rainIntensity}%
              </span>
            </div>
            <input
              type="range"
              min={0} max={100}
              value={rainIntensity}
              onChange={(e) => setRainIntensity(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #38bdf8 ${rainIntensity}%, rgba(255,255,255,0.08) ${rainIntensity}%)`,
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[8px] text-white/20 font-mono">DRIZZLE</span>
              <span className="text-[8px] text-white/20 font-mono">DOWNPOUR</span>
            </div>
          </motion.div>
        )}

        {/* Bottom spacer */}
        <div className="h-3" />
      </motion.div>
    </div>
  );
}
