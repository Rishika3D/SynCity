'use client';

/**
 * /control — SynCity Government Command Centre
 *
 * Audience: BBMP officials, DULT, government demo
 * Access:   Open (PIN gate to be added before live pitch)
 *
 * Dynamically imports CommandCenter to avoid SSR issues with MapLibre.
 * Loading screen uses VictoryStrikerSans font.
 */

import dynamic from 'next/dynamic';

const CommandCenter = dynamic(
  () => import('@/components/command/CommandCenter'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#080C14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}>

        {/* Logo mark */}
        <div style={{
          width: 48,
          height: 48,
          border: '1px solid rgba(0,238,255,0.30)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}>
          <div style={{
            width: 16,
            height: 16,
            transform: 'rotate(45deg)',
            border: '1.5px solid rgba(0,238,255,0.70)',
          }} />
        </div>

        {/* Primary title — Victory Striker Sans */}
        <div style={{
          fontFamily: "'VictoryStrikerSans', sans-serif",
          fontSize: '28px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#ffffff',
          lineHeight: 1,
        }}>
          SynCity
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'VictoryStrikerSans', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.45em',
          textTransform: 'uppercase',
          color: 'rgba(0,238,255,0.50)',
          marginTop: -8,
        }}>
          Bangalore Urban Intelligence
        </div>

        {/* Spinner */}
        <div style={{
          marginTop: 16,
          width: 28,
          height: 28,
          border: '1.5px solid rgba(0,238,255,0.20)',
          borderTopColor: '#00EEFF',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
        }} />

        {/* Status text */}
        <div style={{
          fontFamily: "'VictoryStrikerSans', sans-serif",
          fontSize: '9px',
          letterSpacing: '0.30em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.18)',
          marginTop: -8,
        }}>
          Initialising Command Centre
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @font-face {
            font-family: 'VictoryStrikerSans';
            src: url('/fonts/victory-striker-sans.otf') format('opentype');
            font-display: swap;
          }
        `}</style>
      </div>
    ),
  },
);

export default function ControlPage() {
  return <CommandCenter />;
}
