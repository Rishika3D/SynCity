'use client';

/**
 * /control — SynCity Government Command Centre
 *
 * Audience: BBMP officials, DULT, government demo
 * Access:   Open (PIN gate to be added before live pitch)
 *
 * Dynamically imports CommandCenter to avoid SSR issues with MapLibre.
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
        gap: 16,
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '2px solid rgba(0,238,255,0.40)',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
        }} />
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: '11px',
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
          color: 'rgba(0,238,255,0.45)',
        }}>
          Initialising Command Centre
        </div>
        <div style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: '9px',
          letterSpacing: '0.22em',
          color: 'rgba(255,255,255,0.18)',
        }}>
          SynCity · Bangalore Urban Intelligence
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    ),
  },
);

export default function ControlPage() {
  return <CommandCenter />;
}
