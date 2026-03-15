// File: components/map/LayersControl.tsx
'use client';

/**
 * LayersControl — floating left panel.
 *  ─ Data layer toggles
 *  ─ Map style switcher (Dark / Satellite / Navigation)
 *  ─ Directions form (origin + destination → draw route)
 */

import { useState } from 'react';
import type { LayerId, LayerState, MapStyle, DirectionsRequest } from '@/types/map';

// ── Layer config ──────────────────────────────────────────────────────────────
interface LayerConfig {
  id: LayerId; label: string; description: string; icon: string; color: string;
}

const LAYERS: LayerConfig[] = [
  { id: 'temperature', label: 'Temperature',    description: 'Urban heat map',       icon: '🌡', color: '#FF7722' },
  { id: 'pollution',   label: 'Air Quality',    description: 'PM₂.₅ · AQI index',   icon: '🌬', color: '#AA44FF' },
  { id: 'sensors',     label: 'Smart Sensors',  description: 'IoT device network',   icon: '📡', color: '#00EEFF' },
  { id: 'traffic',     label: 'Traffic Flow',   description: 'Real-time density',    icon: '🚦', color: '#00FF88' },
  { id: 'weather',     label: 'Weather Radar',  description: 'Live RainViewer data', icon: '🌦', color: '#4488FF' },
];

// ── Style config ──────────────────────────────────────────────────────────────
const STYLES: { id: MapStyle; label: string; icon: string }[] = [
  { id: 'dark',        label: 'Dark',       icon: '🌑' },
  { id: 'satellite',   label: 'Satellite',  icon: '🛰' },
  { id: 'navigation',  label: 'Nav Night',  icon: '🚗' },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface LayersControlProps {
  activeLayers:    LayerState;
  onToggle:        (id: LayerId) => void;
  activeStyle:     MapStyle;
  onStyleChange:   (s: MapStyle) => void;
  onDirections:    (r: DirectionsRequest) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LayersControl({
  activeLayers, onToggle,
  activeStyle, onStyleChange,
  onDirections,
}: LayersControlProps) {
  const [layersOpen,     setLayersOpen]     = useState(true);
  const [styleOpen,      setStyleOpen]      = useState(true);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [fromAddr,       setFromAddr]       = useState('');
  const [toAddr,         setToAddr]         = useState('');
  const [routeLoading,   setRouteLoading]   = useState(false);

  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  // ── Geocode an address and return [lng, lat] ──────────────────────────────
  const geocodeAddr = async (addr: string): Promise<[number, number] | null> => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
    if (!token) return null;
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json` +
      `?access_token=${token}&country=IN&proximity=77.5946,12.9716&limit=1`;
    const res  = await fetch(url);
    const data = await res.json();
    return data.features?.[0]?.center ?? null;
  };

  const handleRoute = async () => {
    if (!fromAddr.trim() || !toAddr.trim()) return;
    setRouteLoading(true);
    try {
      const [origin, dest] = await Promise.all([geocodeAddr(fromAddr), geocodeAddr(toAddr)]);
      if (origin && dest) onDirections({ origin, destination: dest });
    } finally {
      setRouteLoading(false);
    }
  };

  // ── Shared section header ─────────────────────────────────────────────────
  const SectionHeader = ({ label, open, onToggle: tog }: { label: string; open: boolean; onToggle: () => void }) => (
    <button
      onClick={tog}
      className="w-full flex items-center justify-between px-4 py-2.5
                 hover:bg-white/[0.03] transition-colors"
      style={{ borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
    >
      <span className="font-mono text-[9px] text-white/40 tracking-[0.22em] uppercase">{label}</span>
      <span className="text-white/22 text-[10px]"
        style={{ transform: open ? 'none' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 0.2s' }}>
        ▾
      </span>
    </button>
  );

  return (
    <div
      className="rounded-xl overflow-hidden select-none flex flex-col"
      style={{
        background:    'rgba(9,9,11,0.90)',
        backdropFilter:'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border:        '1px solid rgba(0,238,255,0.12)',
        boxShadow:     '0 0 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        width:         '200px',
      }}
    >
      {/* ── Panel header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(0,238,255,0.08)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00EEFF] animate-pulse" style={{ boxShadow: '0 0 5px #00EEFF' }} />
          <span className="font-mono text-[10px] text-white/55 tracking-[0.22em] uppercase">Controls</span>
        </div>
        {activeCount > 0 && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(0,238,255,0.12)', color: '#00EEFF' }}>
            {activeCount}
          </span>
        )}
      </div>

      {/* ── Map style ────────────────────────────────────────────────── */}
      <SectionHeader label="Map Style" open={styleOpen} onToggle={() => setStyleOpen(o => !o)} />
      {styleOpen && (
        <div className="px-3 py-2 flex gap-1.5">
          {STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => onStyleChange(s.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all duration-200"
              style={{
                background: activeStyle === s.id ? 'rgba(0,238,255,0.12)' : 'rgba(255,255,255,0.04)',
                border:     `1px solid ${activeStyle === s.id ? 'rgba(0,238,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <span className="text-base leading-none">{s.icon}</span>
              <span className="font-mono text-[8px] leading-none"
                style={{ color: activeStyle === s.id ? '#00EEFF' : 'rgba(255,255,255,0.35)' }}>
                {s.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Data layers ──────────────────────────────────────────────── */}
      <SectionHeader
        label={`Layers${activeCount > 0 ? ` (${activeCount})` : ''}`}
        open={layersOpen}
        onToggle={() => setLayersOpen(o => !o)}
      />
      {layersOpen && (
        <div className="p-2 flex flex-col gap-1">
          {LAYERS.map(layer => {
            const active = activeLayers[layer.id];
            return (
              <button
                key={layer.id}
                onClick={() => onToggle(layer.id)}
                className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                           text-left transition-all duration-200"
                style={{
                  background: active ? `${layer.color}12` : 'transparent',
                  border:     `1px solid ${active ? `${layer.color}35` : 'rgba(255,255,255,0.04)'}`,
                }}
              >
                {/* Toggle pill */}
                <div className="relative flex-shrink-0 rounded-full transition-all duration-300"
                  style={{ width: '28px', height: '15px', background: active ? layer.color : 'rgba(255,255,255,0.10)', boxShadow: active ? `0 0 8px ${layer.color}50` : 'none' }}>
                  <div className="absolute top-[2px] w-[11px] h-[11px] rounded-full bg-white transition-all duration-300"
                    style={{ left: active ? '15px' : '2px', opacity: active ? 1 : 0.6 }} />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px]">{layer.icon}</span>
                    <span className="font-mono text-[11px] font-medium transition-colors"
                      style={{ color: active ? layer.color : 'rgba(255,255,255,0.45)' }}>
                      {layer.label}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-white/22 mt-0.5 truncate">{layer.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Directions ───────────────────────────────────────────────── */}
      <SectionHeader label="Directions" open={directionsOpen} onToggle={() => setDirectionsOpen(o => !o)} />
      {directionsOpen && (
        <div className="px-3 pb-3 pt-2 flex flex-col gap-2">
          {/* Origin */}
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00FF88] flex-shrink-0" style={{ boxShadow: '0 0 6px #00FF88' }} />
            <input
              value={fromAddr}
              onChange={e => setFromAddr(e.target.value)}
              placeholder="Origin…"
              className="flex-1 bg-transparent outline-none px-2 py-1.5 rounded-md min-w-0"
              style={{
                fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
              }}
            />
          </div>
          {/* Destination */}
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF7722] flex-shrink-0" style={{ boxShadow: '0 0 6px #FF7722' }} />
            <input
              value={toAddr}
              onChange={e => setToAddr(e.target.value)}
              placeholder="Destination…"
              className="flex-1 bg-transparent outline-none px-2 py-1.5 rounded-md min-w-0"
              style={{
                fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)',
              }}
            />
          </div>
          {/* Go button */}
          <button
            onClick={handleRoute}
            disabled={routeLoading || !fromAddr || !toAddr}
            className="w-full py-2 rounded-lg font-mono text-[10px] tracking-wider
                       transition-all duration-200 flex items-center justify-center gap-2"
            style={{
              background: (routeLoading || !fromAddr || !toAddr) ? 'rgba(0,238,255,0.08)' : 'rgba(0,238,255,0.15)',
              border:     '1px solid rgba(0,238,255,0.25)',
              color:      (routeLoading || !fromAddr || !toAddr) ? 'rgba(0,238,255,0.4)' : '#00EEFF',
            }}
          >
            {routeLoading
              ? <><div className="w-3 h-3 border border-[#00EEFF]/60 border-t-transparent rounded-full animate-spin" /> Routing…</>
              : '▶ Get Route'
            }
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 flex items-center gap-1.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="w-1 h-1 rounded-full bg-white/15" />
        <span className="font-mono text-[9px] text-white/18">Bangalore · 18 nodes</span>
      </div>
    </div>
  );
}
