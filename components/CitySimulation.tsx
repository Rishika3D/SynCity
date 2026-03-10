'use client';

/**
 * components/CitySimulation.tsx
 *
 * SynCity — City Simulation · Obsidian Apple Design
 *
 * Sections:
 *   01 — Scenario selector  (6 preset city event scenarios)
 *   02 — Parameters         (intensity + duration sliders)
 *   03 — Impact Analysis    (5-dimension delta grid + cascade narrative)
 *   04 — Infrastructure     (zone stress bars)
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Train, Route, CloudRain, Flame, Zap, Users,
  ChevronRight, Play, RotateCcw, TrendingUp, TrendingDown,
  Activity,
} from 'lucide-react';

// ─── Palette ──────────────────────────────────────────────────────────────────

const O = {
  bg:         '#09090b',
  line:       'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.12)',
  text:       '#f5f5f7',
  text50:     'rgba(245,245,247,0.5)',
  text30:     'rgba(245,245,247,0.3)',
  text20:     'rgba(245,245,247,0.2)',
  text10:     'rgba(245,245,247,0.1)',
  green:      'rgba(52,199,89,0.85)',
  amber:      'rgba(255,159,10,0.85)',
  red:        'rgba(255,69,58,0.85)',
  blue:       'rgba(10,132,255,0.85)',
  purple:     'rgba(175,82,222,0.85)',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Impacts { traffic: number; aqi: number; energy: number; water: number; population: number }

interface Scenario {
  id:          string;
  label:       string;
  description: string;
  icon:        React.ReactNode;
  accent:      string;
  impacts:     Impacts;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    id: 'metro', label: 'Metro Expansion',
    description: 'Add new corridor from Silk Board to Electronic City',
    icon: <Train size={15} />, accent: O.blue,
    impacts: { traffic: -28, aqi: -15, energy: +12, water:   0, population: +8  },
  },
  {
    id: 'arterial', label: 'Road Rerouting',
    description: 'Reroute Outer Ring Road traffic via Hebbal flyover',
    icon: <Route size={15} />, accent: O.amber,
    impacts: { traffic: +14, aqi:  +9, energy:  +3, water:   0, population: -2  },
  },
  {
    id: 'flood', label: 'Flood Conditions',
    description: 'Monsoon flooding across low-lying zones in Bellandur',
    icon: <CloudRain size={15} />, accent: O.blue,
    impacts: { traffic: +42, aqi:  -5, energy: +18, water: -30, population: -12 },
  },
  {
    id: 'heatwave', label: 'Heat Wave',
    description: 'Sustained 40°C temperatures over 7 consecutive days',
    icon: <Flame size={15} />, accent: O.red,
    impacts: { traffic:  -8, aqi: +22, energy: +35, water: -18, population: -5  },
  },
  {
    id: 'surge', label: 'Power Surge',
    description: '15% grid load spike during peak evening demand window',
    icon: <Zap size={15} />, accent: O.amber,
    impacts: { traffic:  +5, aqi:  +8, energy: +48, water:  +4, population:  0  },
  },
  {
    id: 'growth', label: 'Population Growth',
    description: '12% population increase in peripheral tech corridors',
    icon: <Users size={15} />, accent: O.purple,
    impacts: { traffic: +31, aqi: +18, energy: +22, water: +25, population: +12 },
  },
];

const DIMENSIONS: { key: keyof Impacts; label: string; positiveIsGood: boolean }[] = [
  { key: 'traffic',    label: 'Traffic Flow',      positiveIsGood: false },
  { key: 'aqi',        label: 'Air Quality',        positiveIsGood: false },
  { key: 'energy',     label: 'Energy Demand',      positiveIsGood: false },
  { key: 'water',      label: 'Water Supply',       positiveIsGood: true  },
  { key: 'population', label: 'Pop. Satisfaction',  positiveIsGood: true  },
];

const BASE_ZONES = [
  { zone: 'Electronic City', base: 78 },
  { zone: 'Whitefield',      base: 71 },
  { zone: 'Koramangala',     base: 65 },
  { zone: 'Hebbal',          base: 58 },
  { zone: 'Indiranagar',     base: 52 },
  { zone: 'Jayanagar',       base: 38 },
];

// ─── Shared pieces ────────────────────────────────────────────────────────────

function Hairline({ className = '' }: { className?: string }) {
  return <div className={className} style={{ height: '1px', background: O.line }} />;
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-8">
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', textTransform: 'uppercase', color: O.text20, marginBottom: '0.75rem' }}>
        {label}
      </p>
      <h2 style={{ fontFamily: 'var(--font-playfair)', fontWeight: 700, fontSize: 'clamp(1.3rem,2.2vw,1.75rem)', color: O.text, lineHeight: 1.2 }}>
        {title}
      </h2>
    </div>
  );
}

function StressBar({ value }: { value: number }) {
  const color = value > 70 ? O.red : value > 50 ? O.amber : O.green;
  return (
    <div style={{ height: 3, background: O.line, borderRadius: 2, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.7s ease' }} />
    </div>
  );
}

function ImpactDelta({ value, positiveIsGood }: { value: number; positiveIsGood: boolean }) {
  if (value === 0) return (
    <span style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', color: O.text20 }}>—</span>
  );
  const isGood  = positiveIsGood ? value > 0 : value < 0;
  const color   = isGood ? O.green : O.red;
  const Icon    = value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="flex items-center gap-1" style={{ color }}>
      <Icon size={11} />
      <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value > 0 ? '+' : ''}{value}%
      </span>
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CitySimulation() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intensity,  setIntensity]  = useState(75);
  const [duration,   setDuration]   = useState(24);
  const [isRunning,  setIsRunning]  = useState(false);
  const [hasRun,     setHasRun]     = useState(false);

  const selected = SCENARIOS.find(s => s.id === selectedId) ?? null;

  const scaledImpacts: Impacts | null = selected
    ? Object.fromEntries(
        Object.entries(selected.impacts).map(([k, v]) => [k, Math.round((v as number) * (intensity / 100))])
      ) as Impacts
    : null;

  const handleRun = useCallback(() => {
    if (!selected || isRunning) return;
    setIsRunning(true);
    setTimeout(() => { setIsRunning(false); setHasRun(true); }, 1800);
  }, [selected, isRunning]);

  const handleReset = useCallback(() => {
    setSelectedId(null); setHasRun(false); setIsRunning(false);
    setIntensity(75); setDuration(24);
  }, []);

  const stressedZones = BASE_ZONES.map(z => {
    const delta = hasRun && scaledImpacts
      ? Math.abs(scaledImpacts.traffic) * 0.25 + Math.abs(scaledImpacts.energy) * 0.18
      : 0;
    // deterministic spread per zone using base as seed
    const spread = ((z.base * 7) % 10) * 0.1;
    return { ...z, stressed: Math.min(99, Math.round(z.base + delta * (0.75 + spread))) };
  });

  const statusLabel = isRunning ? 'Simulating…'
    : hasRun       ? 'Results Ready'
    : selected     ? 'Ready'
    : 'Idle';

  return (
    <div style={{ minHeight: '100vh', background: O.bg, fontFamily: 'var(--font-inter)' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-10 py-4"
        style={{ background: 'rgba(9,9,11,0.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${O.line}` }}>
        <Link href="/"
          className="flex items-center gap-2 transition-colors duration-300 hover:text-white/70"
          style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text30 }}>
          ← Syncity
        </Link>
        <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', textTransform: 'uppercase', color: O.text30 }}>
          Simulation
        </span>
        <div className="flex items-center gap-2">
          <Activity size={11} style={{ color: selected ? O.amber : O.text20 }} />
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: selected ? O.amber : O.text20 }}>
            {statusLabel}
          </span>
        </div>
      </nav>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <header className="max-w-6xl mx-auto px-4 sm:px-10 pt-10 sm:pt-16 pb-8 sm:pb-10">
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', textTransform: 'uppercase', color: O.text20, marginBottom: '1rem' }}>
          City Simulation
        </p>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontWeight: 800, fontSize: 'clamp(2rem,4vw,3.5rem)', color: O.text, lineHeight: 1.1, marginBottom: '0.75rem' }}>
          Scenario Engine
        </h1>
        <p style={{ fontFamily: 'var(--font-inter)', fontWeight: 300, fontSize: '1rem', color: O.text30, maxWidth: '48ch', lineHeight: 1.7 }}>
          Model infrastructure changes and environmental events. Observe cascading effects across city systems in real time.
        </p>
        <Hairline className="mt-10" />
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-10 pb-16 sm:pb-20 space-y-12 sm:space-y-16">

        {/* ── 01 Scenario selector ────────────────────────────────────────── */}
        <section>
          <SectionHeader label="01 — Select" title="Choose a Scenario" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: O.line }}>
            {SCENARIOS.map(s => {
              const active = selectedId === s.id;
              return (
                <button key={s.id} onClick={() => { setSelectedId(s.id); setHasRun(false); }}
                  className="text-left p-5 sm:p-6 transition-colors duration-200 w-full"
                  style={{ background: active ? 'rgba(255,255,255,0.04)' : O.bg, cursor: 'pointer' }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span style={{ color: active ? s.accent : O.text30 }}>{s.icon}</span>
                    {active && <ChevronRight size={12} style={{ color: s.accent, marginTop: 2, flexShrink: 0 }} />}
                  </div>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: active ? O.text : O.text50, marginBottom: '6px' }}>
                    {s.label}
                  </p>
                  <p style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', color: O.text20, lineHeight: 1.55 }}>
                    {s.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 02 Parameters ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader label="02 — Configure" title="Parameters" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12">

            {/* Intensity */}
            <div style={{ borderTop: `1px solid ${O.lineStrong}`, paddingTop: '20px' }}>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: '9px', letterSpacing: '0.4em', textTransform: 'uppercase', color: O.text20 }}>Intensity</p>
                <p style={{ fontSize: '22px', fontWeight: 600, color: O.text, fontVariantNumeric: 'tabular-nums' }}>
                  {intensity}<span style={{ fontSize: '12px', fontWeight: 400, color: O.text30 }}>%</span>
                </p>
              </div>
              <input type="range" min={10} max={100} value={intensity}
                onChange={e => { setIntensity(+e.target.value); setHasRun(false); }}
                className="w-full" style={{ accentColor: selected ? selected.accent : O.text30 }} />
              <div className="flex justify-between mt-2">
                <span style={{ fontSize: '8px', color: O.text20 }}>Low</span>
                <span style={{ fontSize: '8px', color: O.text20 }}>High</span>
              </div>
            </div>

            {/* Duration */}
            <div style={{ borderTop: `1px solid ${O.lineStrong}`, paddingTop: '20px' }}>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: '9px', letterSpacing: '0.4em', textTransform: 'uppercase', color: O.text20 }}>Duration</p>
                <p style={{ fontSize: '22px', fontWeight: 600, color: O.text, fontVariantNumeric: 'tabular-nums' }}>
                  {duration < 24 ? `${duration}h` : `${Math.round(duration / 24)}d`}
                </p>
              </div>
              <input type="range" min={1} max={168} value={duration}
                onChange={e => { setDuration(+e.target.value); setHasRun(false); }}
                className="w-full" style={{ accentColor: selected ? selected.accent : O.text30 }} />
              <div className="flex justify-between mt-2">
                <span style={{ fontSize: '8px', color: O.text20 }}>1h</span>
                <span style={{ fontSize: '8px', color: O.text20 }}>7d</span>
              </div>
            </div>
          </div>

          {/* Run controls */}
          <div className="mt-8 flex items-center gap-5 flex-wrap">
            <button onClick={handleRun} disabled={!selected || isRunning}
              className="flex items-center gap-3 transition-all duration-200"
              style={{
                fontFamily: 'var(--font-inter)', fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase',
                color:      selected && !isRunning ? O.text   : O.text30,
                border:     `1px solid ${selected && !isRunning ? O.lineStrong : O.line}`,
                padding:    '12px 28px',
                background: selected && !isRunning ? 'rgba(255,255,255,0.04)' : 'transparent',
                cursor:     selected && !isRunning ? 'pointer' : 'not-allowed',
              }}>
              <Play size={12} />
              {isRunning ? 'Simulating…' : 'Run Simulation'}
            </button>
            {(selected || hasRun) && (
              <button onClick={handleReset}
                className="flex items-center gap-2 transition-colors duration-200 hover:text-white/60"
                style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text20, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <RotateCcw size={11} /> Reset
              </button>
            )}
          </div>
        </section>

        {/* ── 03 Impact analysis ──────────────────────────────────────────── */}
        <section>
          <SectionHeader label="03 — Results" title="Impact Analysis" />
          {!selected ? (
            <div style={{ borderTop: `1px solid ${O.line}`, paddingTop: '24px' }}>
              <p style={{ fontSize: '13px', color: O.text20 }}>
                Select a scenario above to preview projected city-wide impact across five dimensions.
              </p>
            </div>
          ) : (
            <>
              {/* 5-dimension grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-px" style={{ background: O.line }}>
                {DIMENSIONS.map((dim, i) => {
                  const raw    = selected.impacts[dim.key];
                  const scaled = scaledImpacts?.[dim.key] ?? raw;
                  const isLast = i === 4;
                  return (
                    <div key={dim.key}
                      className={isLast ? 'col-span-2 sm:col-span-1' : ''}
                      style={{ background: O.bg, padding: '18px 16px' }}>
                      <p style={{ fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text20, marginBottom: '10px' }}>
                        {dim.label}
                      </p>
                      <ImpactDelta value={hasRun ? scaled : raw} positiveIsGood={dim.positiveIsGood} />
                    </div>
                  );
                })}
              </div>

              {/* Cascade narrative */}
              {hasRun && (
                <div style={{ borderTop: `1px solid ${O.line}`, paddingTop: '16px', marginTop: '2px' }}>
                  <p style={{ fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text20, marginBottom: '8px' }}>
                    Cascade Effects
                  </p>
                  <p style={{ fontSize: '13px', color: O.text50, lineHeight: 1.7, maxWidth: '64ch' }}>
                    Simulation complete — {selected.label} at {intensity}% intensity over {duration < 24 ? `${duration} hours` : `${Math.round(duration / 24)} days`}.
                    {(scaledImpacts?.traffic ?? 0) > 20  && ' Congestion spikes detected across major arterial corridors.'}
                    {(scaledImpacts?.energy  ?? 0) > 30  && ' Grid load elevated — risk of brownout in high-density zones.'}
                    {(scaledImpacts?.aqi     ?? 0) > 15  && ' Air quality degradation projected in downwind districts.'}
                    {(scaledImpacts?.water   ?? 0) < -20 && ' Water supply pressure reduced across peripheral sectors.'}
                    {(scaledImpacts?.traffic ?? 0) < -15 && ' Traffic flow improvement reverberates across connected corridors.'}
                    {(scaledImpacts?.aqi     ?? 0) < -10 && ' Emissions reduction improves respiratory health index citywide.'}
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── 04 Infrastructure stress ────────────────────────────────────── */}
        <section>
          <SectionHeader label="04 — Infrastructure" title="Zone Stress Levels" />
          <div>
            {stressedZones.map(z => {
              const val = hasRun ? z.stressed : z.base;
              return (
                <div key={z.zone} className="flex items-center gap-4 py-4"
                  style={{ borderBottom: `1px solid ${O.line}` }}>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: O.text50, minWidth: 130, flexShrink: 0 }}>
                    {z.zone}
                  </span>
                  <div className="flex-1 min-w-0">
                    <StressBar value={val} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: '12px', fontWeight: 600, color: val > 70 ? O.red : val > 50 ? O.amber : O.green, fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>
                    {val}%
                  </span>
                </div>
              );
            })}
          </div>

          {!hasRun && (
            <p style={{ fontSize: '9px', letterSpacing: '0.2em', color: O.text20, marginTop: '16px' }}>
              Baseline stress levels shown. Run a simulation to see projected changes.
            </p>
          )}
        </section>

      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-10 py-8 flex items-center justify-between"
        style={{ borderTop: `1px solid ${O.line}` }}>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.4em', textTransform: 'uppercase', color: O.text20 }}>
          SYNCITY
        </p>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: O.text20, letterSpacing: '0.15em' }}>
          Bengaluru · 12.97°N 77.59°E
        </p>
      </footer>

    </div>
  );
}
