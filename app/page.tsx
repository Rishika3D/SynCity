'use client';

/**
 * SynCity — Landing page
 *
 * Entry sequence (LP5 Marseille-style):
 *   1. Counter  00 → 100  (2.6 s, ease-in-out)
 *   2. Morph    "100" → year  (0.8 s cross-dissolve)
 *   3. Year     display hold  (1.2 s)
 *   4. Headline reveal  "WHAT IF YOU…" + ENTER button
 *   5. Overlay fades → Bangalore map flythrough begins
 *
 * Map page (LP5-style):
 *   • Dark CartoDB aerial map of Bangalore, 54° pitch
 *   • Cinematic drone flythrough on Enter
 *   • SYNCITY › logo at top centre with category counts
 *   • Hover POI dots → inline fact card
 *   • Scroll down → Platform modules
 */

import dynamic   from 'next/dynamic';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ── Lazy load the heavy map (avoids SSR issues) ─────────────────────── */
const BangaloreMap = dynamic(
  () => import('@/components/map/BangaloreMap'),
  { ssr: false, loading: () => <div style={{ height: '100vh', background: '#0d1826' }} /> },
);


/* ══════════════════════════════════════════════════════════════════════
   INTRO OVERLAY — matches LP5 Marseille loading → year morph → headline
   ══════════════════════════════════════════════════════════════════════ */
type Phase = 'counting' | 'morphing' | 'yearHold' | 'reveal' | 'exit';

function IntroOverlay({ onDone }: { onDone: () => void }) {
  const YEAR = new Date().getFullYear();          // auto-updates each year
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('counting');
  const rafRef = useRef<number>(0);

  /* Prevent scroll while overlay is visible */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  /* ── Counter 00 → 100 over 2.6 s (ease-in-out quad) ──────────────── */
  useEffect(() => {
    const DURATION = 2600;
    const start    = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      setCount(Math.floor(e * 100));

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCount(100);
        /* Brief hold at 100 → morph to year */
        setTimeout(() => setPhase('morphing'), 260);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Morph → yearHold → reveal timing ────────────────────────────── */
  useEffect(() => {
    if (phase === 'morphing') {
      const t = setTimeout(() => setPhase('yearHold'), 820);
      return () => clearTimeout(t);
    }
    if (phase === 'yearHold') {
      const t = setTimeout(() => setPhase('reveal'), 1300);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const handleEnter = useCallback(() => {
    setPhase('exit');
    setTimeout(() => {
      document.body.style.overflow = '';
      onDone();
    }, 860);
  }, [onDone]);

  /* ── Shared number style ──────────────────────────────────────────── */
  const numStyle: React.CSSProperties = {
    fontFamily   : 'var(--font-bebas), Impact, sans-serif',
    fontSize     : 'clamp(9rem, 22vw, 26rem)',
    fontWeight   : 400,
    letterSpacing: '-0.02em',
    lineHeight   : 0.88,
    color        : 'rgba(255,255,255,0.92)',
    userSelect   : 'none',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position      : 'fixed',
        inset         : 0,
        zIndex        : 1000,
        background    : '#0d1826',
        display       : 'flex',
        flexDirection : 'column',
        alignItems    : 'center',
        justifyContent: 'center',
        transition    : phase === 'exit' ? 'opacity 0.86s cubic-bezier(0.4,0,0.2,1)' : 'none',
        opacity       : phase === 'exit' ? 0 : 1,
        pointerEvents : phase === 'exit' ? 'none' : 'auto',
      }}
    >
      <style>{`
        /* Counter fade out — scales up + blurs + widens tracking */
        @keyframes countOut {
          0%   { opacity:1; transform:scale(1);    letter-spacing:-0.02em; filter:blur(0px);  }
          100% { opacity:0; transform:scale(1.22); letter-spacing:0.18em;  filter:blur(14px); }
        }
        /* Year fades in from slightly smaller */
        @keyframes yearIn {
          0%   { opacity:0; transform:scale(0.80); filter:blur(10px); }
          100% { opacity:1; transform:scale(1);    filter:blur(0px);  }
        }
        /* Scanline under counter */
        @keyframes scan {
          0%   { transform:scaleX(0); opacity:0.55; }
          55%  { transform:scaleX(1); opacity:0.55; }
          100% { transform:scaleX(1); opacity:0;    }
        }
        /* Headline slides up */
        @keyframes slideUp {
          from { opacity:0; transform:translateY(30px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        /* Year micro-label */
        @keyframes yearLabel {
          from { opacity:0; transform:translateY(10px); }
          to   { opacity:1; transform:translateY(0);    }
        }
        /* Enter button */
        @keyframes btnFade { from { opacity:0; } to { opacity:1; } }
        @keyframes btnPulse {
          0%,100% { border-color:rgba(255,255,255,0.28); }
          50%     { border-color:rgba(255,255,255,0.62); }
        }
      `}</style>

      {/* ── Phase: counting ────────────────────────────────────────────── */}
      {phase === 'counting' && (
        <div style={{ textAlign: 'center' }}>
          <span style={numStyle}>
            {String(count).padStart(2, '0')}
          </span>
          {/* Thin scanline progress indicator */}
          <span style={{
            display         : 'block',
            height          : '1px',
            background      : 'rgba(255,255,255,0.32)',
            marginTop       : '16px',
            transformOrigin : 'left center',
            animation       : 'scan 2.6s linear both',
          }} />
        </div>
      )}

      {/* ── Phase: morphing — "100" dissolves into year ─────────────────── */}
      {phase === 'morphing' && (
        <div style={{ position: 'relative', height: 'clamp(9rem,22vw,26rem)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {/* "100" fading out */}
          <span style={{ ...numStyle, position: 'absolute', animation: 'countOut 0.82s ease-in both' }}>
            100
          </span>
          {/* Year fading in */}
          <span style={{ ...numStyle, position: 'absolute', animation: 'yearIn 0.82s ease-out 0.12s both' }}>
            {YEAR}
          </span>
        </div>
      )}

      {/* ── Phase: yearHold — stable year ──────────────────────────────── */}
      {phase === 'yearHold' && (
        <span style={numStyle}>{YEAR}</span>
      )}

      {/* ── Phase: reveal — headline + Enter ───────────────────────────── */}
      {phase === 'reveal' && (
        <div style={{
          textAlign: 'center',
          padding  : '0 clamp(28px, 6vw, 90px)',
          maxWidth : '1100px',
          width    : '100%',
        }}>
          {/* Year micro-label */}
          <p style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : 'clamp(0.62rem, 0.9vw, 0.80rem)',
            fontWeight   : 400,
            letterSpacing: '0.58em',
            textTransform: 'uppercase',
            color        : 'rgba(255,255,255,0.30)',
            margin       : '0 0 20px',
            animation    : 'yearLabel 0.65s ease-out both',
          }}>
            {YEAR}
          </p>

          {/* Bangalore fact strip */}
          <p style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : 'clamp(0.60rem, 0.88vw, 0.78rem)',
            fontWeight   : 400,
            letterSpacing: '0.38em',
            textTransform: 'uppercase',
            color        : 'rgba(212,168,122,0.55)',
            margin       : '0 0 26px',
            animation    : 'yearLabel 0.65s ease-out 0.12s both',
          }}>
            13.6M people · 741 km² · ₹110B GDP · 210+ lakes · 12,847 IoT sensors
          </p>

          {/* Headline — Bebas Neue, LP5 warm peach */}
          <h1 style={{
            fontFamily   : 'var(--font-bebas), Impact, sans-serif',
            fontSize     : 'clamp(4.5rem, 12vw, 13rem)',
            fontWeight   : 400,
            letterSpacing: '0.02em',
            lineHeight   : 0.88,
            color        : '#D4A87A',
            textTransform: 'uppercase',
            margin       : '0 0 50px',
            animation    : 'slideUp 0.88s ease-out 0.06s both',
          }}>
            Welcome to<br />Bangalore
          </h1>

          {/* ENTER — thin border button, LP5 style */}
          <button
            onClick={handleEnter}
            style={{
              fontFamily   : '"Inter", sans-serif',
              fontSize     : 'clamp(9px, 1vw, 11px)',
              fontWeight   : 500,
              letterSpacing: '0.52em',
              textTransform: 'uppercase',
              color        : 'rgba(255,255,255,0.75)',
              background   : 'transparent',
              border       : '1px solid rgba(255,255,255,0.32)',
              borderRadius : '2px',
              padding      : '15px 42px',
              cursor       : 'pointer',
              animation    : 'btnFade 0.65s ease-out 0.55s both, btnPulse 2.8s ease-in-out 1.3s infinite',
              transition   : 'background 0.2s, color 0.2s, border-color 0.2s',
            }}
            onMouseEnter={e => {
              const b = e.currentTarget;
              b.style.background  = 'rgba(255,255,255,0.07)';
              b.style.color       = '#fff';
              b.style.borderColor = 'rgba(255,255,255,0.65)';
            }}
            onMouseLeave={e => {
              const b = e.currentTarget;
              b.style.background  = 'transparent';
              b.style.color       = 'rgba(255,255,255,0.75)';
              b.style.borderColor = 'rgba(255,255,255,0.32)';
            }}
          >
            Enter
          </button>

          {/* Coordinate hint */}
          <p style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : '9px',
            fontWeight   : 300,
            letterSpacing: '0.42em',
            textTransform: 'uppercase',
            color        : 'rgba(255,255,255,0.13)',
            margin       : '30px 0 0',
            animation    : 'btnFade 0.65s ease-out 0.90s both',
          }}>
            Bangalore · 12.97°N · 77.59°E
          </p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   HOME
   ══════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const [entered, setEntered] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (sessionStorage.getItem('syncity_intro_done') === '1') {
      setEntered(true);
    }
  }, []);

  const handleDone = () => {
    sessionStorage.setItem('syncity_intro_done', '1');
    setEntered(true);
  };

  return (
    <main style={{ background: '#0d1826', color: '#fff' }}>

      {/* ── Intro overlay ─────────────────────────────────── */}
      {hydrated && !entered && <IntroOverlay onDone={handleDone} />}

      {/* ── Bangalore map — full page hero with modules built in ── */}
      <BangaloreMap started={entered} />

    </main>
  );
}

