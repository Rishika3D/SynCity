'use client';

/**
 * components/hero/HeroOverlay.tsx
 *
 * High-end luxury art installation overlay — pure floating typography,
 * no backgrounds, no panels, no borders.
 *
 * GSAP entrance: nav drop → char-flip title → subtitle fade → footer rise
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';

// ─── Nav links ────────────────────────────────────────────────────────────────

const NAV = [
  { href: '/explore',    label: 'EXPLORE'    },
  { href: '/analytics',  label: 'ANALYTICS'  },
  { href: '/simulation', label: 'SIMULATION' },
] as const;

const TITLE = 'SYNCITY';

// ─── Component ────────────────────────────────────────────────────────────────

export function HeroOverlay() {
  const navRef    = useRef<HTMLDivElement>(null);
  const titleRef  = useRef<HTMLHeadingElement>(null);
  const subRef    = useRef<HTMLParagraphElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.3 });

      // ① Nav drops in from top
      tl.from(navRef.current, {
        y: -32, opacity: 0,
        duration: 1.0, ease: 'power3.out',
      });

      // ② Each character flips up (rotationX)
      const chars = titleRef.current?.querySelectorAll('.char');
      if (chars?.length) {
        tl.from(chars, {
          opacity:         0,
          y:               60,
          rotationX:       -90,
          stagger:         0.055,
          duration:        0.85,
          ease:            'power3.out',
          transformOrigin: '50% 100%',
        }, '-=0.5');
      }

      // ③ Subtitle fades up
      tl.from(subRef.current, {
        opacity: 0, y: 18,
        duration: 0.9, ease: 'power2.out',
      }, '-=0.3');

      // ④ Footer rises
      tl.from(footerRef.current, {
        y: 40, opacity: 0,
        duration: 0.9, ease: 'power3.out',
      }, '-=0.4');
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-between px-4 py-5 sm:p-6 pointer-events-none select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div ref={navRef} className="w-full flex justify-between items-center">

        {/* Brand */}
        <span
          style={{ fontFamily: 'var(--font-inter)' }}
          className="text-[10px] tracking-[0.3em] uppercase text-white/60"
        >
          SYNCITY
        </span>

        {/* Centre nav */}
        <nav className="hidden md:flex items-center">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{ fontFamily: 'var(--font-inter)' }}
              className="text-[9px] uppercase tracking-[0.4em] text-white/40 hover:text-white transition-all duration-300 pointer-events-auto mx-6"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
          <span
            style={{ fontFamily: 'var(--font-inter)' }}
            className="text-[9px] tracking-[0.3em] uppercase text-white/60"
          >
            LIVE
          </span>
        </div>
      </div>

      {/* ── Hero centerpiece (absolutely centred, independent of flex) ──────── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center flex flex-col items-center">

        <h1
          ref={titleRef}
          style={{
            fontFamily:    'var(--font-playfair)',
            fontWeight:    800,
            fontStyle:     'normal',
            perspective:   '900px',
            fontSize:      'clamp(3rem, 14vw, 11rem)',
            letterSpacing: '0.05em',
          }}
          className="whitespace-nowrap text-[#fdfbf7] leading-none
                     drop-shadow-[0_0_60px_rgba(255,255,255,0.1)]"
        >
          {TITLE.split('').map((ch, i) => (
            <span key={i} className="char inline-block">{ch}</span>
          ))}
        </h1>

        <p
          ref={subRef}
          style={{ fontFamily: 'var(--font-inter)', fontWeight: 300, letterSpacing: '0.3em' }}
          className="text-[7px] sm:text-[8px] md:text-[9px] uppercase text-white/35 mt-5 sm:mt-7 px-4 text-center"
        >
          THE LIVING INTELLIGENCE OF A CITY
        </p>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        ref={footerRef}
        className="w-full flex justify-between items-end pb-2 sm:pb-4"
      >
        {/* Left — location (hidden on xs) */}
        <span
          style={{ fontFamily: 'var(--font-inter)' }}
          className="hidden sm:block text-[8px] tracking-[0.3em] uppercase text-white/30"
        >
          BENGALURU
        </span>

        {/* Centre — scroll indicator */}
        <div className="flex flex-col items-center mx-auto sm:mx-0">
          <span
            style={{ fontFamily: 'var(--font-inter)' }}
            className="text-[7px] sm:text-[8px] tracking-[0.4em] sm:tracking-[0.5em] uppercase text-white/40"
          >
            SCROLL
          </span>
          <div className="w-px h-8 sm:h-10 bg-white/20 mt-2 sm:mt-3" />
        </div>

        {/* Right — system status (hidden on xs) */}
        <span
          style={{ fontFamily: 'var(--font-inter)' }}
          className="hidden sm:block text-[8px] tracking-[0.3em] uppercase text-white/30"
        >
          SYSTEMS
        </span>
      </div>

    </div>
  );
}
