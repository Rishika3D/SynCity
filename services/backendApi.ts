/**
 * services/backendApi.ts
 *
 * Typed client for the SynCity FastAPI backend (http://localhost:8000).
 *
 * Every function falls back silently if the backend is offline so the
 * frontend never crashes when running without the Python server.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const API      = `${BASE_URL}/api/v1`;

// ─── Types matching FastAPI response schemas ───────────────────────────────────

export interface BackendLocation {
  location_id:     number;
  name:            string;
  lat:             number;
  lng:             number;
  congestion_level: number | null;
  vehicle_count:   number | null;
  avg_speed_kmh:   number | null;
  aqi:             number | null;
  temperature:     number | null;
  humidity:        number | null;
  timestamp:       string | null;
}

export interface BackendEvent {
  id:           number;
  location_id:  number | null;
  event_type:   string;
  severity:     string;
  description:  string | null;
  started_at:   string;
}

export interface BackendDecision {
  id:               number;
  action_type:      string;
  location_id:      number | null;
  description:      string | null;
  timestamp:        string;
}

export interface BackendDashboard {
  timestamp:       string;
  monitor_points:  number;
  metrics: {
    avg_congestion:  number | null;
    max_congestion:  number | null;
    avg_aqi:         number | null;
    max_aqi:         number | null;
    active_events:   number;
    decisions_1h:    number;
    most_congested:  string | null;
  };
  locations:         BackendLocation[];
  active_events:     BackendEvent[];
  recent_decisions:  BackendDecision[];
  alerts: Array<{ level: string; message: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function get<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),  // 5s timeout — never hang the UI
    ...options,
  });
  if (!res.ok) throw new Error(`Backend ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    body ? JSON.stringify(body) : undefined,
    signal:  AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Backend POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Latest traffic reading for every monitored location.
 * Returns [] silently if the backend is offline.
 */
export async function fetchTrafficCurrent(): Promise<BackendLocation[]> {
  try {
    return await get<BackendLocation[]>('/traffic/current');
  } catch {
    return [];
  }
}

/**
 * Latest environment + traffic snapshot for every location.
 * Powers the dashboard map overlay and stats panel enrichment.
 */
export async function fetchDashboard(): Promise<BackendDashboard | null> {
  try {
    return await get<BackendDashboard>('/dashboard/');
  } catch {
    return null;
  }
}

/**
 * All currently active events (accidents, congestion spikes, closures).
 */
export async function fetchActiveEvents(): Promise<BackendEvent[]> {
  try {
    return await get<BackendEvent[]>('/events/?active_only=true&limit=20');
  } catch {
    return [];
  }
}

/**
 * Decisions logged by the decision engine in the last N minutes.
 */
export async function fetchRecentDecisions(sinceMinutes = 30): Promise<BackendDecision[]> {
  try {
    return await get<BackendDecision[]>(
      `/decisions/?since_minutes=${sinceMinutes}&limit=10`,
    );
  } catch {
    return [];
  }
}

/**
 * Manually trigger a decision engine cycle.
 * Used by the Simulation page "Run" button.
 */
export async function triggerDecisionCycle(): Promise<BackendDecision[]> {
  try {
    return await post<BackendDecision[]>('/decisions/run-cycle');
  } catch {
    return [];
  }
}

/**
 * Ingest a traffic data point (for testing / manual override).
 */
export async function ingestTraffic(payload: {
  location_id:      number;
  congestion_level: number;
  vehicle_count?:   number;
  avg_speed_kmh?:   number;
  source?:          string;
}): Promise<void> {
  try {
    await post('/traffic/', payload);
  } catch {
    // silently ignore — non-critical
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Human-readable "X min ago" label from an ISO timestamp string. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

/** CSS color for a congestion level (0-100). */
export function congestionColor(level: number | null): string {
  if (level === null) return '#00EEFF';
  if (level >= 80)   return '#FF2222';
  if (level >= 60)   return '#FF7722';
  if (level >= 35)   return '#FFCC00';
  return '#00FF88';
}

/** CSS color for a decision action type. */
export function decisionColor(actionType: string): string {
  switch (actionType) {
    case 'EMERGENCY_REROUTE':  return '#FF2222';
    case 'REROUTE':            return '#FF7722';
    case 'SIGNAL_ADJUST':      return '#FFCC00';
    case 'ENVIRONMENTAL_ALERT':return '#AA44FF';
    case 'CONGESTION_WARNING': return '#00EEFF';
    default:                   return 'rgba(255,255,255,0.4)';
  }
}
