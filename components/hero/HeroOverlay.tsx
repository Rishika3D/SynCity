'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';

// ─── Navigation button ────────────────────────────────────────────────────────
function NavBtn({ href, idx, label }: { href: string; idx: string; label: string }) {
  return (
    <Link
      href={href}
      className="
        group flex items-center gap-2 sm:gap-3
        px-4 sm:px-5 py-2 sm:py-2.5
        w-full xs:w-auto
        border border-white/8
        text-white/35 font-mono text-[9.5px] tracking-[0.22em] sm:tracking-[0.28em] uppercase
        hover:text-white/75 hover:border-white/22 hover:bg-white/4
        transition-all duration-500
      "
    >
      <span className="hidden xs:inline text-white/18 group-hover:text-[#00EEFF]/60 transition-colors duration-400">
        {idx}
      </span>
      <span className="hidden xs:inline w-px h-2.5 bg-white/10" />
      {label}
      <span className="ml-auto opacity-0 translate-x-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-400 text-white/30">
        →
      </span>
    </Link>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────
export function HeroOverlay() {
  const navRef    = useRef<HTMLElement>(null);
  const titleRef  = useRef<HTMLHeadingElement>(null);
  const subRef    = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.5 });

      tl.from(navRef.current, {
        y: -50, opacity: 0,
        duration: 1.0, ease: 'power3.out',
      });

      const chars = titleRef.current?.querySelectorAll('.char');
      if (chars?.length) {
        tl.from(chars, {
          opacity: 0,
          y: 60,
          rotationX: -90,
          stagger: 0.055,
          duration: 0.85,
          ease: 'power3.out',
          transformOrigin: '50% 100%',
        }, '-=0.5');
      }

      tl.from(subRef.current, {
        opacity: 0, y: 22,
        duration: 0.8, ease: 'power2.out',
      }, '-=0.3');

      tl.from(footerRef.current, {
        y: 55, opacity: 0,
        duration: 1.0, ease: 'power3.out',
      }, '-=0.5');
    });

    return () => ctx.revert();
  }, []);

  const TITLE = 'SYNCITY';

  return (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none select-none">

      {/* ── Nav bar ─────────────────────────────────────────────────────── */}
      <nav
        ref={navRef}
        className="glass-dark border-b w-full pointer-events-auto
                   flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4"
      >
        {/* Brand */}
        <span className="font-mono text-[10px] tracking-[0.45em] uppercase text-white/30">
          SYNCITY
        </span>

        {/* Nav links — desktop only */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { href: '/explore',    label: 'Explore'    },
            { href: '/analytics',  label: 'Analytics'  },
            { href: '/simulation', label: 'Simulation' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-mono text-[9.5px] tracking-[0.3em] uppercase
                         text-white/28 hover:text-white/65 transition-colors duration-300"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Live status */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00EEFF] opacity-50" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#00EEFF]" />
          </span>
          <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-[#00EEFF]/60">
            Live
          </span>
        </div>
      </nav>

      {/* ── Centre — headline + subtitle ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-5 px-4 w-full overflow-hidden">

        <h1
          ref={titleRef}
          className="w-full text-center font-serif font-bold text-[#F2EDE4] leading-none tracking-tight"
          style={{
            fontSize: 'clamp(2.2rem, 11vw, 10.5rem)',
            perspective: '900px',
            textShadow: '0 0 80px rgba(0,238,255,0.18), 0 0 30px rgba(0,238,255,0.10)',
          }}
        >
          {TITLE.split('').map((ch, i) => (
            <span key={i} className="char inline-block">
              {ch}
            </span>
          ))}
        </h1>

        {/* Subtitle */}
        <div ref={subRef} className="flex items-center gap-3 sm:gap-4">
          <span className="hidden sm:block h-px w-8 bg-white/12" />
          <p className="font-mono text-[8px] sm:text-[9.5px] tracking-[0.18em] sm:tracking-[0.55em] uppercase text-white/28 text-center">
            Urban Intelligence Platform
          </p>
          <span className="hidden sm:block h-px w-8 bg-white/12" />
        </div>
      </div>

      {/* ── Footer bar ──────────────────────────────────────────────────── */}
      <div
        ref={footerRef}
        className="glass-dark border-t w-full pointer-events-auto
                   flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4 gap-4"
      >
        {/* Coordinates — hidden on mobile */}
        <div className="hidden sm:block shrink-0">
          <p className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/18 mb-0.5">
            Location
          </p>
          <p className="font-mono text-[10.5px] text-white/38 tracking-wider tabular-nums">
            12.97°N&thinsp;&thinsp;77.59°E
          </p>
        </div>

        {/* CTA buttons — stacked on mobile, row on xs+ */}
        <div className="flex flex-col xs:flex-row gap-1.5 w-full xs:w-auto mx-auto">
          <NavBtn href="/explore"    idx="01" label="Explore City"   />
          <NavBtn href="/analytics"  idx="02" label="View Analytics" />
          <NavBtn href="/simulation" idx="03" label="Simulation"     />
        </div>

        {/* System status — hidden on mobile */}
        <div className="hidden sm:block text-right shrink-0">
          <p className="font-mono text-[8px] tracking-[0.3em] uppercase text-white/18 mb-0.5">
            Systems
          </p>
          <div className="flex items-center justify-end gap-1.5">
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <p className="font-mono text-[10.5px] text-emerald-400/60 tracking-wider">Online</p>
          </div>
        </div>
      </div>
    </div>
  );
}
