'use client';
import { useSimulationStore, SimMode } from '@/store/useSimulationStore';

const MODES: { id: SimMode; label: string; sub: string; accent: string }[] = [
  { id: 'optimized', label: 'Optimized City', sub: 'AI-governed · stable flows',    accent: '#00CCFF' },
  { id: 'chaos',     label: 'No Intervention', sub: 'Uncontrolled · peak stress',   accent: '#FF3344' },
];

export default function Controls() {
  const { mode, setMode, scrollProgress } = useSimulationStore();

  // Only show in future/neural scenes (scroll > 68%)
  const vis = scrollProgress > 0.68;

  return (
    <div
      style={{
        position  : 'fixed',
        bottom    : '48px',
        left      : '50%',
        transform : `translateX(-50%) translateY(${vis ? 0 : 24}px)`,
        opacity   : vis ? 1 : 0,
        transition: 'opacity 0.5s ease, transform 0.5s ease',
        zIndex    : 50,
        display   : 'flex',
        gap       : '10px',
        pointerEvents: vis ? 'all' : 'none',
      }}
    >
      {MODES.map(m => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : '10px',
            fontWeight   : 500,
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            color        : mode === m.id ? m.accent : 'rgba(255,255,255,0.40)',
            background   : mode === m.id
              ? `rgba(${hexTriplet(m.accent)},0.12)`
              : 'rgba(255,255,255,0.04)',
            border       : `1px solid ${mode === m.id
              ? `rgba(${hexTriplet(m.accent)},0.55)`
              : 'rgba(255,255,255,0.10)'}`,
            borderRadius : '4px',
            padding      : '12px 20px',
            cursor       : 'pointer',
            backdropFilter: 'blur(12px)',
            transition   : 'all 0.25s ease',
            display      : 'flex',
            flexDirection: 'column',
            alignItems   : 'center',
            gap          : '4px',
          }}
        >
          <span>{m.label}</span>
          <span style={{
            fontSize     : '7px',
            letterSpacing: '0.22em',
            color        : mode === m.id
              ? `rgba(${hexTriplet(m.accent)},0.65)`
              : 'rgba(255,255,255,0.20)',
            fontWeight   : 400,
          }}>
            {m.sub}
          </span>
        </button>
      ))}
    </div>
  );
}

function hexTriplet(hex: string) {
  const n = parseInt(hex.replace('#',''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
