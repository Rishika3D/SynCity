'use client';
import { useEffect, useState } from 'react';

export default function Loader() {
  const [pct, setPct]       = useState(0);
  const [done, setDone]     = useState(false);
  const [leaving, setLeave] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setPct(p => {
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(() => setLeave(true), 300);
          setTimeout(() => setDone(true), 900);
          return 100;
        }
        return p + Math.random() * 6 + 2;
      });
    }, 60);
    return () => clearInterval(iv);
  }, []);

  if (done) return null;

  return (
    <div
      style={{
        position  : 'fixed',
        inset     : 0,
        zIndex    : 1000,
        background: '#060B18',
        display   : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity 0.55s ease-out, transform 0.55s ease-out',
        opacity   : leaving ? 0 : 1,
        transform : leaving ? 'scale(1.04)' : 'scale(1)',
        pointerEvents: leaving ? 'none' : 'all',
      }}
    >
      <p style={{
        fontFamily   : 'var(--font-bebas), Impact, sans-serif',
        fontSize     : '4rem',
        letterSpacing: '0.18em',
        color        : 'rgba(255,255,255,0.88)',
        margin       : 0,
      }}>
        SYNCITY
      </p>

      <div style={{
        marginTop : '28px',
        width     : '220px',
        height    : '1px',
        background: 'rgba(255,255,255,0.08)',
        position  : 'relative',
        borderRadius: '2px',
        overflow  : 'hidden',
      }}>
        <div style={{
          position  : 'absolute',
          left      : 0, top: 0, bottom: 0,
          width     : `${Math.min(pct, 100)}%`,
          background: 'linear-gradient(90deg, #1E3A8A, #00EEFF)',
          transition: 'width 0.08s linear',
          borderRadius: '2px',
        }} />
      </div>

      <p style={{
        fontFamily   : '"Inter", sans-serif',
        fontSize     : '9px',
        letterSpacing: '0.46em',
        textTransform: 'uppercase',
        color        : 'rgba(255,255,255,0.22)',
        marginTop    : '14px',
      }}>
        Initialising digital twin
      </p>
    </div>
  );
}
