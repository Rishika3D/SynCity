// File: components/ui/CityStatsPanel.tsx
'use client';

/**
 * CityStatsPanel — right-side floating panel.
 * Displays live city metrics (simulated updates every ~3.5 s) and an alert feed.
 */

import { useEffect, useState } from 'react';
import type { CityMetric, AlertItem } from '@/types/map';

// ── Initial metric definitions ────────────────────────────────────────────────

const INITIAL_METRICS: CityMetric[] = [
  { label: 'Active Nodes',  value: 1247, unit: '',      trend: 'up',     color: '#00EEFF' },
  { label: 'Population',    value: '12.7M',             trend: 'stable', color: '#00FF88' },
  { label: 'Energy Load',   value: 82,   unit: '%',     trend: 'down',   color: '#FF7722' },
  { label: 'Water Flow',    value: 94,   unit: '%',     trend: 'stable', color: '#4488FF' },
  { label: 'Avg AQI',       value: 127,  unit: '',      trend: 'up',     color: '#AA44FF' },
  { label: 'Traffic Index', value: 78,   unit: '/100',  trend: 'up',     color: '#FF5533' },
];

const ALERTS: AlertItem[] = [
  { id: 1, type: 'critical', message: 'Silk Board: HIGH congestion',       time: '2m ago'  },
  { id: 2, type: 'warning',  message: 'MG Road AQI above safe limit',      time: '9m ago'  },
  { id: 3, type: 'info',     message: 'Electronic City: all nodes online', time: '15m ago' },
  { id: 4, type: 'warning',  message: 'Bellandur sensor offline',           time: '33m ago' },
  { id: 5, type: 'info',     message: 'Metro L3: 98.2 % on-time today',   time: '1h ago'  },
];

// ── Helper sub-components ─────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend?: string }) {
  if (trend === 'up')   return <span style={{ color: '#FF7722', fontSize: '9px' }}>▲</span>;
  if (trend === 'down') return <span style={{ color: '#00FF88', fontSize: '9px' }}>▼</span>;
  return <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '9px' }}>■</span>;
}

function AlertBullet({ type }: { type: AlertItem['type'] }) {
  const col = type === 'critical' ? '#FF3333' : type === 'warning' ? '#FF7722' : '#00EEFF';
  return (
    <div
      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[3px]"
      style={{ background: col, boxShadow: `0 0 5px ${col}` }}
    />
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function CityStatsPanel() {
  const [metrics, setMetrics] = useState<CityMetric[]>(INITIAL_METRICS);
  const [open,    setOpen]    = useState(true);

  // Simulate live numeric fluctuations
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics(prev =>
        prev.map(m => {
          if (typeof m.value !== 'number') return m;
          const delta = (Math.random() - 0.5) * 5;
          const next  = Math.max(0, Math.round((m.value as number) + delta));
          return {
            ...m,
            value: next,
            trend: delta >  0.8 ? 'up' : delta < -0.8 ? 'down' : 'stable',
          };
        }),
      );
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col flex-1 min-h-0"
      style={{
        background:    'rgba(9,9,11,0.88)',
        backdropFilter:'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border:        '1px solid rgba(0,238,255,0.12)',
        boxShadow:     '0 0 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-3 flex-shrink-0
                   hover:bg-white/[0.03] transition-colors duration-150"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#00EEFF] animate-pulse"
            style={{ boxShadow: '0 0 5px #00EEFF' }}
          />
          <span className="font-mono text-[10px] text-white/55 tracking-[0.22em] uppercase">
            City Status
          </span>
        </div>
        <span className="text-white/25 text-[10px]"
          style={{ transform: open ? 'none' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      {open && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">

          {/* Metrics grid */}
          <div className="p-3 grid grid-cols-2 gap-2 flex-shrink-0">
            {metrics.map((m, i) => (
              <div
                key={i}
                className="rounded-lg p-2.5"
                style={{
                  background: `${m.color}08`,
                  border:     `1px solid ${m.color}20`,
                }}
              >
                <p className="font-mono text-[9px] text-white/28 uppercase tracking-wider mb-1 truncate">
                  {m.label}
                </p>
                <div className="flex items-baseline justify-between gap-1">
                  <span
                    className="font-mono text-[15px] font-medium leading-none"
                    style={{ color: m.color }}
                  >
                    {m.value}
                    {m.unit && (
                      <span className="text-[9px] opacity-55 ml-0.5">{m.unit}</span>
                    )}
                  </span>
                  <TrendArrow trend={m.trend} />
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-3" style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

          {/* Alert feed */}
          <div className="p-3 flex flex-col gap-0.5">
            <p className="font-mono text-[9px] text-white/22 tracking-[0.2em] uppercase mb-1.5 px-1">
              System Alerts
            </p>
            {ALERTS.map(alert => (
              <div
                key={alert.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md
                           hover:bg-white/[0.03] transition-colors duration-100"
              >
                <AlertBullet type={alert.type} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-white/52 leading-tight">
                    {alert.message}
                  </p>
                  <p className="font-mono text-[9px] text-white/20 mt-0.5">
                    {alert.time}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}
