// File: components/map/LayersControl.tsx
'use client';

/**
 * LayersControl — floating left panel.
 * Renders a list of toggleable data layers with neon-accent switches.
 */

import { useState } from 'react';
import type { LayerId, LayerState } from '@/types/map';

// ── Layer metadata ────────────────────────────────────────────────────────────

interface LayerConfig {
  id:          LayerId;
  label:       string;
  description: string;
  icon:        string;
  color:       string;
}

const LAYERS: LayerConfig[] = [
  {
    id:          'temperature',
    label:       'Temperature',
    description: 'Urban heat distribution',
    icon:        '🌡',
    color:       '#FF7722',
  },
  {
    id:          'pollution',
    label:       'Air Quality',
    description: 'PM₂.₅ · AQI index',
    icon:        '🌬',
    color:       '#AA44FF',
  },
  {
    id:          'sensors',
    label:       'Smart Sensors',
    description: 'IoT device network',
    icon:        '📡',
    color:       '#00EEFF',
  },
  {
    id:          'traffic',
    label:       'Traffic Flow',
    description: 'Real-time density',
    icon:        '🚦',
    color:       '#00FF88',
  },
];

// ── Panel ─────────────────────────────────────────────────────────────────────

interface LayersControlProps {
  activeLayers: LayerState;
  onToggle:     (id: LayerId) => void;
}

export default function LayersControl({ activeLayers, onToggle }: LayersControlProps) {
  const [open, setOpen] = useState(true);

  const activeCount = Object.values(activeLayers).filter(Boolean).length;

  return (
    <div
      className="rounded-xl overflow-hidden select-none"
      style={{
        background:    'rgba(9,9,11,0.88)',
        backdropFilter:'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border:        '1px solid rgba(0,238,255,0.12)',
        boxShadow:     '0 0 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
        width:         '196px',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3
                   hover:bg-white/[0.03] transition-colors duration-150"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#00EEFF] animate-pulse"
            style={{ boxShadow: '0 0 5px #00EEFF' }}
          />
          <span className="font-mono text-[10px] text-white/55 tracking-[0.22em] uppercase">
            Layers
          </span>
          {activeCount > 0 && (
            <span
              className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(0,238,255,0.12)', color: '#00EEFF' }}
            >
              {activeCount}
            </span>
          )}
        </div>
        <span className="text-white/25 text-[10px] transition-transform duration-200"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          ▾
        </span>
      </button>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(0,238,255,0.07)' }} />

      {/* Layer rows */}
      {open && (
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
                <div
                  className="relative flex-shrink-0 rounded-full transition-all duration-300"
                  style={{
                    width:     '30px',
                    height:    '16px',
                    background: active ? layer.color : 'rgba(255,255,255,0.10)',
                    boxShadow:  active ? `0 0 10px ${layer.color}55` : 'none',
                  }}
                >
                  <div
                    className="absolute top-[2px] w-3 h-3 rounded-full bg-white
                               transition-all duration-300"
                    style={{
                      left:    active ? '15px' : '2px',
                      opacity: active ? 1 : 0.65,
                      boxShadow: active ? `0 1px 4px ${layer.color}80` : 'none',
                    }}
                  />
                </div>

                {/* Icon + label */}
                <div className="flex flex-col items-start min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] leading-none">{layer.icon}</span>
                    <span
                      className="font-mono text-[11px] font-medium leading-none
                                 transition-colors duration-200"
                      style={{ color: active ? layer.color : 'rgba(255,255,255,0.45)' }}
                    >
                      {layer.label}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-white/22 leading-none mt-1 truncate w-full">
                    {layer.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {open && (
        <div
          className="px-4 py-2 flex items-center gap-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <span className="w-1 h-1 rounded-full bg-white/15" />
          <span className="font-mono text-[9px] text-white/18 tracking-wider">
            Bangalore · 14 districts
          </span>
        </div>
      )}
    </div>
  );
}
