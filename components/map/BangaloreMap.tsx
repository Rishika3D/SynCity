'use client';

/**
 * BangaloreMap — LP5-style dark aerial map of Bangalore.
 *
 * Behaviour:
 *  • CartoDB Dark Matter tiles — zero API key
 *  • 45° pitched aerial view, slight bearing for depth
 *  • `started` prop triggers the cinematic flythrough (drone approach)
 *  • 10 neighbourhood POI markers — hover reveals fact card
 *  • LP5-style top bar: count badge | SYNCITY › | count badge
 *  • Drag / scroll to explore freely after flythrough
 *  • Edge vignette frames the map; heavier blur on info slides
 */

import { useEffect, useRef, useState } from 'react';

/* ── Cinematic text sequence (LP5 "FULL OF SURPRISES" equivalent) ─────────── */
interface Slide {
  text  : string;
  sub  ?: string;
  large?: boolean;
  warm ?: boolean;
}

const SEQUENCE: Slide[] = [
  { text: '13.6 MILLION',           sub: 'People call it home' },
  { text: "INDIA'S SILICON VALLEY", sub: '2,000+ startups · $110B tech economy' },
  { text: '920 METRES',             sub: 'Above sea level — the garden city' },
  { text: 'WELCOME TO BANGALORE',   large: true, warm: true },
];

/* ── Neighbourhood points-of-interest ────────────────────────────────────── */
interface POI {
  id       : string;
  name     : string;
  coords   : [number, number];
  category : string;
  fact     : string;
  stat     : string;
}

const POIS: POI[] = [
  {
    id      : 'koramangala',
    name    : 'Koramangala',
    coords  : [77.6271, 12.9279],
    category: 'Innovation',
    fact    : "2,000+ startups were founded here. India's densest entrepreneurial neighbourhood.",
    stat    : '#1 startup district in Asia',
  },
  {
    id      : 'whitefield',
    name    : 'Whitefield',
    coords  : [77.7500, 12.9698],
    category: 'Technology',
    fact    : '450,000 tech professionals commute here daily. Hosts global HQs of 180+ IT giants.',
    stat    : '9 million sq ft of office space',
  },
  {
    id      : 'mgroad',
    name    : 'MG Road',
    coords  : [77.6070, 12.9752],
    category: 'Heritage',
    fact    : "Bangalore's commercial spine since 1905. Named after Mahatma Gandhi in 1948.",
    stat    : '3.2 km corridor · Est. 1905',
  },
  {
    id      : 'eleccity',
    name    : 'Electronic City',
    coords  : [77.6599, 12.8399],
    category: 'Technology',
    fact    : 'Home to Infosys HQ. 9M sq ft of IT parks with 150,000 on-site employees.',
    stat    : '₹15,000 Cr annual output',
  },
  {
    id      : 'indiranagar',
    name    : 'Indiranagar',
    coords  : [77.6410, 12.9784],
    category: 'Culture',
    fact    : "300+ restaurants on 100 Feet Road in 1.2 km. Bangalore's cultural heartbeat.",
    stat    : 'Highest café density in India',
  },
  {
    id      : 'hsr',
    name    : 'HSR Layout',
    coords  : [77.6411, 12.9116],
    category: 'Innovation',
    fact    : "India's densest startup cluster. 500+ registered companies in 4 sq km.",
    stat    : '12 unicorns born here',
  },
  {
    id      : 'hebbal',
    name    : 'Hebbal',
    coords  : [77.5961, 13.0435],
    category: 'Infrastructure',
    fact    : "12 flyovers in a 2 km radius. Gateway to North Bangalore's fastest-growing zone.",
    stat    : '18-lane expressway junction',
  },
  {
    id      : 'yelahanka',
    name    : 'Yelahanka',
    coords  : [77.5975, 13.1007],
    category: 'Defence',
    fact    : 'DRDO research labs + HAL Airport. Aerospace & defence R&D hub since independence.',
    stat    : 'Est. 1947 — HAL air base',
  },
  {
    id      : 'jayanagar',
    name    : 'Jayanagar',
    coords  : [77.5833, 12.9253],
    category: 'Residential',
    fact    : "BDA's largest planned residential layout — 4.5 sq km of tree-lined boulevards.",
    stat    : 'Planned 1954 · 700,000 residents',
  },
  {
    id      : 'ubcity',
    name    : 'UB City',
    coords  : [77.5967, 12.9718],
    category: 'Commerce',
    fact    : '1.2M sq ft of luxury commercial & retail. Highest real-estate density in Karnataka.',
    stat    : '₹800 Cr flagship development',
  },
];

const CAT: Record<string, string> = {
  Innovation    : '#4A90D9',
  Technology    : '#7C6CE8',
  Heritage      : '#D4A87A',
  Culture       : '#2ECC8A',
  Infrastructure: '#E67E22',
  Defence       : '#E74C3C',
  Residential   : '#1ABC9C',
  Commerce      : '#F5C518',
};

/* ── Util ── */
function hexTriplet(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/* ── CSS keyframes injected once ───────────────────────────────────────────── */
const GLOBAL_STYLES = `
  @keyframes scrimIn   { from { opacity:0; } to { opacity:1; } }
  @keyframes scrimOut  { from { opacity:1; } to { opacity:0; } }

  @keyframes textIn {
    from { opacity:0; transform:translateY(24px) scale(0.95); filter:blur(8px);  }
    to   { opacity:1; transform:translateY(0)    scale(1);    filter:blur(0px);  }
  }
  @keyframes textOut {
    from { opacity:1; transform:translateY(0)     scale(1);    filter:blur(0px); }
    to   { opacity:0; transform:translateY(-20px) scale(1.05); filter:blur(6px); }
  }
  @keyframes subIn  { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes subOut { from { opacity:1; transform:translateY(0);     } to { opacity:0; transform:translateY(-12px); } }

  @keyframes ruleIn  { from { opacity:0; transform:scaleX(0); } to { opacity:1; transform:scaleX(1); } }
  @keyframes ruleOut { from { opacity:1; transform:scaleX(1); } to { opacity:0; transform:scaleX(0); } }

  @keyframes factCardIn {
    from { opacity:0; transform:translateY(6px) scale(0.97); }
    to   { opacity:1; transform:translateY(0)   scale(1);    }
  }
`;

/* ── Component ─────────────────────────────────────────────────────────────── */
interface Props { started: boolean; }

export default function BangaloreMap({ started }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const flyDidRun    = useRef(false);

  const [hovered,   setHovered]   = useState<POI | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  const [slideIdx, setSlideIdx] = useState<number>(-1);
  const [slideOut, setSlideOut] = useState(false);

  /* ── Mount MapLibre ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    (async () => {
      const { default: maplibregl } = await import('maplibre-gl');
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container : containerRef.current,
        style     : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center    : [77.5946, 12.9716],
        zoom      : 11.5,
        pitch     : 45,
        bearing   : -20,
        attributionControl: false,
      });

      mapRef.current = map;

      map.on('load', () => {
        if (cancelled) return;

        POIS.forEach(poi => {
          const color = CAT[poi.category] ?? '#4A90D9';
          const el    = document.createElement('div');

          el.style.cssText = `
            width:12px; height:12px; border-radius:50%;
            background:${color};
            border:2px solid rgba(255,255,255,0.40);
            cursor:pointer;
            transition:transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
            box-shadow:0 0 10px ${color}90, 0 0 22px ${color}40;
          `;

          el.addEventListener('mouseenter', () => {
            el.style.transform   = 'scale(2.2)';
            el.style.borderColor = 'rgba(255,255,255,0.90)';
            el.style.boxShadow   = `0 0 16px ${color}, 0 0 32px ${color}80`;
            setHovered(poi);
          });
          el.addEventListener('mouseleave', () => {
            el.style.transform   = 'scale(1)';
            el.style.borderColor = 'rgba(255,255,255,0.40)';
            el.style.boxShadow   = `0 0 10px ${color}90, 0 0 22px ${color}40`;
            setHovered(null);
          });

          new maplibregl.Marker({ element: el })
            .setLngLat(poi.coords)
            .addTo(map);
        });
      });

      map.on('mousemove', (e: any) => {
        setCursorPos({ x: e.point.x, y: e.point.y });
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── Cinematic flythrough ──────────────────────────────────────────── */
  useEffect(() => {
    if (!started || flyDidRun.current) return;

    const fly = () => {
      if (!mapRef.current || flyDidRun.current) return;
      flyDidRun.current = true;

      const map = mapRef.current;
      map.flyTo({
        center  : [77.5946, 12.9716],
        zoom    : 13.2,
        pitch   : 48,
        bearing : -12,
        duration: 6000,
        easing  : (t: number) => 1 - Math.pow(1 - t, 3),
      });

      setTimeout(() => {
        map.easeTo({
          center  : [77.6271, 12.9500],
          zoom    : 13.0,
          bearing : -6,
          pitch   : 45,
          duration: 4500,
          easing  : (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        });
      }, 6500);
    };

    if (mapRef.current?.loaded()) {
      fly();
    } else if (mapRef.current) {
      mapRef.current.on('load', fly);
    } else {
      const check = setInterval(() => {
        if (mapRef.current) {
          clearInterval(check);
          if (mapRef.current.loaded()) fly();
          else mapRef.current.on('load', fly);
        }
      }, 80);
    }
  }, [started]);

  /* ── Text sequence ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!started) return;

    const HOLD    = 2000;
    const OUT_DUR =  500;

    let idx = 0;
    setSlideIdx(0);
    setSlideOut(false);

    let timerId: ReturnType<typeof setTimeout>;

    const advance = () => {
      setSlideOut(true);
      setTimeout(() => {
        idx += 1;
        if (idx < SEQUENCE.length) {
          setSlideIdx(idx);
          setSlideOut(false);
          timerId = setTimeout(advance, HOLD);
        } else {
          setSlideIdx(-1);
        }
      }, OUT_DUR);
    };

    timerId = setTimeout(advance, HOLD);
    return () => clearTimeout(timerId);
  }, [started]);

  /* ── Helpers ───────────────────────────────────────────────────────── */
  const cardLeft = containerRef.current
    ? Math.min(cursorPos.x + 20, containerRef.current.clientWidth - 310)
    : cursorPos.x + 20;
  const cardTop = Math.max(cursorPos.y - 60, 8);

  const techCount    = POIS.filter(p => ['Innovation', 'Technology'].includes(p.category)).length;
  const cultureCount = POIS.filter(p => !['Innovation', 'Technology'].includes(p.category)).length;

  const slide = slideIdx >= 0 && slideIdx < SEQUENCE.length ? SEQUENCE[slideIdx] : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>

      <style>{GLOBAL_STYLES}</style>

      {/* Map canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Edge vignette — frames the map like LP5 ─────────────── */}
      <div
        style={{
          position    : 'absolute',
          inset       : 0,
          zIndex      : 10,
          pointerEvents: 'none',
          background  : [
            'linear-gradient(to bottom, rgba(6,10,22,0.80) 0%, transparent 20%, transparent 70%, rgba(6,10,22,0.85) 100%)',
            'linear-gradient(to right,  rgba(6,10,22,0.50) 0%, transparent 16%, transparent 84%, rgba(6,10,22,0.50) 100%)',
          ].join(', '),
        }}
      />

      {/* ── Cinematic text sequence overlay ─────────────────────── */}
      {slide && (
        <div
          style={{
            position        : 'absolute',
            inset           : 0,
            zIndex          : 50,
            display         : 'flex',
            flexDirection   : 'column',
            alignItems      : 'center',
            justifyContent  : 'center',
            pointerEvents   : 'none',
            background      : 'rgba(6,10,22,0.70)',
            backdropFilter  : 'blur(10px) saturate(0.55)',
            WebkitBackdropFilter: 'blur(10px) saturate(0.55)',
            animation       : slideOut
              ? 'scrimOut 0.55s ease-in-out both'
              : 'scrimIn  0.55s ease-out both',
          }}
        >
          {/* Inner text block — remounts on each slide for clean animation */}
          <div
            key={slideIdx}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            {/* Main headline */}
            <p
              style={{
                fontFamily   : 'var(--font-bebas), Impact, sans-serif',
                fontSize     : slide.large ? 'clamp(4rem,12vw,12rem)' : 'clamp(3.2rem,9vw,9rem)',
                fontWeight   : 400,
                letterSpacing: slide.large ? '0.06em' : '0.04em',
                lineHeight   : 0.88,
                textTransform: 'uppercase',
                textAlign    : 'center',
                color        : slide.warm ? '#D4A87A' : 'rgba(255,255,255,0.94)',
                margin       : 0,
                padding      : '0 32px',
                textShadow   : slide.warm
                  ? '0 2px 80px rgba(212,168,122,0.45), 0 0 120px rgba(212,168,122,0.20)'
                  : '0 2px 40px rgba(255,255,255,0.14)',
                animation    : slideOut
                  ? 'textOut 0.45s cubic-bezier(0.4,0,1,1) both'
                  : 'textIn  0.75s cubic-bezier(0.22,1,0.36,1) both',
              }}
            >
              {slide.text}
            </p>

            {/* Thin accent rule — LP5 signature touch */}
            <div
              style={{
                width          : slide.large ? '110px' : '44px',
                height         : '1px',
                marginTop      : '22px',
                transformOrigin: 'center',
                background     : slide.warm
                  ? 'linear-gradient(90deg, transparent, rgba(212,168,122,0.55), transparent)'
                  : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.24), transparent)',
                animation      : slideOut
                  ? 'ruleOut 0.35s ease-in both'
                  : 'ruleIn  0.60s ease-out 0.15s both',
              }}
            />

            {/* Sub-line */}
            {slide.sub && (
              <p
                style={{
                  fontFamily   : '"Inter", sans-serif',
                  fontSize     : 'clamp(0.68rem,1.0vw,0.86rem)',
                  fontWeight   : 300,
                  letterSpacing: '0.36em',
                  textTransform: 'uppercase',
                  color        : slide.warm ? 'rgba(212,168,122,0.58)' : 'rgba(255,255,255,0.40)',
                  margin       : '16px 0 0',
                  textAlign    : 'center',
                  animation    : slideOut
                    ? 'subOut 0.38s ease-in both'
                    : 'subIn  0.75s cubic-bezier(0.22,1,0.36,1) 0.20s both',
                }}
              >
                {slide.sub}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── LP5-style minimal top bar ──────────────────────────── */}
      <div
        style={{
          position      : 'absolute',
          top           : 0,
          left          : 0,
          right         : 0,
          zIndex        : 20,
          display       : 'flex',
          justifyContent: 'center',
          alignItems    : 'center',
          padding       : '22px 32px 18px',
          pointerEvents : 'none',
        }}
      >
        {/* Left badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '64px' }}>
          <span style={{ fontFamily: 'var(--font-bebas), Impact, sans-serif', fontSize: '1.35rem', lineHeight: 1, color: 'rgba(255,255,255,0.82)' }}>
            {techCount}
          </span>
          <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '7px', fontWeight: 500, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
            TECH
          </span>
          <svg width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ marginTop: '2px' }}>
            <path d="M1 1L4.5 5L8 1" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>

        {/* Hairline left */}
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.09))', maxWidth: '80px' }} />

        {/* Brand wordmark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '0 28px' }}>
          <span style={{ fontFamily: 'var(--font-bebas), Impact, sans-serif', fontSize: '1.5rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.90)' }}>
            SYNCITY<span style={{ color: '#4A90D9', marginLeft: '3px' }}>›</span>
          </span>
          <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '7px', fontWeight: 400, letterSpacing: '0.36em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)' }}>
            BANGALORE · 12.97°N 77.59°E
          </span>
        </div>

        {/* Hairline right */}
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.09))', maxWidth: '80px' }} />

        {/* Right badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '64px' }}>
          <span style={{ fontFamily: 'var(--font-bebas), Impact, sans-serif', fontSize: '1.35rem', lineHeight: 1, color: 'rgba(255,255,255,0.82)' }}>
            {cultureCount}
          </span>
          <span style={{ fontFamily: '"Inter", sans-serif', fontSize: '7px', fontWeight: 500, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
            CULTURE
          </span>
          <svg width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ marginTop: '2px' }}>
            <path d="M1 1L4.5 5L8 1" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ── Hover fact card ────────────────────────────────────── */}
      {hovered && (
        <div
          style={{
            position           : 'absolute',
            left               : cardLeft,
            top                : cardTop,
            zIndex             : 100,
            background         : 'rgba(6,12,26,0.92)',
            backdropFilter     : 'blur(24px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
            border             : `1px solid ${CAT[hovered.category] ?? '#4A90D9'}40`,
            borderRadius       : '12px',
            padding            : '18px 22px',
            pointerEvents      : 'none',
            minWidth           : '230px',
            maxWidth           : '300px',
            boxShadow          : '0 12px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)',
            animation          : 'factCardIn 0.18s ease-out both',
          }}
        >
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: '9px', fontWeight: 600, letterSpacing: '0.45em', textTransform: 'uppercase', color: CAT[hovered.category] ?? '#4A90D9', margin: '0 0 7px' }}>
            {hovered.category}
          </p>
          <h3 style={{ fontFamily: '"Inter", sans-serif', fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', margin: '0 0 9px', lineHeight: 1.2 }}>
            {hovered.name}
          </h3>
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: '13px', fontWeight: 300, color: 'rgba(178,210,255,0.72)', lineHeight: 1.58, margin: '0 0 12px' }}>
            {hovered.fact}
          </p>
          <p style={{ fontFamily: '"Inter", sans-serif', fontSize: '11px', fontWeight: 700, color: CAT[hovered.category] ?? '#4A90D9', margin: 0 }}>
            {hovered.stat}
          </p>
        </div>
      )}

      {/* ── Module nav buttons (bottom centre, LP5-style) ────── */}
      <div
        style={{
          position      : 'absolute',
          bottom        : '32px',
          left          : '50%',
          transform     : 'translateX(-50%)',
          zIndex        : 20,
          display       : 'flex',
          flexDirection : 'column',
          alignItems    : 'center',
          gap           : '14px',
        }}
      >
        {/* Hairline rule above buttons */}
        <div
          style={{
            width     : '260px',
            height    : '1px',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.10) 70%, transparent)',
          }}
        />

        {/* Buttons row */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {[
            { href: '/explore',    label: 'Explore City', accent: '#4A90D9' },
            { href: '/analytics',  label: 'Analytics',    accent: '#7C6CE8' },
            { href: '/simulation', label: 'Simulation',   accent: '#2ECC8A' },
          ].map(({ href, label, accent }) => (
            <a
              key={href}
              href={href}
              style={{
                fontFamily   : '"Inter", sans-serif',
                fontSize     : '10px',
                fontWeight   : 500,
                letterSpacing: '0.38em',
                textTransform: 'uppercase',
                color        : `rgba(${hexTriplet(accent)},0.78)`,
                background   : `rgba(${hexTriplet(accent)},0.07)`,
                border       : `1px solid rgba(${hexTriplet(accent)},0.28)`,
                borderRadius : '3px',
                padding      : '11px 22px',
                textDecoration: 'none',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                transition   : 'background 0.2s, color 0.2s, border-color 0.2s',
                whiteSpace   : 'nowrap',
              }}
              onMouseEnter={e => {
                const a = e.currentTarget as HTMLAnchorElement;
                a.style.background  = `rgba(${hexTriplet(accent)},0.18)`;
                a.style.color       = accent;
                a.style.borderColor = `rgba(${hexTriplet(accent)},0.60)`;
              }}
              onMouseLeave={e => {
                const a = e.currentTarget as HTMLAnchorElement;
                a.style.background  = `rgba(${hexTriplet(accent)},0.07)`;
                a.style.color       = `rgba(${hexTriplet(accent)},0.78)`;
                a.style.borderColor = `rgba(${hexTriplet(accent)},0.28)`;
              }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Explore hint ───────────────────────────────────────── */}
      <div
        style={{
          position     : 'absolute',
          bottom       : '14px',
          left         : '50%',
          transform    : 'translateX(-50%)',
          fontFamily   : '"Inter", sans-serif',
          fontSize     : '8px',
          fontWeight   : 300,
          letterSpacing: '0.50em',
          textTransform: 'uppercase',
          color        : 'rgba(255,255,255,0.14)',
          pointerEvents: 'none',
          zIndex       : 10,
          whiteSpace   : 'nowrap',
          transition   : 'opacity 0.4s',
          opacity      : hovered ? 0 : 1,
        }}
      >
        Drag to explore · Hover for facts
      </div>

    </div>
  );
}
