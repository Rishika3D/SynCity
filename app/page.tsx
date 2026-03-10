import dynamic from 'next/dynamic';
import Link from 'next/link';

// Three.js canvas — client only (no SSR)
const HeroCanvas = dynamic(
  () => import('@/components/hero/HeroCanvas'),
  { ssr: false },
);

// ─── Feature data ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    num:    '01',
    title:  'Urban Intelligence',
    body:   "A living map of the city's neural systems — roads, power grids, water networks, and human movement — rendered as a navigable digital twin.",
    detail: '4,200 IoT nodes · Real-time road network · 48-hour prediction horizon',
    symbol: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke="rgba(245,245,247,0.2)" strokeWidth="0.8"/>
        <circle cx="16" cy="16" r="8"  stroke="rgba(245,245,247,0.1)" strokeWidth="0.6" strokeDasharray="2 3"/>
        <circle cx="16" cy="16" r="2.5" fill="rgba(245,245,247,0.3)"/>
        <line x1="16" y1="2"  x2="16" y2="6"  stroke="rgba(245,245,247,0.25)" strokeWidth="0.8"/>
        <line x1="16" y1="26" x2="16" y2="30" stroke="rgba(245,245,247,0.25)" strokeWidth="0.8"/>
        <line x1="2"  y1="16" x2="6"  y2="16" stroke="rgba(245,245,247,0.25)" strokeWidth="0.8"/>
        <line x1="26" y1="16" x2="30" y2="16" stroke="rgba(245,245,247,0.25)" strokeWidth="0.8"/>
      </svg>
    ),
  },
  {
    num:    '02',
    title:  'AI Predictions',
    body:   'Machine learning models trained on five years of city data forecast traffic surges, air quality shifts, and energy demand spikes twelve hours before they occur.',
    detail: 'Traffic · Air Quality · Energy · Weather',
    symbol: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <polyline points="2,26 8,18 14,22 20,10 26,15 30,6" stroke="rgba(245,245,247,0.25)" strokeWidth="1.2" fill="none"/>
        <polyline points="20,10 26,6 30,2" stroke="rgba(245,245,247,0.1)" strokeWidth="1" strokeDasharray="2 2" fill="none"/>
        <circle cx="8"  cy="18" r="1.5" fill="rgba(245,245,247,0.3)"/>
        <circle cx="14" cy="22" r="1.5" fill="rgba(245,245,247,0.3)"/>
        <circle cx="20" cy="10" r="1.5" fill="rgba(245,245,247,0.3)"/>
        <line x1="2" y1="28" x2="30" y2="28" stroke="rgba(245,245,247,0.1)" strokeWidth="0.6"/>
        <line x1="2" y1="4"  x2="2"  y2="28" stroke="rgba(245,245,247,0.1)" strokeWidth="0.6"/>
      </svg>
    ),
  },
  {
    num:    '03',
    title:  'City Simulation',
    body:   "Add a metro corridor, reroute arterial roads, or impose flood conditions — and watch the city's systems recalibrate in real time, revealing cascades of consequence.",
    detail: 'Scenario modelling · Infrastructure stress-testing · Population flow',
    symbol: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="3"  y="16" width="7" height="12" fill="rgba(245,245,247,0.06)" stroke="rgba(245,245,247,0.2)" strokeWidth="0.7"/>
        <rect x="13" y="10" width="7" height="18" fill="rgba(245,245,247,0.06)" stroke="rgba(245,245,247,0.2)" strokeWidth="0.7"/>
        <rect x="23" y="4"  width="7" height="24" fill="rgba(245,245,247,0.06)" stroke="rgba(245,245,247,0.2)" strokeWidth="0.7"/>
        <line x1="2"  y1="28" x2="30" y2="28" stroke="rgba(245,245,247,0.15)" strokeWidth="0.7"/>
      </svg>
    ),
  },
  {
    num:    '04',
    title:  'Infrastructure Monitoring',
    body:   'Continuous surveillance of every water main, power substation, and road segment. Anomalies are flagged seconds after detection, before they escalate.',
    detail: 'Power · Water · Roads · Fibre · Emergency Services',
    symbol: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(245,245,247,0.15)" strokeWidth="0.8"/>
        <path d="M 8 16 Q 12 6 16 16 Q 20 26 24 16" fill="none" stroke="rgba(245,245,247,0.3)" strokeWidth="1.2"/>
        <circle cx="8"  cy="16" r="1.8" fill="rgba(245,245,247,0.25)"/>
        <circle cx="24" cy="16" r="1.8" fill="rgba(245,245,247,0.25)"/>
      </svg>
    ),
  },
];

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ f, idx }: { f: typeof FEATURES[0]; idx: number }) {
  const isEven = idx % 2 === 0;
  return (
    <div className={`flex flex-col sm:flex-row gap-7 sm:gap-20 items-start ${isEven ? '' : 'sm:flex-row-reverse'}`}>
      {/* Icon + number */}
      <div className="shrink-0 flex sm:flex-col items-center sm:items-center gap-4 pt-1">
        <div className="w-14 h-14 flex items-center justify-center rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {f.symbol}
        </div>
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.3em', color: 'rgba(245,245,247,0.2)' }}>
          {f.num}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 max-w-2xl">
        <h3
          style={{ fontFamily: 'var(--font-playfair)', fontWeight: 700, fontSize: 'clamp(1.4rem,2.5vw,2rem)', color: '#f5f5f7', lineHeight: 1.2, marginBottom: '1rem' }}
        >
          {f.title}
        </h3>
        <p style={{ fontFamily: 'var(--font-inter)', fontWeight: 300, fontSize: '1rem', lineHeight: 1.75, color: 'rgba(245,245,247,0.5)', marginBottom: '1.25rem' }}>
          {f.body}
        </p>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', letterSpacing: '0.22em', color: 'rgba(245,245,247,0.22)', textTransform: 'uppercase' }}>
          {f.detail}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <main style={{ background: '#09090b' }}>

      {/* ── Section 1: Hero canvas ─────────────────────────────────────── */}
      <section className="relative h-screen">
        <HeroCanvas />
      </section>

      {/* ── Section 2: Features ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 sm:px-12 py-16 sm:py-32">

        {/* Header */}
        <div className="mb-12 sm:mb-24">
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', color: 'rgba(245,245,247,0.3)', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
            Platform
          </p>
          <h2 style={{ fontFamily: 'var(--font-playfair)', fontWeight: 800, fontSize: 'clamp(2rem,4vw,3.25rem)', color: '#f5f5f7', lineHeight: 1.15, maxWidth: '18ch' }}>
            What the Platform Understands
          </h2>
        </div>

        {/* Feature rows */}
        <div className="flex flex-col gap-0">
          {FEATURES.map((f, i) => (
            <div key={f.num}>
              <FeatureCard f={f} idx={i} />
              {i < FEATURES.length - 1 && (
                <div className="my-10 sm:my-16" style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 3: CTA ────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-40 px-5 sm:px-6 text-center overflow-hidden">
        {/* Subtle glow behind */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{ width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)' }} />
        </div>

        {/* Concentric rings — fewer on mobile */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[160, 280, 420, 580].map((r, i) => (
            <div key={r} className={`absolute rounded-full ${i >= 2 ? 'hidden sm:block' : ''}`}
              style={{ width: r, height: r, border: '1px solid rgba(255,255,255,0.04)' }} />
          ))}
        </div>

        <div className="relative z-10">
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.5em', color: 'rgba(245,245,247,0.3)', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
            Begin
          </p>
          <h2 style={{ fontFamily: 'var(--font-playfair)', fontWeight: 800, fontSize: 'clamp(2.2rem,5vw,4rem)', color: '#f5f5f7', lineHeight: 1.1, marginBottom: '1.25rem' }}>
            The City Awaits Observation
          </h2>
          <p style={{ fontFamily: 'var(--font-inter)', fontWeight: 300, fontSize: '1rem', color: 'rgba(245,245,247,0.4)', maxWidth: '36ch', margin: '0 auto 3rem', lineHeight: 1.75 }}>
            Step into the digital observatory. Monitor, predict, and shape the living intelligence of Bengaluru.
          </p>

          <Link
            href="/explore"
            className="inline-flex items-center gap-3 group"
            style={{
              fontFamily: 'var(--font-inter)',
              fontSize: '11px',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: '#f5f5f7',
              border: '1px solid rgba(255,255,255,0.15)',
              padding: '14px 32px',
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s',
            }}
          >
            Enter City Intelligence
            <span style={{ opacity: 0.4, transition: 'transform 0.3s' }} className="group-hover:translate-x-1">→</span>
          </Link>

          <div className="flex items-center justify-center gap-8 sm:gap-10 mt-8 sm:mt-10">
            {[
              { href: '/analytics',  label: 'Analytics' },
              { href: '/simulation', label: 'Simulation' },
            ].map(({ href, label }) => (
              <Link key={href} href={href}
                style={{ fontFamily: 'var(--font-inter)', fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.28)' }}
                className="hover:text-white/60 transition-colors duration-300"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="px-6 sm:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.25)' }}>
          SYNCITY
        </p>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.2em', color: 'rgba(245,245,247,0.15)' }}>
          Urban Digital Twin · Bengaluru · 12.97°N 77.59°E
        </p>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '9px', letterSpacing: '0.2em', color: 'rgba(245,245,247,0.15)' }}>
          2025
        </p>
      </footer>

    </main>
  );
}
