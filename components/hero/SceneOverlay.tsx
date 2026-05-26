'use client';

/**
 * SceneOverlay — Five-scene text driver for the cinematic cloud→city journey.
 *
 * All scroll-driven panels start with opacity:0 in JSX so there's no
 * flash-of-content before GSAP's autoAlpha kicks in.
 *
 * Timeline (100 units = full #journey scroll)
 * ───────────────────────────────────────────
 *  S1  load-driven entrance, then scroll-driven fadeout at tl 8
 *  S2  tl 16–40  — Cloud descent coordinates
 *  S3  tl 42–61  — City reveal text
 *  S4a tl 62–68  — Urban Infrastructure
 *  S4b tl 68–74  — Climate Monitoring
 *  S4c tl 74–80  — Traffic Intelligence
 *  S4d tl 80–86  — Emergency Systems
 *  S5  tl 88–100 — ENTER SYNCITY CTA
 */

import { useEffect, useRef } from 'react';
import Link                  from 'next/link';
import { gsap }              from 'gsap';
import { ScrollTrigger }     from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const MONO  = 'ui-monospace,"Space Mono",monospace';
const SERIF = 'var(--font-playfair),"Playfair Display",Georgia,serif';
const SANS  = '"Space Grotesk",system-ui,sans-serif';

// ─────────────────────────────────────────────────────────────────────────────
export default function SceneOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ── S1 entrance: independent of scroll ────────────────────────────────
    const chars = root.querySelectorAll<HTMLElement>('.so-s1-char');
    gsap.set([...Array.from(chars), '.so-s1-sub', '.so-s1-scroll', '.so-topbar'], { autoAlpha: 0 });

    gsap.to('.so-topbar',    { autoAlpha: 1, duration: 1.4, delay: 0.3, ease: 'power2.out' });
    gsap.fromTo(chars,
      { autoAlpha: 0, y: 70, rotationX: -90, transformOrigin: '50% 100%' },
      { autoAlpha: 1, y: 0, rotationX: 0, ease: 'power3.out', stagger: 0.055, duration: 0.90, delay: 0.5 },
    );
    gsap.to('.so-s1-sub',    { autoAlpha: 1, y: 0, duration: 1.0, delay: 1.5, ease: 'power2.out' });
    gsap.to('.so-s1-scroll', { autoAlpha: 1, y: 0, duration: 0.9, delay: 2.0, ease: 'power2.out' });

    // ── Scroll-driven timeline ─────────────────────────────────────────────
    // (scroll-driven panels already start opacity:0 via JSX inline style)
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });

    tl.to('.so-topbar', { autoAlpha: 0, duration: 3 }, 80);
    tl.to(['.so-s1-title', '.so-s1-sub', '.so-s1-scroll'],
      { autoAlpha: 0, y: -28, duration: 6 }, 8);

    // S2 cloud descent
    tl.to('.so-s2-coord', { autoAlpha: 1, y: 0, duration: 5 }, 16);
    tl.to('.so-s2-label', { autoAlpha: 1, y: 0, duration: 4 }, 21);
    tl.to(['.so-s2-coord', '.so-s2-label'], { autoAlpha: 0, y: -16, duration: 4 }, 37);

    // S3 city reveal
    tl.to('.so-s3-line1', { autoAlpha: 1, y: 0, duration: 5 }, 43);
    tl.to('.so-s3-line2', { autoAlpha: 1, y: 0, duration: 4 }, 49);
    tl.to(['.so-s3-line1', '.so-s3-line2'], { autoAlpha: 0, y: -22, duration: 4 }, 59);

    // S4 story labels
    tl.to('.so-s4a', { autoAlpha: 1, y: 0, duration: 3 }, 62);
    tl.to('.so-s4a', { autoAlpha: 0, y: -14, duration: 2 }, 67);
    tl.to('.so-s4b', { autoAlpha: 1, y: 0, duration: 3 }, 68);
    tl.to('.so-s4b', { autoAlpha: 0, y: -14, duration: 2 }, 73);
    tl.to('.so-s4c', { autoAlpha: 1, y: 0, duration: 3 }, 74);
    tl.to('.so-s4c', { autoAlpha: 0, y: -14, duration: 2 }, 79);
    tl.to('.so-s4d', { autoAlpha: 1, y: 0, duration: 3 }, 80);
    tl.to('.so-s4d', { autoAlpha: 0, y: -14, duration: 2 }, 85);

    // S5 CTA
    tl.to('.so-s5-btn', { autoAlpha: 1, y: 0, duration: 6 }, 88);
    tl.to('.so-s5-sub', { autoAlpha: 1, y: 0, duration: 4 }, 92);

    ScrollTrigger.create({
      trigger: '#journey', start: 'top top', end: 'bottom bottom',
      scrub: 1.4, animation: tl,
    });

    return () => { ScrollTrigger.getAll().forEach(s => s.kill()); tl.kill(); };
  }, []);

  // Initial style for all scroll-revealed panels (prevents flash before GSAP)
  const hidden: React.CSSProperties = { opacity: 0, transform: 'translateY(18px)' };

  // Story label block
  const StoryLabel = ({
    cls, tag, headline, desc, accent,
  }: { cls: string; tag: string; headline: string; desc: string; accent: string }) => (
    <div className={`${cls} absolute bottom-[12vh] left-[7vw] sm:left-[10vw] max-w-xs sm:max-w-sm`}
         style={hidden}>
      <p style={{ fontFamily: MONO, fontSize: '8px', letterSpacing: '0.52em',
        color: accent, textTransform: 'uppercase', marginBottom: '10px' }}>{tag}</p>
      <div style={{ width: '40px', height: '1px', background: accent,
        opacity: 0.45, marginBottom: '14px' }} />
      <p style={{ fontFamily: SERIF, fontWeight: 700,
        fontSize: 'clamp(1.3rem,2.4vw,2.1rem)',
        color: 'rgba(255,255,255,0.92)', lineHeight: 1.18, marginBottom: '10px' }}>
        {headline}
      </p>
      <p style={{ fontFamily: SANS, fontSize: 'clamp(0.62rem,1.0vw,0.78rem)',
        color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', lineHeight: 1.65 }}>
        {desc}
      </p>
    </div>
  );

  return (
    <div ref={rootRef}
      className="absolute inset-0 pointer-events-none select-none"
      style={{ perspective: '900px' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="so-topbar absolute top-0 left-0 right-0
                      flex justify-between items-center px-8 sm:px-14 pt-7 sm:pt-9">
        <span style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.55em',
          color: 'rgba(11,12,16,0.35)', textTransform: 'uppercase' }}>SYNCITY</span>
        <nav className="hidden md:flex gap-10">
          {['EXPLORE', 'ANALYTICS', 'SIMULATION'].map(label => (
            <Link key={label} href={`/${label.toLowerCase()}`} className="pointer-events-auto"
              style={{ fontFamily: MONO, fontSize: '8px', letterSpacing: '0.42em',
                color: 'rgba(11,12,16,0.28)', textTransform: 'uppercase' }}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"
            style={{ boxShadow: '0 0 6px rgba(249,115,22,0.7)' }} />
          <span style={{ fontFamily: MONO, fontSize: '8px', letterSpacing: '0.38em',
            color: 'rgba(249,115,22,0.70)', textTransform: 'uppercase' }}>LIVE</span>
        </div>
      </div>

      {/* ── SCENE 1 — Above clouds ──────────────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
        <h1 className="so-s1-title leading-none whitespace-nowrap"
          style={{ fontFamily: SERIF, fontWeight: 700,
            fontSize: 'clamp(4rem,14vw,12rem)', letterSpacing: '-0.01em',
            color: '#0B0C10', textShadow: '0 2px 48px rgba(0,0,0,0.10)' }}>
          {'SYNCITY'.split('').map((ch, i) => (
            <span key={i} className="so-s1-char inline-block">{ch}</span>
          ))}
        </h1>
        <div className="so-s1-sub w-36 sm:w-56"
          style={{ height: '1px', background: 'rgba(11,12,16,0.16)' }} />
        <p className="so-s1-sub" style={{ fontFamily: MONO,
          fontSize: 'clamp(0.52rem,0.85vw,0.70rem)', letterSpacing: '0.44em',
          textTransform: 'uppercase', color: 'rgba(11,12,16,0.40)' }}>
          The Living Intelligence of a City
        </p>
        <div className="so-s1-scroll absolute bottom-10 flex flex-col items-center gap-2">
          <span style={{ fontFamily: MONO, fontSize: '7px', letterSpacing: '0.55em',
            color: 'rgba(11,12,16,0.26)', textTransform: 'uppercase' }}>SCROLL</span>
          <div style={{ width: '1px', height: '44px', background: 'rgba(11,12,16,0.20)',
            animation: 'soScrollPulse 2s ease-in-out infinite' }} />
        </div>
      </div>

      {/* ── SCENE 2 — Cloud descent ─────────────────────────────────────── */}
      <div className="absolute bottom-[10vh] right-[7vw] sm:right-[10vw] text-right">
        <p className="so-s2-coord" style={{ ...hidden, fontFamily: MONO,
          fontSize: 'clamp(0.58rem,0.95vw,0.76rem)', letterSpacing: '0.28em',
          color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', marginBottom: '6px' }}>
          12.97° N · 77.59° E
        </p>
        <p className="so-s2-label" style={{ ...hidden, fontFamily: MONO,
          fontSize: '7px', letterSpacing: '0.50em',
          color: 'rgba(255,255,255,0.20)', textTransform: 'uppercase' }}>
          Bengaluru · Descending
        </p>
      </div>

      {/* ── SCENE 3 — City reveal ────────────────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col justify-end pb-[24vh] pl-[8vw] sm:pl-[12vw]">
        <p className="so-s3-line1 text-white" style={{ ...hidden, fontFamily: SERIF,
          fontWeight: 300, fontStyle: 'italic',
          fontSize: 'clamp(1.5rem,3.2vw,2.8rem)', lineHeight: 1.22, maxWidth: '22ch' }}>
          A city is more than infrastructure.
        </p>
        <p className="so-s3-line2 mt-4" style={{ ...hidden, fontFamily: MONO,
          fontSize: 'clamp(0.82rem,1.7vw,1.45rem)', letterSpacing: '0.14em',
          color: 'rgba(0,238,255,0.85)', textTransform: 'uppercase' }}>
          It is data.
        </p>
      </div>

      {/* ── SCENE 4 — Story labels ───────────────────────────────────────── */}
      <StoryLabel cls="so-s4a" accent="rgba(0,180,255,0.88)"
        tag="01 — Urban Infrastructure"
        headline="The skeleton of a living city."
        desc="Real-time monitoring of power grids, water networks, and structural integrity across all districts." />
      <StoryLabel cls="so-s4b" accent="rgba(255,140,0,0.88)"
        tag="02 — Climate Monitoring"
        headline="Heat. Air. Water. Measured."
        desc="Distributed sensor arrays track microclimate data, pollution indices, and urban heat island effects." />
      <StoryLabel cls="so-s4c" accent="rgba(255,210,0,0.88)"
        tag="03 — Traffic Intelligence"
        headline="Movement, modelled in real time."
        desc="AI-driven traffic prediction adapts signal timing and reroutes flows before congestion forms." />
      <StoryLabel cls="so-s4d" accent="rgba(255,50,50,0.88)"
        tag="04 — Emergency Systems"
        headline="City-wide awareness. Zero delay."
        desc="Unified emergency dispatch connects fire, medical, and civic response into one coordinated network." />

      {/* ── SCENE 5 — CTA ────────────────────────────────────────────────── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
        <Link href="/explore" className="so-s5-btn pointer-events-auto group"
          style={{ ...hidden, fontFamily: MONO,
            fontSize: 'clamp(0.66rem,1.0vw,0.86rem)', letterSpacing: '0.40em',
            textTransform: 'uppercase', color: '#ffffff',
            border: '1px solid rgba(255,255,255,0.28)', padding: '18px 50px',
            background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)',
            transition: 'background 0.35s ease, border-color 0.35s ease' }}>
          Enter Syncity
          <span className="group-hover:translate-x-1 inline-block transition-transform duration-300 ml-3"
            style={{ opacity: 0.38 }}>→</span>
        </Link>
        <p className="so-s5-sub" style={{ ...hidden, fontFamily: MONO, fontSize: '8px',
          letterSpacing: '0.40em', color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase' }}>
          Bengaluru · Digital Twin Platform
        </p>
      </div>

      <style>{`
        @keyframes soScrollPulse {
          0%,100% { opacity:0.18; transform:scaleY(1); }
          50%      { opacity:0.50; transform:scaleY(1.18); }
        }
      `}</style>
    </div>
  );
}
