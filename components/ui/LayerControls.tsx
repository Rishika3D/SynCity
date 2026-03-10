'use client';

/**
 * components/ui/LayerControls.tsx
 *
 * HUD control panel — right-side drawer overlay on the explore page.
 * Controls:
 *   ▸ Layer toggles  — roads, buildings, water, parks, traffic, districts
 *   ▸ Weather mode   — Clear / Drizzle / Rain / Haze
 *   ▸ Time display   — current local time + day/night indicator
 *
 * Glassmorphism style matching the rest of SynCity UI.
 * Collapses to a thin icon strip on mobile.
 */

import { useState }             from 'react';
import { useWeather, WeatherMode } from '@/contexts/WeatherContext';
import { useTimeOfDay }           from '@/contexts/TimeOfDayContext';
import type { LayerVisibility }   from '@/components/CityScene';

// ─── Layer config ─────────────────────────────────────────────────────────────

interface LayerDef {
  key:   keyof LayerVisibility;
  label: string;
  icon:  string;
}

const LAYER_DEFS: LayerDef[] = [
  { key: 'roads',     label: 'Roads',     icon: '━' },
  { key: 'buildings', label: 'Buildings', icon: '▪' },
  { key: 'water',     label: 'Water',     icon: '◈' },
  { key: 'parks',     label: 'Parks',     icon: '◉' },
  { key: 'traffic',   label: 'Traffic',   icon: '●' },
  { key: 'districts', label: 'Districts', icon: '⬡' },
  { key: 'googleMap', label: 'Google Map', icon: '◍' },
];

// ─── Weather config ───────────────────────────────────────────────────────────

const WEATHER_OPTIONS: { mode: WeatherMode; label: string; icon: string }[] = [
  { mode: WeatherMode.Clear,   label: 'Clear',   icon: '○' },
  { mode: WeatherMode.Drizzle, label: 'Drizzle', icon: '◌' },
  { mode: WeatherMode.Rain,    label: 'Rain',    icon: '◎' },
  { mode: WeatherMode.Haze,    label: 'Haze',    icon: '◐' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[7px] tracking-[0.35em] uppercase text-white/22 mb-2">
      {children}
    </p>
  );
}

function ToggleRow({
  label, icon, active, onClick,
}: {
  label:   string;
  icon:    string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[3px]
        font-mono text-[8.5px] tracking-[0.22em] uppercase
        transition-all duration-200 text-left
        ${active
          ? 'bg-cyan-400/10 text-cyan-300/80 border border-cyan-400/20'
          : 'text-white/25 border border-transparent hover:border-white/8 hover:text-white/40'}
      `}
    >
      <span className={`text-[10px] w-3 text-center ${active ? 'text-cyan-400' : 'text-white/18'}`}>
        {icon}
      </span>
      {label}
      <span className={`ml-auto text-[6px] ${active ? 'text-cyan-400/70' : 'text-white/15'}`}>
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

function WeatherBtn({
  label, icon, active, onClick,
}: {
  label:   string;
  icon:    string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 flex flex-col items-center gap-1 py-2 rounded-[3px]
        font-mono text-[7px] tracking-[0.18em] uppercase
        transition-all duration-200 border
        ${active
          ? 'bg-cyan-400/12 text-cyan-300/90 border-cyan-400/25'
          : 'text-white/20 border-white/6 hover:border-white/12 hover:text-white/35'}
      `}
    >
      <span className="text-[11px]">{icon}</span>
      {label}
    </button>
  );
}

// ─── Time indicator ───────────────────────────────────────────────────────────

function TimeIndicator() {
  const { hour, isDaytime, dayFactor } = useTimeOfDay();

  const h   = Math.floor(hour);
  const m   = Math.floor((hour - h) * 60);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Sun arc position [0,1] — 0 = midnight, 0.5 = noon
  const sunArc = hour / 24;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Time display */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[8px] tracking-[0.2em] text-white/25">LOCAL TIME</span>
        <span className="font-mono text-[9px] tracking-[0.15em] text-white/50" suppressHydrationWarning>
          {pad(h)}:{pad(m)}
        </span>
      </div>

      {/* Day/Night arc bar */}
      <div className="relative h-1.5 rounded-full overflow-hidden bg-white/5">
        {/* Day zone */}
        <div
          className="absolute inset-y-0 bg-gradient-to-r from-amber-400/20 via-yellow-300/30 to-amber-400/20 rounded-full"
          style={{ left: '27%', right: '25%' }}   /* 06:30–18:30 = 50% of 24h */
        />
        {/* Sun/moon position cursor */}
        <div
          className={`absolute top-0.5 w-0.5 h-0.5 rounded-full transition-all duration-1000
            ${isDaytime ? 'bg-yellow-300' : 'bg-blue-300/60'}`}
          style={{ left: `calc(${sunArc * 100}% - 1px)` }}
        />
      </div>

      {/* Mode label */}
      <div className="flex items-center gap-1.5">
        <div className={`w-1 h-1 rounded-full ${isDaytime ? 'bg-yellow-400/60' : 'bg-blue-400/60'}`} />
        <span className={`font-mono text-[7px] tracking-[0.3em] uppercase
          ${isDaytime ? 'text-yellow-300/40' : 'text-blue-300/40'}`}>
          {dayFactor < 0.2 ? 'Night' : dayFactor < 0.8 ? 'Transition' : 'Day'}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LayerControlsProps {
  layers:   LayerVisibility;
  onChange: (next: LayerVisibility) => void;
}

export function LayerControls({ layers, onChange }: LayerControlsProps) {
  const { weather, setWeather } = useWeather();
  const [open, setOpen]         = useState(true);

  const toggle = (key: keyof LayerVisibility) =>
    onChange({ ...layers, [key]: !layers[key] });

  return (
    <div className="absolute right-3 top-14 bottom-14 flex items-start pointer-events-none z-20">
      <div className="flex flex-col gap-2 pointer-events-auto">

        {/* ── Collapse toggle ── */}
        <button
          onClick={() => setOpen(v => !v)}
          className="
            self-end w-7 h-7 flex items-center justify-center
            rounded-[3px] border border-white/8
            font-mono text-[10px] text-white/30 hover:text-white/60
            transition-all duration-200
          "
          style={{ background: 'rgba(11,12,16,0.70)', backdropFilter: 'blur(16px)' }}
          title={open ? 'Collapse controls' : 'Open controls'}
        >
          {open ? '✕' : '⊞'}
        </button>

        {open && (
          <div
            className="flex flex-col gap-4 p-3.5 rounded-[4px] border border-white/7 w-[148px]"
            style={{ background: 'rgba(11,12,16,0.78)', backdropFilter: 'blur(22px)' }}
          >
            {/* ── Time / Day-Night ── */}
            <div>
              <SectionLabel>Time of Day</SectionLabel>
              <TimeIndicator />
            </div>

            <div className="h-px bg-white/6" />

            {/* ── Layer toggles ── */}
            <div>
              <SectionLabel>Layers</SectionLabel>
              <div className="flex flex-col gap-1">
                {LAYER_DEFS.map(({ key, label, icon }) => (
                  <ToggleRow
                    key={key}
                    label={label}
                    icon={icon}
                    active={layers[key]}
                    onClick={() => toggle(key)}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-white/6" />

            {/* ── Weather mode ── */}
            <div>
              <SectionLabel>Weather</SectionLabel>
              <div className="grid grid-cols-2 gap-1">
                {WEATHER_OPTIONS.map(({ mode, label, icon }) => (
                  <WeatherBtn
                    key={mode}
                    label={label}
                    icon={icon}
                    active={weather === mode}
                    onClick={() => setWeather(mode)}
                  />
                ))}
              </div>
            </div>

            {/* ── Footer label ── */}
            <p className="font-mono text-[6.5px] tracking-[0.3em] uppercase text-white/12 text-center">
              SynCity v4 · Prompt 4
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
