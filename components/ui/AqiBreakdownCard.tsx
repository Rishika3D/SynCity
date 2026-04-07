// File: components/ui/AqiBreakdownCard.tsx
'use client';

/**
 * AqiBreakdownCard — shows when the Air Quality layer is active.
 * Fetches /api/waqi (real CPCB ground-station data via WAQI).
 * Displays individual AQI sub-indices per pollutant from Silk Board station,
 * coloured by US EPA AQI category.
 */

import { useEffect, useState } from 'react';

interface WaqiDetail {
  stationName: string;
  dominentpol: string;
  timestamp:   string;
  aqi:  number;
  pm25: number;
  pm10: number;
  no2:  number;
  o3:   number;
  so2:  number;
  co:   number;
}

// US EPA AQI breakpoints for bar rendering
const AQI_MAX = 200; // bars saturate at "Unhealthy" level

const POLLUTANTS: { key: keyof WaqiDetail; label: string; color: string }[] = [
  { key: 'pm25', label: 'PM₂.₅', color: '#AA44FF' },
  { key: 'pm10', label: 'PM₁₀',  color: '#4488FF' },
  { key: 'no2',  label: 'NO₂',   color: '#FF7722' },
  { key: 'o3',   label: 'O₃',    color: '#00FF88' },
  { key: 'so2',  label: 'SO₂',   color: '#FFCC00' },
];

function aqiCategory(val: number): { label: string; color: string } {
  if (val <= 50)  return { label: 'Good',            color: '#00FF88' };
  if (val <= 100) return { label: 'Moderate',         color: '#FFEE00' };
  if (val <= 150) return { label: 'Sensitive',        color: '#FF7722' };
  if (val <= 200) return { label: 'Unhealthy',        color: '#FF3333' };
  if (val <= 300) return { label: 'Very Unhealthy',   color: '#AA44FF' };
  return           { label: 'Hazardous',              color: '#880000' };
}

export default function AqiBreakdownCard() {
  const [detail,  setDetail]  = useState<WaqiDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/waqi')
      .then(r => r.json())
      .then(j => { if (j.detail) setDetail(j.detail); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const overall = detail ? aqiCategory(detail.aqi) : null;

  return (
    <div
      className="rounded-xl overflow-hidden flex-shrink-0"
      style={{
        background:           'rgba(9,9,11,0.88)',
        backdropFilter:       'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border:               '1px solid rgba(170,68,255,0.22)',
        boxShadow:            '0 0 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(170,68,255,0.10)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#AA44FF', boxShadow: '0 0 5px #AA44FF' }}
          />
          <span className="font-mono text-[10px] text-white/55 tracking-[0.22em] uppercase">
            Air Composition
          </span>
        </div>
        <span className="font-mono text-[9px] text-white/22 tracking-wider">
          CPCB · live
        </span>
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center gap-2 py-1">
            <div
              className="w-3 h-3 rounded-full border border-t-transparent animate-spin"
              style={{ borderColor: 'rgba(170,68,255,0.4)', borderTopColor: 'transparent' }}
            />
            <span className="font-mono text-[10px] text-white/30">Loading…</span>
          </div>
        )}

        {detail && (
          <>
            {/* Overall AQI badge */}
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg"
              style={{ background: `${overall!.color}10`, border: `1px solid ${overall!.color}30` }}
            >
              <div>
                <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Overall AQI</p>
                <p className="font-mono text-[22px] font-medium leading-none mt-0.5"
                  style={{ color: overall!.color }}>
                  {detail.aqi}
                </p>
              </div>
              <div className="text-right">
                <span
                  className="font-mono text-[10px] px-2 py-1 rounded"
                  style={{ color: overall!.color, background: `${overall!.color}18`, border: `1px solid ${overall!.color}35` }}
                >
                  {overall!.label}
                </span>
                <p className="font-mono text-[8px] text-white/25 mt-1.5">
                  dom. {detail.dominentpol.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Per-pollutant rows */}
            {POLLUTANTS.map(p => {
              const val = detail[p.key] as number;
              if (!val) return null;
              const cat = aqiCategory(val);
              const barPct = Math.min(100, (val / AQI_MAX) * 100);

              return (
                <div key={p.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] font-medium" style={{ color: p.color }}>
                      {p.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px] font-medium text-white/80">{val}</span>
                      <span
                        className="font-mono text-[8px] px-1.5 py-px rounded"
                        style={{ color: cat.color, background: `${cat.color}14`, border: `1px solid ${cat.color}30` }}
                      >
                        {cat.label}
                      </span>
                    </div>
                  </div>
                  <div
                    className="w-full rounded-full overflow-hidden"
                    style={{ height: '3px', background: 'rgba(255,255,255,0.06)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width:      `${barPct}%`,
                        background: cat.color,
                        boxShadow:  `0 0 6px ${cat.color}66`,
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Station info */}
            <div
              className="flex items-center justify-between pt-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              <p className="font-mono text-[8px] text-white/20 truncate">{detail.stationName}</p>
              <p className="font-mono text-[8px] text-white/15 flex-shrink-0 ml-2">
                {detail.timestamp?.slice(11, 16) || ''} IST
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
