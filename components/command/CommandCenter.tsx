'use client';

/**
 * CommandCenter.tsx — SynCity Government Operations Centre
 *
 * Route:     /control
 * Audience:  BBMP officials, DULT, government demo
 * Aesthetic: NASA mission control × Bloomberg terminal — authoritative, dense, zero decorative chrome
 *
 * Layout (100vw × 100vh):
 *   ┌──────────────────────────────────────────────────────┐ 48px
 *   │  TOP BAR — logo · city · LIVE · clock · sys status  │
 *   ├──────────┬───────────────────────────────┬───────────┤
 *   │ 220px    │         flex-1                │  280px    │
 *   │ VITALS   │    CITY MAP (ControlMap)      │ DECISIONS │
 *   │          │    Mapbox traffic flow        │ INCIDENTS │
 *   │          │    junction signals           │           │
 *   ├──────────┴───────────────────────────────┴───────────┤ 52px
 *   │  IMPACT STRIP — vehicles · time · fuel · detected   │
 *   └──────────────────────────────────────────────────────┘
 *
 * Data sources:
 *   - FastAPI backend → fetchDashboard, fetchRecentDecisions, fetchActiveEvents
 *   - Mapbox traffic layer (real GPS-probe congestion) → in ControlMap
 *   - Fallback: time-of-day heuristics when backend is offline
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  fetchDashboard, fetchRecentDecisions, fetchActiveEvents,
  relativeTime, decisionColor,
  type BackendDashboard, type BackendDecision, type BackendEvent, type BackendLocation,
} from '@/services/backendApi';

const ControlMap = dynamic(() => import('./ControlMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%', height: '100%', background: '#0A0F1A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, border: '2px solid rgba(0,238,255,0.5)',
        borderTopColor: 'transparent', borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <span style={{
        fontFamily: "'Space Mono', monospace", fontSize: '10px',
        color: 'rgba(0,238,255,0.5)', letterSpacing: '0.3em', textTransform: 'uppercase',
      }}>Loading City Grid</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  ),
});

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  bg:          '#080C14',
  surface:     'rgba(255,255,255,0.028)',
  border:      'rgba(0,238,255,0.09)',
  borderHover: 'rgba(0,238,255,0.20)',
  cyan:        '#00EEFF',
  green:       '#30D158',
  amber:       '#FF9500',
  red:         '#FF3B30',
  purple:      '#BF5AF2',
  text:        'rgba(255,255,255,0.88)',
  text60:      'rgba(255,255,255,0.60)',
  text35:      'rgba(255,255,255,0.35)',
  text15:      'rgba(255,255,255,0.15)',
  mono:        "'Space Mono', 'Courier New', monospace",
};

// ── Congestion → colour ────────────────────────────────────────────────────────
function cColor(v: number | null): string {
  if (v === null) return C.cyan;
  if (v >= 80)   return C.red;
  if (v >= 55)   return C.amber;
  return C.green;
}

// ── AQI → colour ──────────────────────────────────────────────────────────────
function aqiColor(v: number | null): string {
  if (v === null) return C.cyan;
  if (v >= 150)  return C.red;
  if (v >= 100)  return C.amber;
  return C.green;
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: C.mono, fontSize: '8.5px', fontWeight: 400,
      letterSpacing: '0.32em', textTransform: 'uppercase',
      color: 'rgba(0,238,255,0.35)', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

// ── Single vital metric block ──────────────────────────────────────────────────
function Vital({
  label, value, unit, color, sub,
}: {
  label: string; value: string | number; unit?: string;
  color?: string; sub?: string;
}) {
  return (
    <div style={{
      padding: '10px 12px',
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 3,
      marginBottom: 6,
    }}>
      <div style={{
        fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.28em',
        textTransform: 'uppercase', color: C.text35, marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontFamily: C.mono, fontSize: '26px', fontWeight: 700,
          color: color ?? C.text, lineHeight: 1, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontFamily: C.mono, fontSize: '10px', color: C.text35 }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div style={{
          fontFamily: C.mono, fontSize: '9px', color: C.text35,
          marginTop: 3, letterSpacing: '0.10em',
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Decision row ───────────────────────────────────────────────────────────────
function DecisionRow({ d }: { d: BackendDecision }) {
  const col = decisionColor(d.action_type);
  return (
    <div style={{
      borderLeft: `2px solid ${col}`,
      paddingLeft: 8, paddingTop: 7, paddingBottom: 7,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{
          fontFamily: C.mono, fontSize: '9px', color: col,
          letterSpacing: '0.15em', textTransform: 'uppercase',
        }}>
          {d.action_type.replace('_', ' ')}
        </span>
        <span style={{ fontFamily: C.mono, fontSize: '8px', color: C.text35 }}>
          {relativeTime(d.timestamp)}
        </span>
      </div>
      {d.description && (
        <div style={{
          fontFamily: C.mono, fontSize: '9px', color: C.text60,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {d.description}
        </div>
      )}
    </div>
  );
}

// ── Incident row ───────────────────────────────────────────────────────────────
function IncidentRow({ e }: { e: BackendEvent }) {
  const sevColor = e.severity === 'critical' ? C.red : e.severity === 'high' ? C.amber : C.cyan;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '7px 0', borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: sevColor,
        flexShrink: 0, marginTop: 3,
        boxShadow: `0 0 5px ${sevColor}`,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: C.mono, fontSize: '9px',
          color: C.text60, letterSpacing: '0.10em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {e.event_type.replace(/_/g, ' ')}
        </div>
        {e.description && (
          <div style={{
            fontFamily: C.mono, fontSize: '8.5px', color: C.text35, marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {e.description}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: C.mono, fontSize: '8px', color: C.text35,
        flexShrink: 0, marginLeft: 'auto',
      }}>
        {relativeTime(e.started_at)}
      </span>
    </div>
  );
}

// ── Impact stat (bottom strip) ─────────────────────────────────────────────────
function ImpactStat({
  label, value, color,
}: {
  label: string; value: string; color?: string;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flex: 1,
      borderRight: `1px solid ${C.border}`,
      padding: '0 16px',
    }}>
      <div style={{
        fontFamily: C.mono, fontSize: '18px', fontWeight: 700,
        color: color ?? C.cyan, letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.22em',
        textTransform: 'uppercase', color: C.text35, marginTop: 3,
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Fallback vitals (when backend offline) ─────────────────────────────────────
function buildFallbackVitals() {
  const h = new Date().getHours();
  const isPeak = (h >= 7 && h < 10) || (h >= 17 && h < 20);
  return {
    traffic:   isPeak ? 78 : 45,
    aqi:       112,
    energy:    isPeak ? 82 : 61,
    water:     74,
    incidents: 0,
    decisions: 0,
  };
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CommandCenter() {
  const [clock,       setClock]     = useState('');
  const [dashboard,   setDashboard] = useState<BackendDashboard | null>(null);
  const [decisions,   setDecisions] = useState<BackendDecision[]>([]);
  const [incidents,   setIncidents] = useState<BackendEvent[]>([]);
  const [locations,   setLocations] = useState<BackendLocation[]>([]);
  const [backendUp,   setBackendUp] = useState(false);
  const [lastSync,    setLastSync]  = useState('');
  const feedRef = useRef<HTMLDivElement>(null);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const t = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Asia/Kolkata',
      });
      setClock(`${t} IST`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Data polling ───────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const [dash, decs, evts] = await Promise.all([
      fetchDashboard(),
      fetchRecentDecisions(120),
      fetchActiveEvents(),
    ]);

    if (dash) {
      setDashboard(dash);
      setLocations(dash.locations ?? []);
      setBackendUp(true);
      setLastSync(new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
      }));
    } else {
      setBackendUp(false);
    }

    setDecisions(decs);
    setIncidents(evts);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Auto-scroll decision feed to top on new data
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [decisions]);

  // ── Derive vitals ──────────────────────────────────────────────────────────
  const fallback = buildFallbackVitals();
  const m = dashboard?.metrics;
  const traffic   = m?.avg_congestion  ?? fallback.traffic;
  const aqi       = m?.avg_aqi         ?? fallback.aqi;
  const incidents_count = m?.active_events ?? fallback.incidents;
  const decisions_1h    = m?.decisions_1h  ?? fallback.decisions;
  const mostCongested   = m?.most_congested ?? 'Silk Board';

  // Energy / water: backend doesn't expose these yet → time-based simulation
  const h = new Date().getHours();
  const isPeak = (h >= 7 && h < 10) || (h >= 17 && h < 20);
  const energy = isPeak ? 81 : 63;
  const water  = 74;

  // ── Impact calculations (based on REROUTE decisions) ─────────────────────
  const reroutes      = decisions.filter(d => d.action_type === 'REROUTE').length;
  const vehiclesRerouted = reroutes * 150;
  const minutesSaved     = reroutes * 8;
  const fuelSavedLakh    = (reroutes * 150 * 2 * 8.5 / 100_000).toFixed(1);
  const autoDetected     = incidents.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: '100vw', height: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative',
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 3px; background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,238,255,0.15); border-radius: 2px; }
        .mapboxgl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
        .mapboxgl-popup-tip { display: none !important; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes scanline {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>

      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <header style={{
        height: 48, flexShrink: 0,
        background: 'rgba(8,12,20,0.95)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Scan line sweep */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: '25%', height: '100%',
          background: 'linear-gradient(to right, transparent, rgba(0,238,255,0.04), transparent)',
          animation: 'scanline 4s linear infinite',
          pointerEvents: 'none',
        }} />

        {/* Logo mark */}
        <div style={{
          width: 28, height: 28, borderRadius: 2, flexShrink: 0,
          border: `1px solid rgba(0,238,255,0.30)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 10, height: 10, transform: 'rotate(45deg)',
            border: `1.5px solid rgba(0,238,255,0.70)`,
          }} />
        </div>

        {/* Brand */}
        <div style={{ flexShrink: 0 }}>
          <div style={{
            fontFamily: C.mono, fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.35em', color: C.cyan, textTransform: 'uppercase',
          }}>
            SynCity Command
          </div>
          <div style={{
            fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.22em',
            color: C.text35, textTransform: 'uppercase', marginTop: 1,
          }}>
            Bangalore Urban Intelligence
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 28, width: 1, background: C.border, flexShrink: 0 }} />

        {/* Nav links */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { label: 'Explore', href: '/explore' },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Simulation', href: '/simulation' },
          ].map(({ label, href }) => (
            <Link key={href} href={href} style={{
              fontFamily: C.mono, fontSize: '9px', letterSpacing: '0.20em',
              textTransform: 'uppercase', color: C.text35,
              textDecoration: 'none', padding: '4px 8px',
              border: `1px solid transparent`,
              borderRadius: 2, transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.color = C.cyan;
              (e.target as HTMLElement).style.borderColor = C.border;
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.color = C.text35;
              (e.target as HTMLElement).style.borderColor = 'transparent';
            }}>
              {label}
            </Link>
          ))}
        </div>

        {/* Right — status + clock */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {/* Backend status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: backendUp ? C.green : C.amber,
              boxShadow: `0 0 6px ${backendUp ? C.green : C.amber}`,
              animation: 'blink 2s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: C.mono, fontSize: '9px', color: C.text35, letterSpacing: '0.15em' }}>
              {backendUp ? `ENGINE ONLINE${lastSync ? ` · ${lastSync}` : ''}` : 'FALLBACK MODE'}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: 20, width: 1, background: C.border }} />

          {/* Live indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%', background: C.red,
              boxShadow: `0 0 5px ${C.red}`, animation: 'blink 1.2s ease-in-out infinite',
            }} />
            <span style={{ fontFamily: C.mono, fontSize: '9px', color: C.text60, letterSpacing: '0.20em' }}>
              LIVE
            </span>
          </div>

          {/* Clock */}
          <span style={{
            fontFamily: C.mono, fontSize: '11px', fontWeight: 700,
            color: C.text, letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums',
          }}>
            {clock}
          </span>
        </div>
      </header>

      {/* ── MAIN BODY ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── LEFT — Vitals panel ─────────────────────────────────────────── */}
        <aside style={{
          width: 220, flexShrink: 0,
          background: 'rgba(8,12,20,0.92)',
          borderRight: `1px solid ${C.border}`,
          padding: '14px 10px',
          overflowY: 'auto', overflowX: 'hidden',
          display: 'flex', flexDirection: 'column', gap: 0,
        }}>
          <SectionLabel>City Vitals</SectionLabel>

          <Vital
            label="Traffic Index"
            value={traffic !== null ? Math.round(traffic) : '—'}
            unit="/100"
            color={cColor(traffic)}
            sub={`Peak: ${mostCongested}`}
          />
          <Vital
            label="Air Quality (AQI)"
            value={aqi !== null ? Math.round(aqi) : '—'}
            color={aqiColor(aqi)}
            sub={aqi !== null ? (aqi >= 150 ? 'Unhealthy' : aqi >= 100 ? 'Moderate' : 'Good') : 'No data'}
          />
          <Vital
            label="Energy Load"
            value={energy}
            unit="%"
            color={energy >= 85 ? C.red : energy >= 70 ? C.amber : C.green}
            sub={isPeak ? 'Peak demand window' : 'Off-peak'}
          />
          <Vital
            label="Water Flow"
            value={water}
            unit="%"
            color={water < 60 ? C.red : water < 75 ? C.amber : C.green}
            sub="Cauvery + borewells"
          />

          {/* Divider */}
          <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
          <SectionLabel>Operations</SectionLabel>

          <Vital
            label="Active Incidents"
            value={incidents_count}
            color={incidents_count >= 3 ? C.red : incidents_count >= 1 ? C.amber : C.green}
            sub="Auto-detected by engine"
          />
          <Vital
            label="Decisions (2h)"
            value={decisions_1h}
            color={C.cyan}
            sub="Rule + RL hybrid"
          />

          {/* Divider */}
          <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
          <SectionLabel>System</SectionLabel>

          {/* Monitor points */}
          <div style={{
            padding: '8px 12px', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 3, marginBottom: 6,
          }}>
            <div style={{
              fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.24em',
              textTransform: 'uppercase', color: C.text35, marginBottom: 4,
            }}>Monitor Points</div>
            <div style={{
              fontFamily: C.mono, fontSize: '20px', fontWeight: 700,
              color: C.cyan, letterSpacing: '-0.01em',
            }}>
              {dashboard?.monitor_points ?? 10}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: '9px', color: C.text35, marginTop: 2 }}>
              Live sensor feeds
            </div>
          </div>

          {/* Alerts from backend */}
          {(dashboard?.alerts ?? []).slice(0, 3).map((a, i) => (
            <div key={i} style={{
              padding: '7px 10px', marginBottom: 4,
              background: 'rgba(255,59,48,0.06)',
              border: `1px solid rgba(255,59,48,0.18)`,
              borderRadius: 3,
            }}>
              <div style={{
                fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.18em',
                textTransform: 'uppercase', marginBottom: 2,
                color: a.level === 'critical' ? C.red : a.level === 'warning' ? C.amber : C.cyan,
              }}>
                ▲ {a.level}
              </div>
              <div style={{
                fontFamily: C.mono, fontSize: '8.5px', color: C.text35,
                lineHeight: 1.4,
              }}>
                {a.message}
              </div>
            </div>
          ))}

          {/* Trigger button */}
          <button
            onClick={refresh}
            style={{
              marginTop: 8, width: '100%', padding: '8px',
              background: 'rgba(0,238,255,0.05)',
              border: `1px solid rgba(0,238,255,0.18)`,
              borderRadius: 3, cursor: 'pointer',
              fontFamily: C.mono, fontSize: '9px', letterSpacing: '0.22em',
              textTransform: 'uppercase', color: C.cyan,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget).style.background = 'rgba(0,238,255,0.10)'; }}
            onMouseLeave={e => { (e.currentTarget).style.background = 'rgba(0,238,255,0.05)'; }}
          >
            ↻  Refresh
          </button>
        </aside>

        {/* ── CENTER — City Map ────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ControlMap locations={locations} incidents={incidents} />

          {/* Pilot corridor labels — overlay on map */}
          <div style={{
            position: 'absolute', bottom: 36, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', gap: 8, pointerEvents: 'none',
          }}>
            {[
              { name: 'Corridor A', route: 'Silk Board → EC', active: true },
              { name: 'Corridor B', route: 'Hebbal → ORR',    active: true },
              { name: 'Corridor C', route: 'MG Road → Trinity', active: false },
            ].map(({ name, route, active }) => (
              <div key={name} style={{
                background: 'rgba(8,12,20,0.85)', backdropFilter: 'blur(10px)',
                border: `1px solid ${active ? 'rgba(0,238,255,0.22)' : C.border}`,
                borderRadius: 3, padding: '5px 10px',
                fontFamily: C.mono, fontSize: '8.5px',
              }}>
                <span style={{
                  color: active ? C.cyan : C.text35,
                  letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>
                  {name}
                </span>
                <span style={{ color: C.text35, marginLeft: 6 }}>{route}</span>
                {active && (
                  <span style={{
                    marginLeft: 6, color: C.green, fontSize: '7px',
                    letterSpacing: '0.22em', textTransform: 'uppercase',
                  }}>
                    ● Active
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT — Decision feed + Incidents ───────────────────────────── */}
        <aside style={{
          width: 280, flexShrink: 0,
          background: 'rgba(8,12,20,0.92)',
          borderLeft: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Decision engine feed */}
          <div style={{
            flex: '0 0 auto',
            maxHeight: '55%',
            display: 'flex', flexDirection: 'column',
            borderBottom: `1px solid ${C.border}`,
            padding: '12px 12px 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionLabel>Decision Engine</SectionLabel>
              <div style={{
                fontFamily: C.mono, fontSize: '7.5px',
                color: backendUp ? C.green : C.text35,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                {backendUp ? '● Running' : '○ Offline'}
              </div>
            </div>

            <div
              ref={feedRef}
              style={{ overflowY: 'auto', overflowX: 'hidden', paddingBottom: 12 }}
            >
              {decisions.length === 0 ? (
                <div style={{
                  fontFamily: C.mono, fontSize: '9px', color: C.text35,
                  textAlign: 'center', padding: '20px 0', letterSpacing: '0.15em',
                }}>
                  {backendUp ? 'Awaiting first cycle…' : 'Backend offline — start FastAPI server'}
                </div>
              ) : (
                decisions.map(d => <DecisionRow key={d.id} d={d} />)
              )}
            </div>
          </div>

          {/* Active incidents */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '12px 12px 0', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionLabel>Active Incidents</SectionLabel>
              {incidents.length > 0 && (
                <span style={{
                  fontFamily: C.mono, fontSize: '8px',
                  background: 'rgba(255,59,48,0.15)',
                  border: '1px solid rgba(255,59,48,0.30)',
                  color: C.red, borderRadius: 2,
                  padding: '1px 6px', letterSpacing: '0.15em',
                }}>
                  {incidents.length}
                </span>
              )}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 12 }}>
              {incidents.length === 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '12px 0',
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: C.green, boxShadow: `0 0 5px ${C.green}`,
                  }} />
                  <span style={{
                    fontFamily: C.mono, fontSize: '9px',
                    color: C.text35, letterSpacing: '0.12em',
                  }}>
                    No active incidents
                  </span>
                </div>
              ) : (
                incidents.map(e => <IncidentRow key={e.id} e={e} />)
              )}
            </div>
          </div>

          {/* Pilot info card */}
          <div style={{
            margin: 10, padding: '8px 10px',
            background: 'rgba(0,238,255,0.04)',
            border: `1px solid rgba(0,238,255,0.12)`,
            borderRadius: 3, flexShrink: 0,
          }}>
            <div style={{
              fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.25em',
              textTransform: 'uppercase', color: 'rgba(0,238,255,0.45)', marginBottom: 5,
            }}>
              Pilot Proposal · 90 Days
            </div>
            <div style={{
              fontFamily: C.mono, fontSize: '8.5px', color: C.text35,
              lineHeight: 1.5,
            }}>
              3 corridors · Adaptive signals<br />
              BBMP infrastructure integration<br />
              Target: 15% congestion reduction
            </div>
          </div>
        </aside>
      </div>

      {/* ── BOTTOM — Impact strip ────────────────────────────────────────────── */}
      <footer style={{
        height: 52, flexShrink: 0,
        background: 'rgba(8,12,20,0.95)',
        borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'stretch',
      }}>
        <ImpactStat
          label="Vehicles Rerouted"
          value={vehiclesRerouted > 0 ? vehiclesRerouted.toLocaleString('en-IN') : '—'}
          color={C.cyan}
        />
        <ImpactStat
          label="Minutes Saved (avg)"
          value={minutesSaved > 0 ? `${minutesSaved}m` : '—'}
          color={C.green}
        />
        <ImpactStat
          label="Fuel Savings"
          value={parseFloat(fuelSavedLakh) > 0 ? `₹${fuelSavedLakh}L` : '—'}
          color={C.amber}
        />
        <ImpactStat
          label="Auto-Detected Events"
          value={String(autoDetected || 0)}
          color={autoDetected > 0 ? C.red : C.text35}
        />
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 16px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: C.mono, fontSize: '8px', letterSpacing: '0.30em',
              textTransform: 'uppercase', color: C.text35,
            }}>
              SynCity · Bangalore Urban Intelligence Platform
            </div>
            <div style={{
              fontFamily: C.mono, fontSize: '7.5px', color: 'rgba(0,238,255,0.25)',
              letterSpacing: '0.18em', marginTop: 2,
            }}>
              12.9716°N · 77.5946°E · {new Date().getFullYear()}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
