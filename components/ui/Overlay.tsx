'use client';
import { useSimulationStore } from '@/store/useSimulationStore';
import { mapRange }           from '@/lib/math';

const SCENES = [
  {
    range     : [0.00, 0.18] as [number,number],
    label     : 'Initialising',
    headline  : 'The Unknown',
    sub       : 'Something stirs beneath the surface.',
  },
  {
    range     : [0.18, 0.38] as [number,number],
    label     : 'Formation',
    headline  : 'The City Emerges',
    sub       : 'From chaos — structure.',
  },
  {
    range     : [0.38, 0.68] as [number,number],
    label     : 'Present',
    headline  : 'Reality in Motion',
    sub       : '12.8M people · 741 km² · 2,800 IoT nodes',
  },
  {
    range     : [0.68, 0.84] as [number,number],
    label     : 'Simulation',
    headline  : 'What Happens Next?',
    sub       : 'Toggle scenarios to see the impact of decisions.',
  },
  {
    range     : [0.84, 1.00] as [number,number],
    label     : 'Intelligence',
    headline  : 'The AI Layer',
    sub       : 'Every node. Every decision. Optimised in real time.',
  },
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function fade(p: number, [s, e]: [number, number]) {
  const mid = (s + e) / 2;
  const hw  = (e - s) * 0.42;
  const d   = Math.abs(p - mid);
  return clamp(1 - d / hw, 0, 1);
}

export default function Overlay() {
  const { scrollProgress } = useSimulationStore();

  // Active scene
  const active = SCENES.find(
    s => scrollProgress >= s.range[0] && scrollProgress < s.range[1],
  ) ?? SCENES[0];
  const alpha = fade(scrollProgress, active.range);

  // Scroll down arrow: only in Scene 0
  const arrowOpacity = mapRange(scrollProgress, 0, 0.08, 1, 0);

  return (
    <>
      {/* ── Top-left wordmark ──────────────────────────────────── */}
      <div style={{
        position : 'fixed',
        top      : '28px',
        left     : '36px',
        zIndex   : 40,
        opacity  : mapRange(scrollProgress, 0.9, 1, 1, 0),
        transition: 'opacity 0.4s',
      }}>
        <p style={{
          fontFamily   : 'var(--font-bebas), Impact, sans-serif',
          fontSize     : '1.6rem',
          letterSpacing: '0.14em',
          color        : 'rgba(255,255,255,0.88)',
          margin       : 0,
        }}>
          SYNCITY<span style={{ color: '#00EEFF', marginLeft: '4px' }}>›</span>
        </p>
        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : '7.5px',
          letterSpacing: '0.40em',
          textTransform: 'uppercase',
          color        : 'rgba(255,255,255,0.22)',
          margin       : '2px 0 0',
        }}>
          The Living Digital Twin
        </p>
      </div>

      {/* ── Scene label (top-right) ───────────────────────────── */}
      <div style={{
        position : 'fixed',
        top      : '32px',
        right    : '36px',
        zIndex   : 40,
        display  : 'flex',
        alignItems: 'center',
        gap      : '8px',
      }}>
        <span style={{
          display   : 'inline-block',
          width     : '5px', height: '5px',
          borderRadius: '50%',
          background: '#00EEFF',
          boxShadow : '0 0 8px #00EEFF',
          opacity   : alpha,
        }} />
        <span style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : '8px',
          fontWeight   : 500,
          letterSpacing: '0.40em',
          textTransform: 'uppercase',
          color        : `rgba(255,255,255,${alpha * 0.50})`,
        }}>
          {active.label}
        </span>
      </div>

      {/* ── Central headline ─────────────────────────────────── */}
      <div style={{
        position     : 'fixed',
        bottom       : '14vh',
        left         : '50%',
        transform    : 'translateX(-50%)',
        zIndex       : 40,
        textAlign    : 'center',
        opacity      : alpha,
        transition   : 'opacity 0.35s ease',
        pointerEvents: 'none',
        whiteSpace   : 'nowrap',
      }}>
        <h2 style={{
          fontFamily   : 'var(--font-bebas), Impact, sans-serif',
          fontSize     : 'clamp(2.8rem, 7vw, 6rem)',
          letterSpacing: '0.07em',
          color        : 'rgba(255,255,255,0.92)',
          margin       : 0,
          textShadow   : '0 0 60px rgba(0,200,255,0.25)',
        }}>
          {active.headline}
        </h2>
        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(0.65rem, 1.1vw, 0.85rem)',
          fontWeight   : 300,
          letterSpacing: '0.32em',
          textTransform: 'uppercase',
          color        : 'rgba(255,255,255,0.32)',
          margin       : '10px 0 0',
        }}>
          {active.sub}
        </p>
      </div>

      {/* ── Scroll hint ──────────────────────────────────────── */}
      <div style={{
        position : 'fixed',
        bottom   : '38px',
        left     : '50%',
        transform: 'translateX(-50%)',
        zIndex   : 40,
        opacity  : arrowOpacity,
        transition: 'opacity 0.4s',
        display  : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap      : '6px',
      }}>
        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : '7px',
          letterSpacing: '0.48em',
          textTransform: 'uppercase',
          color        : 'rgba(255,255,255,0.22)',
          margin       : 0,
        }}>
          Scroll to explore
        </p>
        <svg width="14" height="22" viewBox="0 0 14 22" fill="none"
          style={{ animation: 'bounce 1.8s ease-in-out infinite' }}>
          <rect x="4.5" y="0.5" width="5" height="10" rx="2.5"
            stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
          <circle cx="7" cy="4" r="1.5" fill="rgba(255,255,255,0.40)"
            style={{ animation: 'scrollDot 1.8s ease-in-out infinite' }}/>
          <path d="M5 16l2 2.5L9 16" stroke="rgba(255,255,255,0.20)"
            strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* ── Progress bar (left edge) ─────────────────────────── */}
      <div style={{
        position: 'fixed',
        left    : '18px',
        top     : '50%',
        transform: 'translateY(-50%)',
        zIndex  : 40,
        display : 'flex',
        flexDirection: 'column',
        gap     : '6px',
        alignItems: 'center',
      }}>
        {SCENES.map((s, i) => {
          const mid = (s.range[0] + s.range[1]) / 2;
          const active = Math.abs(scrollProgress - mid) < (s.range[1] - s.range[0]) / 2;
          return (
            <div key={i} style={{
              width       : '2px',
              height      : active ? '28px' : '10px',
              borderRadius: '2px',
              background  : active ? '#00EEFF' : 'rgba(255,255,255,0.15)',
              boxShadow   : active ? '0 0 8px #00EEFF' : 'none',
              transition  : 'all 0.4s ease',
            }} />
          );
        })}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(5px); }
        }
        @keyframes scrollDot {
          0%   { transform: translateY(0); opacity:1; }
          80%  { transform: translateY(4px); opacity:0.3; }
          100% { transform: translateY(0); opacity:1; }
        }
      `}</style>
    </>
  );
}
