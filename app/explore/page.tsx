// File: app/explore/page.tsx
'use client';

/**
 * SynCity — Explore City Page
 * Fullscreen 3D digital-twin map for Bangalore, India.
 *
 * Stack:  MapLibre GL JS · Open-Meteo · TypeScript · Tailwind CSS
 * Layout:
 *   z:0  ── Fullscreen MapLibre 3D map
 *   z:20 ── Floating header, layer panel, stats/weather panel, status bar
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import LayersControl from '@/components/map/LayersControl';
import CityStatsPanel from '@/components/ui/CityStatsPanel';
import WeatherCard from '@/components/ui/WeatherCard';
import AqiBreakdownCard from '@/components/ui/AqiBreakdownCard';
import type { LayerId, LayerState } from '@/types/map';

// ── Dynamic import — MapLibre GL JS is browser-only ──────────────────────────
const CityMap = dynamic(() => import('@/components/map/CityMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#09090b]">
      <div className="relative mb-6 w-16 h-16">
        <div className="absolute inset-0 rounded-full border border-[#00EEFF]/20 animate-ping" />
        <div className="w-16 h-16 rounded-full border-2 border-[#00EEFF]/60 border-t-transparent animate-spin" />
      </div>
      <p className="font-mono text-[#00EEFF]/70 text-[11px] tracking-[0.35em] uppercase">
        Initialising City Grid
      </p>
      <p className="font-mono text-white/20 text-[10px] tracking-widest mt-2">
        12.9716°N · 77.5946°E · Bangalore
      </p>
    </div>
  ),
});

// ── Initial layer visibility ──────────────────────────────────────────────────
const INITIAL_LAYERS: LayerState = {
  temperature: false,
  pollution:   false,
  sensors:     true,
  traffic:     true,
};

// ── Page component ────────────────────────────────────────────────────────────
export default function ExplorePage() {
  const [activeLayers, setActiveLayers] = useState<LayerState>(INITIAL_LAYERS);
  const [rightOpen,    setRightOpen]    = useState(true);

  const handleToggle = (id: LayerId) =>
    setActiveLayers(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#09090b]">

      {/* ── Fullscreen map ─────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <CityMap activeLayers={activeLayers} />
      </div>

      {/* ── Top gradient vignette + header ─────────────────────────── */}
      <header
        className="absolute top-0 inset-x-0 z-20 pointer-events-none
                   flex items-center justify-between px-6 pt-4 pb-16"
        style={{
          background: 'linear-gradient(to bottom, rgba(9,9,11,0.90) 0%, transparent 100%)',
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <div
            className="w-8 h-8 flex items-center justify-center rounded-sm flex-shrink-0"
            style={{ border: '1px solid rgba(0,238,255,0.30)' }}
          >
            <div
              className="w-3 h-3 rotate-45"
              style={{ border: '1.5px solid rgba(0,238,255,0.65)' }}
            />
          </div>
          <div>
            <h1 className="font-serif text-base tracking-[0.22em] text-white/90 uppercase leading-none">
              SynCity
            </h1>
            <p className="font-mono text-[9px] tracking-[0.28em] text-[#00EEFF]/45 uppercase mt-0.5">
              Urban Intelligence Platform
            </p>
          </div>
        </div>

        {/* Right meta */}
        <div className="flex items-center gap-5 pointer-events-auto">
          <span className="hidden sm:block font-mono text-[11px] text-white/25 tracking-wider">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
            })}
          </span>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full bg-[#00EEFF] animate-pulse"
              style={{ boxShadow: '0 0 7px #00EEFF' }}
            />
            <span className="font-mono text-[11px] text-[#00EEFF]/80 tracking-wider uppercase">
              Live
            </span>
          </div>
        </div>
      </header>

      {/* ── Left — Layer controls ───────────────────────────────────── */}
      <aside className="absolute left-4 top-1/2 -translate-y-1/2 z-20">
        <LayersControl activeLayers={activeLayers} onToggle={handleToggle} />
      </aside>

      {/* ── Dashboard mini-badge (top-right corner when panel collapsed) ─ */}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="absolute z-20 flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{
            top:                  '72px',
            right:                '4px',
            background:           'rgba(9,9,11,0.88)',
            backdropFilter:       'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border:               '1px solid rgba(0,238,255,0.12)',
            boxShadow:            '0 0 24px rgba(0,0,0,0.5)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: '#00EEFF', boxShadow: '0 0 4px #00EEFF' }}
          />
          <span className="font-mono text-[9px] text-white/50 tracking-[0.22em] uppercase">
            Dashboard
          </span>
          <span style={{ fontSize: '7px', color: 'rgba(0,238,255,0.40)' }}>◀</span>
        </button>
      )}

      {/* ── Right panel collapse tab ────────────────────────────────── */}
      <button
        onClick={() => setRightOpen(o => !o)}
        className="absolute z-20 flex items-center justify-center"
        style={{
          top:          '96px',
          right:        rightOpen ? '292px' : '0px',
          width:        '18px',
          height:       '52px',
          background:   'rgba(9,9,11,0.88)',
          backdropFilter: 'blur(24px)',
          border:       '1px solid rgba(0,238,255,0.12)',
          borderRadius: '6px 0 0 6px',
          transition:   'right 0.3s ease',
          cursor:       'pointer',
        }}
      >
        <span
          style={{
            fontSize:   '8px',
            color:      'rgba(0,238,255,0.45)',
            display:    'block',
            transition: 'transform 0.3s ease',
            transform:  rightOpen ? 'rotate(0deg)' : 'rotate(180deg)',
          }}
        >
          ▶
        </span>
      </button>

      {/* ── Right — Weather card + City stats ──────────────────────── */}
      <aside
        className="absolute z-20 flex flex-col gap-3"
        style={{
          top:        '72px',
          bottom:     '36px',
          right:      rightOpen ? '4px' : '-288px',
          width:      '272px',
          overflowY:  'auto',
          overflowX:  'hidden',
          transition: 'right 0.3s ease',
          scrollbarWidth: 'none',
        }}
      >
        <WeatherCard />
        <CityStatsPanel />
        {activeLayers.pollution && <AqiBreakdownCard />}
      </aside>

      {/* ── Bottom gradient + status bar ───────────────────────────── */}
      <footer
        className="absolute bottom-0 inset-x-0 z-20 pointer-events-none
                   flex items-center justify-between px-5 py-2.5"
        style={{
          background: 'linear-gradient(to top, rgba(9,9,11,0.80) 0%, transparent 100%)',
        }}
      >
        <span className="font-mono text-[10px] text-white/25 tracking-widest">
          12.9716°N · 77.5946°E · Bangalore, India
        </span>
        <span className="font-mono text-[10px] text-white/18 tracking-wider">
          © Mapbox · © OpenStreetMap
        </span>
      </footer>

    </div>
  );
}
