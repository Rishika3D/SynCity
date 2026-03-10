'use client';

/**
 * components/TopNavigation.tsx
 *
 * Command-centre top bar — NASA mission control meets Tesla UI.
 *
 * Left:   SYNCITY wordmark + module tag
 * Centre: Location coords, pulsing LIVE indicator, weather summary
 * Right:  System time, mode toggle buttons (Explore / Analytics / Simulation)
 */

'use client';

import { useState, useEffect }      from 'react';
import { motion, AnimatePresence }  from 'framer-motion';
import Link                         from 'next/link';
import type { WeatherExtremes }     from '@/lib/mockData';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TopNavigationProps {
  weather?: WeatherExtremes;
  activeMode?: 'explore' | 'analytics' | 'simulation';
}

// ─── Nav mode buttons ─────────────────────────────────────────────────────────

const NAV_MODES = [
  { id: 'explore',    label: 'EXPLORE',    href: '/explore'    },
  { id: 'analytics',  label: 'ANALYTICS',  href: '/analytics'  },
  { id: 'simulation', label: 'SIMULATION', href: '/simulation' },
] as const;

// ─── Live clock ───────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-IN', {
          timeZone:     'Asia/Kolkata',
          hour:         '2-digit',
          minute:       '2-digit',
          second:       '2-digit',
          hour12:       false,
        }) + ' IST',
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="font-mono text-[11px] tabular-nums text-white/60 tracking-widest">
      {time}
    </span>
  );
}

// ─── Pulsing live dot ─────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00f3ff] opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00f3ff]" />
    </span>
  );
}

// ─── AQI badge ────────────────────────────────────────────────────────────────

function AqiBadge({ aqi }: { aqi: number }) {
  const color = aqi < 100 ? 'text-emerald-400' : aqi < 150 ? 'text-amber-400' : 'text-rose-400';
  const label = aqi < 100 ? 'GOOD' : aqi < 150 ? 'MOD' : 'POOR';
  return (
    <span className={`text-[10px] font-mono tracking-widest ${color}`}>
      AQI {aqi} <span className="text-white/30">·</span> {label}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TopNavigation({
  weather,
  activeMode = 'analytics',
}: TopNavigationProps) {
  return (
    <nav
      className={[
        'w-full h-14 flex items-center justify-between px-4',
        'bg-[#050508]/80 backdrop-blur-xl',
        'border-b border-white/[0.07]',
        'shadow-[0_1px_0_0_rgba(0,243,255,0.08)]',
      ].join(' ')}
    >

      {/* ── Left: Logo ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 min-w-[220px]">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* Glyph mark */}
          <div className="relative w-7 h-7">
            <div className={[
              'w-7 h-7 border border-[#00f3ff]/60 rotate-45',
              'group-hover:border-[#00f3ff] transition-colors duration-300',
              'shadow-[0_0_12px_rgba(0,243,255,0.25)]',
            ].join(' ')} />
            <div className="absolute inset-[5px] bg-[#00f3ff]/20 rotate-45" />
          </div>
          <span
            className={[
              'text-[15px] font-bold tracking-[0.3em]',
              'text-white group-hover:text-[#00f3ff]',
              'transition-colors duration-300',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            SYNCITY
          </span>
        </Link>

        {/* Module tag */}
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="w-px h-4 bg-white/10" />
          <span className="text-[9px] tracking-[0.4em] text-white/30 uppercase">
            Command Centre
          </span>
        </div>
      </div>

      {/* ── Centre: Location + Live indicator + Weather ─────────────────────── */}
      <div className="flex items-center gap-4">

        {/* Coordinates */}
        <div className="hidden md:flex items-center gap-2">
          <svg className="w-3 h-3 text-[#00f3ff]/60" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span className="text-[11px] font-mono tracking-wider text-white/50">
            12.97°N&nbsp;&nbsp;77.59°E
          </span>
        </div>

        <span className="text-white/10">|</span>

        {/* Live indicator */}
        <motion.div
          className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#00f3ff]/20 bg-[#00f3ff]/5"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <LiveDot />
          <span className="text-[10px] font-mono tracking-[0.35em] text-[#00f3ff]">LIVE</span>
        </motion.div>

        <span className="text-white/10">|</span>

        {/* Weather summary */}
        {weather && (
          <div className="hidden lg:flex items-center gap-3">
            <span className="text-[11px] font-mono text-white/50">
              {weather.temperature.currentC}°C
            </span>
            <span className="text-[9px] tracking-wider text-white/30 uppercase">
              {weather.condition}
            </span>
            <AqiBadge aqi={142} />
          </div>
        )}
      </div>

      {/* ── Right: Clock + Mode toggles ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-[220px] justify-end">

        <LiveClock />

        <span className="w-px h-4 bg-white/10" />

        {/* Mode toggle buttons */}
        <div className="flex items-center gap-1">
          {NAV_MODES.map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <Link key={mode.id} href={mode.href}>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className={[
                    'relative px-3 py-1.5 text-[9px] tracking-[0.25em] font-mono uppercase',
                    'rounded transition-all duration-200',
                    isActive
                      ? 'text-[#00f3ff] border border-[#00f3ff]/40 bg-[#00f3ff]/10 shadow-[0_0_12px_rgba(0,243,255,0.2)]'
                      : 'text-white/30 border border-white/[0.07] hover:text-white/60 hover:border-white/20',
                  ].join(' ')}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-indicator"
                      className="absolute inset-0 rounded bg-[#00f3ff]/5"
                    />
                  )}
                  {mode.label}
                </motion.button>
              </Link>
            );
          })}
        </div>

      </div>
    </nav>
  );
}
