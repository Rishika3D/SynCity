'use client';
/**
 * CloudCanvas — Auto-playing cinematic Mapbox hero.
 *
 * Matches marseille.laphase5.com:
 *  • Slate blue (#1E2D3F) atmosphere — not scroll-driven, auto-plays
 *  • Camera journeys through Bangalore on its own (story-telling mode)
 *  • Text visible at start, fades after ~10s naturally
 *  • Scroll only fades the hero out to reveal content below
 */

import { useEffect, useRef } from 'react';
import mapboxgl              from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import gsap                  from 'gsap';
import { ScrollTrigger }     from 'gsap/ScrollTrigger';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

const BANGALORE: [number, number] = [77.5946, 12.9716];

// Auto-playing camera story — each segment: [zoom, pitch, bearing, duration(s)]
const STORY: [number, number, number, number][] = [
  [10.0, 40,  -25,  0],   // opening position
  [10.6, 46,  -12,  7],   // slowly open up
  [11.4, 54,    4, 10],   // sweep right, descend
  [12.4, 62,   18,  9],   // approach city, bank left
  [13.2, 66,    6,  8],   // tighten on centre
  [14.0, 70,   -6,  8],   // near street level
  [14.6, 74,  -16,  7],   // deep in the city
  [13.8, 68,   -8,  5],   // pull back slightly
  [10.0, 40,  -25,  5],   // return to start (seamless loop)
];

// ═══════════════════════════════════════════════════════════════════════════════
export default function CloudCanvas() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const heroRef         = useRef<HTMLDivElement>(null);
  const textRef         = useRef<HTMLDivElement>(null);
  const hintRef         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    gsap.registerPlugin(ScrollTrigger);

    // ── Init Mapbox ───────────────────────────────────────────────────────────
    const map = new mapboxgl.Map({
      container  : mapContainerRef.current,
      style      : 'mapbox://styles/mapbox/dark-v11',
      center     : BANGALORE,
      zoom       : STORY[0][0],
      pitch      : STORY[0][1],
      bearing    : STORY[0][2],
      interactive: false,
    });

    // Proxy object GSAP will tween
    const cam = { zoom: STORY[0][0], pitch: STORY[0][1], bearing: STORY[0][2] };
    let storyTL: gsap.core.Timeline | null = null;

    map.on('load', () => {
      // ── Build cinematic timeline (auto-looping) ──────────────────────────
      storyTL = gsap.timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } });

      // Skip index 0 (starting pos already set)
      for (let i = 1; i < STORY.length; i++) {
        const [zoom, pitch, bearing, dur] = STORY[i];
        storyTL.to(cam, {
          zoom, pitch, bearing,
          duration: dur,
          onUpdate() {
            map.easeTo({ center: BANGALORE, zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: 0 });
          },
        });
      }

      // Reset opacity (may be 0 from a previous hot-reload animation)
      gsap.set(textRef.current, { opacity: 1 });
      gsap.set(hintRef.current, { opacity: 1 });
      // Text fades out naturally after ~12 s
      gsap.to(textRef.current, { opacity: 0, duration: 2.5, delay: 12, ease: 'power2.in' });
      // Hint fades sooner
      gsap.to(hintRef.current, { opacity: 0, duration: 1.5, delay: 4, ease: 'power2.in' });
    });

    // ── Scroll: fade out entire hero to reveal page below ────────────────────
    ScrollTrigger.create({
      trigger: '#city-map',
      start  : 'top top',
      end    : 'bottom top',          // hero fades over its own height
      scrub  : 0.8,
      onUpdate(self) {
        const p = self.progress;
        if (heroRef.current) heroRef.current.style.opacity = (1 - p).toFixed(3);
      },
    });

    return () => {
      storyTL?.kill();
      ScrollTrigger.getAll().forEach(t => t.kill());
      map.remove();
    };
  }, []);

  return (
    // Outer wrapper — fades out on scroll
    <div
      ref={heroRef}
      style={{ position: 'fixed', inset: 0, zIndex: 0, willChange: 'opacity' }}
    >
      {/* ── Mapbox canvas ────────────────────────────────────────────────── */}
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* ── Slate blue atmospheric tint — key Marseille colour ──────────── */}
      <div
        aria-hidden
        style={{
          position  : 'absolute',
          inset     : 0,
          background: 'rgba(14, 22, 38, 0.42)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Vignette ─────────────────────────────────────────────────────── */}
      <div
        aria-hidden
        style={{
          position  : 'absolute',
          inset     : 0,
          background: 'radial-gradient(ellipse at 50% 46%, transparent 26%, rgba(8,14,26,0.82) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── SYNCITY headline ─────────────────────────────────────────────── */}
      <div
        ref={textRef}
        style={{
          position     : 'absolute',
          top          : '50%',
          left         : '50%',
          transform    : 'translate(-50%, -52%)',
          textAlign    : 'center',
          pointerEvents: 'none',
          willChange   : 'opacity',
        }}
      >
        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(0.55rem, 0.85vw, 0.72rem)',
          fontWeight   : 500,
          letterSpacing: '0.55em',
          textTransform: 'uppercase',
          color        : 'rgba(140,190,255,0.60)',
          margin       : '0 0 16px',
        }}>
          A Digital Twin Experience
        </p>

        <h1 style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(3.8rem, 9.5vw, 9rem)',
          fontWeight   : 900,
          letterSpacing: '0.04em',
          color        : '#FFFFFF',
          margin       : 0,
          lineHeight   : 0.88,
          textTransform: 'uppercase',
        }}>
          SYNCITY
        </h1>

        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(0.60rem, 0.9vw, 0.76rem)',
          fontWeight   : 300,
          letterSpacing: '0.28em',
          color        : 'rgba(180,210,255,0.38)',
          margin       : '20px 0 0',
          textTransform: 'uppercase',
        }}>
          Bangalore · 12.97°N · 77.59°E
        </p>
      </div>

      {/* ── Scroll hint ──────────────────────────────────────────────────── */}
      <div
        ref={hintRef}
        style={{
          position     : 'absolute',
          bottom       : '44px',
          left         : '50%',
          transform    : 'translateX(-50%)',
          display      : 'flex',
          flexDirection: 'column',
          alignItems   : 'center',
          gap          : '10px',
          pointerEvents: 'none',
        }}
      >
        <span style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : '8px',
          fontWeight   : 300,
          letterSpacing: '0.50em',
          textTransform: 'uppercase',
          color        : 'rgba(120,170,255,0.35)',
        }}>
          Scroll
        </span>
        <svg width="12" height="18" viewBox="0 0 12 18" fill="none"
          style={{ animation: 'bounce 2s ease-in-out infinite' }}>
          <path d="M6 1 L6 13 M2 9 L6 13 L10 9"
            stroke="rgba(100,150,255,0.30)" strokeWidth="1.1"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0);   opacity: 0.30; }
          50%       { transform: translateY(5px); opacity: 0.58; }
        }
      `}</style>
    </div>
  );
}
