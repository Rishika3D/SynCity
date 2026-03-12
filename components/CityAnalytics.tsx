'use client';

/**
 * components/CityAnalytics.tsx
 *
 * SynCity — City Analytics · Obsidian Apple Design
 *
 * Background: #09090b obsidian
 * Cards:      no backgrounds — floating numbers on dark
 * Type:       Playfair Display (headings) · Inter (data)
 * Palette:    white/rgba only — no gold, no parchment
 */

import { useEffect, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Car, Wind, Zap, Droplets, Thermometer,
  TrendingUp, TrendingDown, Minus,
  AlertTriangle, AlertOctagon, Info,
  RefreshCw, Activity,
} from 'lucide-react';
import {
  fetchAllCityData,
  getFallbackCityData,
  type LiveCityData,
} from '@/services/cityData';
import Link from 'next/link';

// ─── Obsidian palette ─────────────────────────────────────────────────────────

const O = {
  bg:        '#09090b',
  line:      'rgba(255,255,255,0.07)',
  lineStrong:'rgba(255,255,255,0.12)',
  text:      '#f5f5f7',
  text50:    'rgba(245,245,247,0.5)',
  text30:    'rgba(245,245,247,0.3)',
  text20:    'rgba(245,245,247,0.2)',
  text10:    'rgba(245,245,247,0.1)',
  green:     'rgba(52,199,89,0.85)',
  amber:     'rgba(255,159,10,0.85)',
  red:       'rgba(255,69,58,0.85)',
  blue:      'rgba(10,132,255,0.85)',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForecastPoint { hour: string; actual: number | null; predicted: number | null; }
type Trend = 'up' | 'down' | 'flat';
interface MetricDef {
  id: string; label: string; value: string; unit: string;
  trend: Trend; trendPct: number; subtext: string; icon: React.ReactNode;
}
type Risk = 'Low' | 'Moderate' | 'High';
interface DistrictRow { name: string; aqi: number; traffic: number; energy: number; risk: Risk; }
type AlertSeverity = 'info' | 'warning' | 'critical';
interface AlertItem { id: string; message: string; severity: AlertSeverity; time: string; }

// ─── Static data ──────────────────────────────────────────────────────────────

const DISTRICTS: DistrictRow[] = [
  { name: 'Koramangala',     aqi: 87,  traffic: 72, energy: 1840, risk: 'Moderate' },
  { name: 'Indiranagar',     aqi: 104, traffic: 68, energy: 1620, risk: 'Moderate' },
  { name: 'Whitefield',      aqi: 128, traffic: 81, energy: 2110, risk: 'High'     },
  { name: 'Electronic City', aqi: 141, traffic: 55, energy: 2350, risk: 'High'     },
  { name: 'Jayanagar',       aqi: 63,  traffic: 42, energy: 1310, risk: 'Low'      },
  { name: 'Hebbal',          aqi: 92,  traffic: 76, energy: 1780, risk: 'Moderate' },
];

const ALERTS: AlertItem[] = [
  { id: '1', severity: 'warning',  time: '2 min ago',  message: 'Traffic congestion predicted in MG Road at 18:30' },
  { id: '2', severity: 'critical', time: '8 min ago',  message: 'AQI expected to exceed 150 in Electronic City' },
  { id: '3', severity: 'warning',  time: '14 min ago', message: 'Water pressure anomaly detected in Whitefield sector 4' },
  { id: '4', severity: 'info',     time: '21 min ago', message: 'Renewable energy share above target — 38% grid mix' },
  { id: '5', severity: 'info',     time: '33 min ago', message: 'Peak traffic window ending in Silk Board junction' },
  { id: '6', severity: 'warning',  time: '47 min ago', message: 'Grid load approaching 90% threshold — Koramangala zone' },
];

// ─── Forecast builder ─────────────────────────────────────────────────────────

function buildForecast(base: number, amp: number, phase: number, noise: number): ForecastPoint[] {
  const nowH = new Date().getHours();
  return Array.from({ length: 25 }, (_, i) => {
    const offset = i - 12;
    const h = ((nowH + offset) % 24 + 24) % 24;
    const label = `${String(h).padStart(2, '0')}:00`;
    const val  = Math.max(0, Math.round(base + amp * Math.sin((h + phase) * 0.45) + noise * Math.sin(h * 1.7)));
    const pred = Math.max(0, Math.round(val + noise * 0.35 * Math.sin(h * 2.3)));
    return { hour: label, actual: offset <= 0 ? val : null, predicted: offset >= 0 ? pred : null };
  });
}

// ─── Shared divider ───────────────────────────────────────────────────────────

function Hairline({ className = '' }: { className?: string }) {
  return <div className={className} style={{ height: '1px', background: O.line }} />;
}

// ─── Section header ───────────────────────────────────────────────────────────

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

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function DarkTooltip({
  active, payload, label, unit,
}: { active?: boolean; payload?: Array<{ name: string; value: number | null; stroke: string }>; label?: string; unit: string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div style={{ background: '#18181f', border: `1px solid ${O.lineStrong}`, padding: '10px 14px', minWidth: 130, backdropFilter: 'blur(12px)' }}>
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text30, marginBottom: '8px' }}>{label}</p>
      {rows.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span style={{ display: 'inline-block', width: 14, height: 1.5, background: p.stroke, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', fontWeight: 500, color: O.text, fontVariantNumeric: 'tabular-nums' }}>
            {p.value?.toLocaleString('en-IN')}{unit}
          </span>
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: O.text30 }}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ m }: { m: MetricDef }) {
  const TrendIcon = m.trend === 'up' ? TrendingUp : m.trend === 'down' ? TrendingDown : Minus;
  const trendColor = m.trend === 'up' ? O.red : m.trend === 'down' ? O.green : O.text30;

  return (
    <div style={{ borderTop: `1px solid ${O.lineStrong}`, paddingTop: '20px', paddingBottom: '20px' }}>
      {/* Label + icon */}
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: O.text20 }} className="[&>svg]:w-3 [&>svg]:h-3">{m.icon}</span>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.35em', textTransform: 'uppercase', color: O.text20 }}>
          {m.label}
        </p>
      </div>

      {/* Value */}
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '2.25rem', fontWeight: 600, lineHeight: 1, color: O.text, fontVariantNumeric: 'tabular-nums', marginBottom: '6px' }}>
        {m.value}
        <span style={{ fontSize: '1rem', fontWeight: 400, color: O.text30, marginLeft: '4px' }}>{m.unit}</span>
      </p>

      {/* Trend */}
      <div className="flex items-center gap-1.5">
        <TrendIcon size={10} style={{ color: trendColor }} />
        {m.trendPct !== 0 && (
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: trendColor, fontVariantNumeric: 'tabular-nums' }}>
            {m.trendPct > 0 ? '+' : ''}{m.trendPct}%
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: O.text20 }}>
          {m.subtext}
        </span>
      </div>
    </div>
  );
}

// ─── Forecast panel ───────────────────────────────────────────────────────────

function ForecastPanel({ title, label, data, unit, lineColor }: {
  title: string; label: string; data: ForecastPoint[]; unit: string; lineColor: string;
}) {
  const makeTooltip = useCallback(
    (props: unknown) => <DarkTooltip {...(props as object)} unit={unit} />,
    [unit],
  );
  return (
    <div style={{ borderTop: `1px solid ${O.lineStrong}`, paddingTop: '20px' }}>
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', letterSpacing: '0.4em', textTransform: 'uppercase', color: O.text20, marginBottom: '4px' }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-playfair)', fontWeight: 600, fontSize: '1rem', color: O.text, marginBottom: '16px' }}>{title}</p>

      <div className="flex items-center gap-5 mb-4">
        <span className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: O.text30 }}>
          <span style={{ display: 'inline-block', width: 16, height: 1.5, background: lineColor }} /> Historical
        </span>
        <span className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', color: O.text30 }}>
          <span style={{ display: 'inline-block', width: 16, borderTop: `1.5px dashed ${O.text20}` }} /> Predicted
        </span>
      </div>

      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
            <CartesianGrid stroke={O.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="hour"
              tick={{ fill: O.text20, fontSize: 9, fontFamily: 'var(--font-inter)' }}
              tickLine={false} axisLine={false} interval={4} />
            <YAxis
              tick={{ fill: O.text20, fontSize: 9, fontFamily: 'var(--font-inter)' }}
              tickLine={false} axisLine={false} width={32} />
            <Tooltip content={makeTooltip} cursor={{ stroke: O.lineStrong, strokeWidth: 1 }} />
            <Line dataKey="actual"    name="Actual"    stroke={lineColor}  strokeWidth={1.5}
              dot={false} activeDot={{ r: 3, fill: lineColor, stroke: O.bg, strokeWidth: 2 }}
              connectNulls={false} />
            <Line dataKey="predicted" name="Predicted" stroke={O.text20} strokeWidth={1.2}
              strokeDasharray="5 4" dot={false}
              activeDot={{ r: 3, fill: O.text30, stroke: O.bg, strokeWidth: 2 }}
              connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: Risk }) {
  const cfg = {
    Low:      { color: O.green, bg: 'rgba(52,199,89,0.08)',    border: 'rgba(52,199,89,0.2)'   },
    Moderate: { color: O.amber, bg: 'rgba(255,159,10,0.08)',   border: 'rgba(255,159,10,0.2)'  },
    High:     { color: O.red,   bg: 'rgba(255,69,58,0.08)',    border: 'rgba(255,69,58,0.2)'   },
  }[risk];
  return (
    <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', fontWeight: 500, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '2px 10px', display: 'inline-block' }}>
      {risk}
    </span>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({ a }: { a: AlertItem }) {
  const cfg = {
    info:     { Icon: Info,          color: O.blue,  border: 'rgba(10,132,255,0.3)'  },
    warning:  { Icon: AlertTriangle, color: O.amber, border: 'rgba(255,159,10,0.3)'  },
    critical: { Icon: AlertOctagon,  color: O.red,   border: 'rgba(255,69,58,0.3)'   },
  }[a.severity];

  return (
    <div className="flex gap-3.5 py-3.5" style={{ borderBottom: `1px solid ${O.line}` }}>
      <cfg.Icon size={12} style={{ color: cfg.color, marginTop: 3, flexShrink: 0 }} />
      <div className="min-w-0">
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', color: O.text50, lineHeight: 1.5 }}>
          {a.message}
        </p>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.15em', color: O.text20, marginTop: '3px' }}>
          {a.time}
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ h }: { h: number }) {
  return <div className="animate-pulse" style={{ height: h, background: 'rgba(255,255,255,0.04)', borderTop: `1px solid ${O.line}` }} />;
}

// ─── Air Quality detail panel ─────────────────────────────────────────────────

function AirQualityPanel({ weather }: { weather: import('@/services/cityData').LiveWeatherData }) {
  if (!weather.healthRecommendation && !weather.dominantPollutant) return null;

  const pollutants: { label: string; value: number | null; unit: string }[] = [
    { label: 'PM₂.₅', value: weather.pm25,   unit: 'µg/m³' },
    { label: 'PM₁₀',  value: weather.pm10,   unit: 'µg/m³' },
    { label: 'NO₂',   value: weather.no2,    unit: 'µg/m³' },
    { label: 'O₃',    value: weather.o3 ?? null, unit: 'µg/m³' },
  ];

  const dotColor = weather.aqiColor ?? O.amber;

  return (
    <div style={{ borderTop: `1px solid ${O.lineStrong}`, paddingTop: '20px', paddingBottom: '20px' }}>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-5">
        <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.35em', textTransform: 'uppercase', color: O.text20 }}>
          Google Air Quality API
        </p>
        {weather.dominantPollutant && (
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', letterSpacing: '0.2em', textTransform: 'uppercase', color: dotColor, border: `1px solid ${dotColor}`, padding: '2px 7px', opacity: 0.8 }}>
            {weather.dominantPollutant}
          </span>
        )}
      </div>

      {/* Health recommendation */}
      {weather.healthRecommendation && (
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '13px', fontWeight: 300, color: O.text50, lineHeight: 1.65, maxWidth: '68ch', marginBottom: '20px' }}>
          {weather.healthRecommendation}
        </p>
      )}

      {/* Pollutant mini-grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {pollutants.map(p => p.value !== null && (
          <div key={p.label} style={{ borderLeft: `1px solid ${O.line}`, paddingLeft: '12px' }}>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text20, marginBottom: '4px' }}>
              {p.label}
            </p>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '1.35rem', fontWeight: 600, color: O.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {typeof p.value === 'number' ? p.value.toFixed(1) : '—'}
            </p>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', color: O.text20, marginTop: '2px' }}>{p.unit}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CityAnalytics() {
  const [cityData,      setCityData]      = useState<LiveCityData | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [forecasts, setForecasts]         = useState<{ traffic: ForecastPoint[]; aqi: ForecastPoint[]; energy: ForecastPoint[] } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchAllCityData();
      setCityData(data); setUsingFallback(false);
    } catch {
      setCityData(getFallbackCityData()); setUsingFallback(true);
    } finally {
      setIsLoading(false); setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    loadData();
    setForecasts({
      traffic: buildForecast(48,   32,  -8, 6),
      aqi:     buildForecast(110,  50, -10, 8),
      energy:  buildForecast(2400, 900, -9, 60),
    });
    const id = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadData]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const metrics: MetricDef[] = cityData ? [
    { id: 'traffic', label: 'Traffic Index',     value: String(cityData.traffic.congestionLevel), unit: '/ 100',
      trend: cityData.traffic.trend === 'rising' ? 'up' : cityData.traffic.trend === 'falling' ? 'down' : 'flat',
      trendPct: cityData.traffic.trend === 'rising' ? 6 : -4, subtext: `${cityData.traffic.averageSpeedKph} km/h avg`, icon: <Car /> },
    { id: 'aqi',     label: 'Air Quality (AQI)', value: String(cityData.weather.uaqi ?? cityData.weather.aqi), unit: '',
      trend: (cityData.weather.uaqi ?? cityData.weather.aqi) > 120 ? 'up' : 'down',
      trendPct: (cityData.weather.uaqi ?? cityData.weather.aqi) > 120 ? 4 : -3,
      subtext: cityData.weather.dominantPollutant
        ? `${cityData.weather.aqiCategory} · ${cityData.weather.dominantPollutant.toUpperCase()}`
        : cityData.weather.aqiCategory,
      icon: <Wind /> },
    { id: 'energy',  label: 'Energy Load',        value: cityData.utility.powerConsumptionMW.toLocaleString('en-IN'), unit: 'MW',
      trend: cityData.utility.powerTrend === 'rising' ? 'up' : 'down', trendPct: 8,
      subtext: `${cityData.utility.gridLoadPct}% grid`, icon: <Zap /> },
    { id: 'water',   label: 'Water Capacity',     value: String(cityData.utility.waterReservoirPct), unit: '%',
      trend: 'flat', trendPct: 0, subtext: `${cityData.utility.waterSupplyMLD} MLD`, icon: <Droplets /> },
    { id: 'temp',    label: 'Temperature',         value: String(cityData.weather.temperatureC), unit: '°C',
      trend: 'flat', trendPct: 0, subtext: cityData.weather.condition, icon: <Thermometer /> },
  ] : [];

  const updatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: O.bg, fontFamily: 'var(--font-inter)' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-10 py-4"
        style={{ background: 'rgba(9,9,11,0.92)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${O.line}` }}>
        <Link href="/"
          className="flex items-center gap-2 transition-colors duration-300 hover:text-white/70"
          style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: O.text30 }}>
          ← Syncity
        </Link>

        <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', textTransform: 'uppercase', color: O.text30 }}>
          Analytics
        </span>

        <div className="flex items-center gap-2 sm:gap-3">
          {isLoading
            ? <RefreshCw size={11} style={{ color: O.text20 }} className="animate-spin" />
            : <Activity  size={11} style={{ color: O.green }} />
          }
          {usingFallback && (
            <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color: O.amber, border: `1px solid rgba(255,159,10,0.2)`, padding: '2px 8px' }}>
              Simulated
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', color: O.text20, fontVariantNumeric: 'tabular-nums' }}
            suppressHydrationWarning>
            {updatedLabel}
          </span>
        </div>
      </nav>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="max-w-6xl mx-auto px-4 sm:px-10 pt-10 sm:pt-16 pb-8 sm:pb-10">
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', textTransform: 'uppercase', color: O.text20, marginBottom: '1rem' }}>
          City Analytics
        </p>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontWeight: 800, fontSize: 'clamp(2rem,4vw,3.5rem)', color: O.text, lineHeight: 1.1, marginBottom: '0.75rem' }}>
          Urban Intelligence
        </h1>
        <p style={{ fontFamily: 'var(--font-inter)', fontWeight: 300, fontSize: '1rem', color: O.text30, maxWidth: '45ch', lineHeight: 1.7 }}>
          Real-time metrics and AI predictions for city systems.
        </p>
        <Hairline className="mt-10" />
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-10 pb-16 sm:pb-20 space-y-12 sm:space-y-16">

        {/* ── I. Metrics ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader label="01 — Live" title="City Metrics" />
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 sm:gap-x-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} h={110} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 sm:gap-x-6">
              {metrics.map((m, i) => (
                <div key={m.id} className={i === metrics.length - 1 && metrics.length % 2 !== 0 ? 'col-span-2 sm:col-span-1' : ''}>
                  <MetricCard m={m} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── I-b. Air Quality Detail ──────────────────────────────────── */}
        {cityData && (
          <section>
            <AirQualityPanel weather={cityData.weather} />
          </section>
        )}

        {/* ── II. Forecasts ────────────────────────────────────────────── */}
        <section>
          <SectionHeader label="02 — AI" title="12-Hour Predictions" />
          {!forecasts ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-8 sm:gap-x-8">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={220} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-8 sm:gap-x-8">
              <ForecastPanel title="Traffic"      label="Congestion Index"    data={forecasts.traffic} unit=""    lineColor="rgba(245,245,247,0.7)" />
              <ForecastPanel title="Air Quality"  label="AQI"                 data={forecasts.aqi}     unit=""    lineColor="rgba(10,132,255,0.7)" />
              <ForecastPanel title="Energy"       label="Demand (MW)"         data={forecasts.energy}  unit=" MW" lineColor="rgba(255,159,10,0.7)" />
            </div>
          )}
        </section>

        {/* ── III. Districts ───────────────────────────────────────────── */}
        <section>
          <SectionHeader label="03 — Districts" title="Zone Analytics" />
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full text-sm" style={{ minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${O.lineStrong}` }}>
                  {['District', 'AQI', 'Traffic', 'Energy (MW)', 'Risk'].map((col, i) => (
                    <th key={col}
                      className={`pb-3 text-[9px] tracking-[0.3em] uppercase font-normal ${i === 0 ? 'text-left' : 'text-right'}`}
                      style={{ fontFamily: 'var(--font-inter)', color: O.text20 }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DISTRICTS.map((d) => (
                  <tr key={d.name} style={{ borderBottom: `1px solid ${O.line}` }}
                    className="hover:bg-white/[0.02] transition-colors duration-150">
                    <td className="py-3.5" style={{ fontFamily: 'var(--font-inter)', color: O.text50 }}>{d.name}</td>
                    <td className="py-3.5 text-right tabular-nums font-medium"
                      style={{ fontFamily: 'var(--font-inter)', color: d.aqi > 120 ? O.red : d.aqi > 80 ? O.amber : O.green }}>
                      {d.aqi}
                    </td>
                    <td className="py-3.5 text-right tabular-nums" style={{ fontFamily: 'var(--font-inter)', color: O.text30 }}>{d.traffic}</td>
                    <td className="py-3.5 text-right tabular-nums" style={{ fontFamily: 'var(--font-inter)', color: O.text30 }}>{d.energy.toLocaleString('en-IN')}</td>
                    <td className="py-3.5 text-right"><RiskBadge risk={d.risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── IV. Alerts ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader label="04 — Alerts" title="System Notices" />
          <div>
            {ALERTS.map(a => <AlertRow key={a.id} a={a} />)}
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
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
