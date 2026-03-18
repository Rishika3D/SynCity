'use client';

/**
 * SynCity — Cinematic scroll-driven landing page.
 *
 * Layout
 * ──────
 * fixed  → HeroCanvas  (R3F clouds, camera drifts forward on scroll)
 * fixed  → TextOverlay (SYNCITY headline, fades in / fades out mid-scroll)
 * scroll → #hero-scroll   250vh — drives camera through clouds
 *          #city-facts         — Bangalore data strip
 *          #modules            — Platform module cards
 */

import dynamic   from 'next/dynamic';
import Link      from 'next/link';
import { useEffect, useRef } from 'react';
import gsap      from 'gsap';
import { ScrollTrigger }    from 'gsap/ScrollTrigger';

const HeroCanvas = dynamic(
  () => import('@/components/hero/HeroCanvas'),
  {
    ssr    : false,
    loading: () => (
      <div style={{
        position      : 'fixed',
        inset         : 0,
        background    : '#080e1c',
        display       : 'flex',
        alignItems    : 'center',
        justifyContent: 'center',
      }}>
        <span style={{
          fontFamily   : '"Inter", system-ui, sans-serif',
          fontSize     : '9px',
          letterSpacing: '0.55em',
          color        : 'rgba(120,160,255,0.30)',
          textTransform: 'uppercase',
        }}>
          Loading
        </span>
      </div>
    ),
  },
);

// ── Bangalore city facts ──────────────────────────────────────────────────────
const FACTS = [
  { value: '13.6M',  label: 'Population',     sub: 'Metro area 2024' },
  { value: '741',    label: 'Area km²',        sub: 'BBMP jurisdiction' },
  { value: '920m',   label: 'Elevation',       sub: 'Above sea level' },
  { value: '$110B',  label: 'City GDP',        sub: '40% of India IT exports' },
  { value: '12,847', label: 'IoT Sensors',     sub: 'Active city nodes' },
  { value: '210+',   label: 'Lakes',           sub: 'Natural water bodies' },
  { value: '1,537',  label: 'Founded',         sub: 'By Kempe Gowda I' },
  { value: '24°C',   label: 'Avg Temperature', sub: 'Year-round climate' },
];

// ── Module cards ──────────────────────────────────────────────────────────────
const MODULES = [
  {
    href  : '/explore',
    tag   : '01 — Explore',
    title : 'City Twin',
    desc  : 'Navigate a real-time 3D digital replica of Bangalore. Visualise live traffic flow, air quality sensors, weather overlays, and infrastructure health — all layered on an interactive city grid.',
    stats : [
      { v: '6,700+', l: 'BMTC buses tracked' },
      { v: '1,300',  l: 'Traffic signals' },
      { v: 'Live',   l: 'Open-Meteo weather' },
    ],
    accent: '#4A90D9',
  },
  {
    href  : '/analytics',
    tag   : '02 — Analytics',
    title : 'City Intelligence',
    desc  : 'City-wide data aggregation and trend analysis. Monitor pollution, energy consumption, mobility patterns, and population density. Predictive models surface infrastructure issues before they occur.',
    stats : [
      { v: '98.2%', l: 'Sensor uptime' },
      { v: '47ms',  l: 'Avg data latency' },
      { v: '3.2TB', l: 'Daily ingest' },
    ],
    accent: '#6A5ACD',
  },
  {
    href  : '/simulation',
    tag   : '03 — Simulation',
    title : 'Scenario Engine',
    desc  : 'Run what-if scenarios across the digital twin. Model new transit routes, flood events, high-density development, or infrastructure upgrades — and measure city-wide impact before a single brick is laid.',
    stats : [
      { v: '2.4×', l: 'Faster than real-time' },
      { v: '400+', l: 'Model parameters' },
      { v: '95%',  l: 'Scenario accuracy' },
    ],
    accent: '#2ECC8A',
  },
];

// ═════════════════════════════════════════════════════════════════════════════
function TextOverlay() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Fade out as user scrolls through clouds (after 50% progress)
    const st = ScrollTrigger.create({
      trigger : '#hero-scroll',
      start   : 'top top',
      end     : 'bottom top',
      scrub   : 1,
      onUpdate(self) {
        if (!wrapRef.current) return;
        const fade = 1 - Math.max(0, (self.progress - 0.50) / 0.30);
        wrapRef.current.style.opacity = Math.max(0, fade).toFixed(3);
      },
    });

    return () => { st.kill(); };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        position     : 'fixed',
        inset        : 0,
        zIndex       : 10,
        display      : 'flex',
        flexDirection: 'column',
        alignItems   : 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* glassmorphism box gets the CSS fade-in (separate element from wrapRef) */}
      <div style={{
        textAlign      : 'center',
        padding        : '36px 56px',
        background     : 'rgba(8, 14, 28, 0.32)',
        backdropFilter : 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius   : '20px',
        border         : '1px solid rgba(100, 150, 255, 0.14)',
        boxShadow      : '0 0 80px rgba(60,100,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
        animation      : 'heroFadeIn 1.4s ease-out 0.2s both',
      }}>
        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(0.55rem, 0.8vw, 0.68rem)',
          fontWeight   : 500,
          letterSpacing: '0.55em',
          textTransform: 'uppercase',
          color        : 'rgba(120,170,255,0.60)',
          margin       : '0 0 14px',
        }}>
          A living digital twin
        </p>

        <h1 style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(4rem, 10vw, 9.5rem)',
          fontWeight   : 900,
          letterSpacing: '0.04em',
          color        : '#ffffff',
          margin       : 0,
          lineHeight   : 0.88,
          textTransform: 'uppercase',
          textShadow   : '0 0 80px rgba(100,160,255,0.5), 0 0 160px rgba(60,100,255,0.25)',
        }}>
          SYNCITY
        </h1>

        <p style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : 'clamp(0.58rem, 0.85vw, 0.72rem)',
          fontWeight   : 300,
          letterSpacing: '0.30em',
          color        : 'rgba(140,180,255,0.40)',
          margin       : '20px 0 0',
          textTransform: 'uppercase',
        }}>
          Bangalore · 12.97°N · 77.59°E
        </p>
      </div>

      {/* Scroll hint — own CSS fade-in, no conflict with wrapRef */}
      <div style={{
        position     : 'absolute',
        bottom       : '44px',
        display      : 'flex',
        flexDirection: 'column',
        alignItems   : 'center',
        gap          : '10px',
        animation    : 'heroFadeIn 1.4s ease-out 0.5s both',
      }}>
        <span style={{
          fontFamily   : '"Inter", sans-serif',
          fontSize     : '8px',
          fontWeight   : 300,
          letterSpacing: '0.55em',
          textTransform: 'uppercase',
          color        : 'rgba(100,150,255,0.30)',
        }}>
          Scroll
        </span>
        <svg width="12" height="18" viewBox="0 0 12 18" fill="none"
          style={{ animation: 'bounce 2.2s ease-in-out infinite' }}>
          <path d="M6 1 L6 13 M2 9 L6 13 L10 9"
            stroke="rgba(80,130,255,0.28)" strokeWidth="1.1"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <style>{`
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%,100% { transform:translateY(0);   opacity:0.28; }
          50%      { transform:translateY(5px); opacity:0.55; }
        }
      `}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Home() {
  return (
    <main style={{ background: '#060c18', color: '#fff' }}>

      {/* Fixed R3F canvas */}
      <HeroCanvas />

      {/* Fixed text overlay */}
      <TextOverlay />

      {/* ── Scroll spacer — drives HeroCanvas GSAP ScrollTrigger ── */}
      <div id="hero-scroll" style={{ height: '250vh' }} />

      {/* ── Bangalore facts ─────────────────────────────────────── */}
      <section
        id="city-facts"
        style={{
          background : '#0b1221',
          borderTop  : '1px solid rgba(60,100,220,0.14)',
          padding    : 'clamp(64px,8vw,100px) clamp(24px,6vw,80px)',
          position   : 'relative',
          zIndex     : 20,
        }}
      >
        <div style={{ marginBottom: '52px' }}>
          <p style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : '10px',
            fontWeight   : 500,
            letterSpacing: '0.50em',
            textTransform: 'uppercase',
            color        : 'rgba(74,144,217,0.70)',
            margin       : '0 0 14px',
          }}>
            City Profile
          </p>
          <h2 style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : 'clamp(2rem, 4vw, 3.2rem)',
            fontWeight   : 800,
            letterSpacing: '-0.02em',
            margin       : 0,
            color        : '#eef2ff',
          }}>
            Bangalore, India
          </h2>
          <p style={{
            fontFamily: '"Inter", sans-serif',
            fontSize  : 'clamp(0.9rem, 1.4vw, 1.05rem)',
            fontWeight: 300,
            color     : 'rgba(180,200,240,0.55)',
            margin    : '12px 0 0',
            maxWidth  : '520px',
            lineHeight: 1.65,
          }}>
            Silicon Valley of India. Founded in 1537, Bangalore is home to 13.6 million
            people and drives 40% of India&apos;s technology exports — a city redefining
            what an intelligent urban ecosystem can be.
          </p>
        </div>

        <div style={{
          display            : 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap                : '1px',
          background         : 'rgba(60,100,220,0.08)',
          border             : '1px solid rgba(60,100,220,0.10)',
          borderRadius       : '12px',
          overflow           : 'hidden',
        }}>
          {FACTS.map(({ value, label, sub }) => (
            <div key={label} style={{
              background: '#0b1221',
              padding   : 'clamp(20px,2.5vw,32px) clamp(18px,2vw,28px)',
            }}>
              <div style={{
                fontFamily  : '"Inter", sans-serif',
                fontSize    : 'clamp(1.6rem, 2.8vw, 2.2rem)',
                fontWeight  : 800,
                color       : '#b8d0ff',
                lineHeight  : 1,
                marginBottom: '8px',
              }}>
                {value}
              </div>
              <div style={{
                fontFamily  : '"Inter", sans-serif',
                fontSize    : '12px',
                fontWeight  : 500,
                color       : 'rgba(180,210,255,0.70)',
                marginBottom: '4px',
              }}>
                {label}
              </div>
              <div style={{
                fontFamily: '"Inter", sans-serif',
                fontSize  : '10px',
                color     : 'rgba(120,160,220,0.40)',
              }}>
                {sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Module cards ─────────────────────────────────────────── */}
      <section
        id="modules"
        style={{
          background: '#080e1c',
          padding   : 'clamp(64px,8vw,100px) clamp(24px,6vw,80px)',
          position  : 'relative',
          zIndex    : 20,
        }}
      >
        <div style={{ marginBottom: '52px' }}>
          <p style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : '10px',
            fontWeight   : 500,
            letterSpacing: '0.50em',
            textTransform: 'uppercase',
            color        : 'rgba(74,144,217,0.70)',
            margin       : '0 0 14px',
          }}>
            Platform Modules
          </p>
          <h2 style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : 'clamp(2rem, 4vw, 3.2rem)',
            fontWeight   : 800,
            letterSpacing: '-0.02em',
            margin       : 0,
            color        : '#eef2ff',
          }}>
            Understand. Analyse. Simulate.
          </h2>
        </div>

        <div style={{
          display            : 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap                : '24px',
        }}>
          {MODULES.map(({ href, tag, title, desc, stats, accent }) => (
            <Link
              key={href}
              href={href}
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <div
                style={{
                  background  : '#0a1020',
                  border      : `1px solid rgba(${hexToRgb(accent)},0.15)`,
                  borderRadius: '16px',
                  padding     : 'clamp(28px,3vw,40px)',
                  height      : '100%',
                  boxSizing   : 'border-box',
                  transition  : 'border-color 0.25s, transform 0.25s',
                  cursor      : 'pointer',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = `rgba(${hexToRgb(accent)},0.45)`;
                  el.style.transform   = 'translateY(-3px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = `rgba(${hexToRgb(accent)},0.15)`;
                  el.style.transform   = 'translateY(0)';
                }}
              >
                <p style={{
                  fontFamily   : '"Inter", sans-serif',
                  fontSize     : '10px',
                  fontWeight   : 600,
                  letterSpacing: '0.40em',
                  textTransform: 'uppercase',
                  color        : accent,
                  margin       : '0 0 16px',
                }}>
                  {tag}
                </p>

                <h3 style={{
                  fontFamily   : '"Inter", sans-serif',
                  fontSize     : 'clamp(1.4rem, 2.2vw, 1.8rem)',
                  fontWeight   : 800,
                  letterSpacing: '-0.02em',
                  color        : '#eef2ff',
                  margin       : '0 0 16px',
                }}>
                  {title}
                </h3>

                <p style={{
                  fontFamily: '"Inter", sans-serif',
                  fontSize  : '14px',
                  fontWeight: 300,
                  color     : 'rgba(180,200,240,0.55)',
                  lineHeight: 1.70,
                  margin    : '0 0 28px',
                }}>
                  {desc}
                </p>

                <div style={{
                  display  : 'flex',
                  gap      : '24px',
                  paddingTop: '20px',
                  borderTop: `1px solid rgba(${hexToRgb(accent)},0.10)`,
                }}>
                  {stats.map(({ v, l }) => (
                    <div key={l}>
                      <div style={{
                        fontFamily: '"Inter", sans-serif',
                        fontSize  : '1.1rem',
                        fontWeight: 700,
                        color     : accent,
                        lineHeight: 1,
                      }}>
                        {v}
                      </div>
                      <div style={{
                        fontFamily: '"Inter", sans-serif',
                        fontSize  : '10px',
                        color     : 'rgba(140,170,220,0.45)',
                        marginTop : '4px',
                      }}>
                        {l}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop   : '24px',
                  display     : 'flex',
                  alignItems  : 'center',
                  gap         : '8px',
                  color       : accent,
                  fontFamily  : '"Inter", sans-serif',
                  fontSize    : '12px',
                  fontWeight  : 600,
                  letterSpacing: '0.05em',
                }}>
                  <span>Open Module</span>
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{
          marginTop     : '80px',
          paddingTop    : '32px',
          borderTop     : '1px solid rgba(60,100,220,0.08)',
          display       : 'flex',
          justifyContent: 'space-between',
          alignItems    : 'center',
          flexWrap      : 'wrap',
          gap           : '16px',
        }}>
          <span style={{
            fontFamily   : '"Inter", sans-serif',
            fontSize     : '11px',
            color        : 'rgba(120,160,220,0.30)',
            letterSpacing: '0.05em',
          }}>
            SynCity · Urban Intelligence Platform · 12.97°N 77.59°E · Bangalore
          </span>
          <span style={{
            fontFamily: '"Inter", sans-serif',
            fontSize  : '11px',
            color     : 'rgba(120,160,220,0.20)',
          }}>
            Systems Online
          </span>
        </div>
      </section>

    </main>
  );
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
