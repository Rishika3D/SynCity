/**
 * sample.js — Concrete input/output examples.
 *
 * Run with: node lib/decisionEngine/sample.js
 *
 * Shows the full evaluation cycle with a mock DB adapter.
 * No real network calls — everything is stubbed inline.
 */

'use strict';

const engine = require('./index');

// ── Mock DB adapter ────────────────────────────────────────────────────────────
// Returns different congestion depending on WHICH corridor the route passes through.
// In production this comes from PostGIS ST_DWithin spatial query.
//
// We detect the corridor by checking the route geometry coordinates:
//   Route 0 passes near [77.6226, 12.9174] → Silk Board (very congested)
//   Route 1 passes near [77.5468, 12.9254] → Jayanagar  (moderate)
//   Route 2 passes near [77.6938, 13.0086] → KR Puram   (light)

const mockDb = {
  async query(sql, params) {
    const geometryJson = params[0];
    const geometry     = JSON.parse(geometryJson);
    const coords       = geometry.coordinates;

    // Identify corridor by checking for known landmark coordinates
    const hasSilkBoard  = coords.some(([lng, lat]) => Math.abs(lng - 77.6226) < 0.02 && Math.abs(lat - 12.9174) < 0.02);
    const hasJayanagar  = coords.some(([lng, lat]) => Math.abs(lng - 77.5468) < 0.02 && Math.abs(lat - 12.9254) < 0.02);

    let avg_congestion;
    let readings_count = '4';

    if (hasSilkBoard) {
      avg_congestion = '84.5';  // Silk Board: severely congested
    } else if (hasJayanagar) {
      avg_congestion = '41.2';  // Jayanagar: light traffic
    } else {
      avg_congestion = '55.0';  // KR Puram: moderate
    }

    return { rows: [{ avg_congestion, readings_count }] };
  },
};

// ── Route geometry constants ───────────────────────────────────────────────────

const ROUTE_GEOMETRIES = {
  silkBoard:  { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.6226, 12.9174], [77.6603, 12.8458]] },
  jayanagar:  { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.5468, 12.9254], [77.6603, 12.8458]] },
  krPuram:    { type: 'LineString', coordinates: [[77.5946, 12.9716], [77.6938, 13.0086], [77.6603, 12.8458]] },
};

// ── Scenario 1 routes — Normal conditions ─────────────────────────────────────
// Route 0 (Silk Board) is fastest. Congestion moderate at 84 (always busy).

const ROUTES_NORMAL = [
  { duration: 1240, distance: 14800, geometry: ROUTE_GEOMETRIES.silkBoard, legs: [{ summary: 'ORR via Silk Board' }] },
  { duration: 1380, distance: 17200, geometry: ROUTE_GEOMETRIES.jayanagar, legs: [{ summary: 'Bannerghatta Road' }] },
  { duration: 1560, distance: 19400, geometry: ROUTE_GEOMETRIES.krPuram,   legs: [{ summary: 'NH 44 via KR Puram' }] },
];

// ── Scenario 2 routes — Incident at Silk Board ────────────────────────────────
// Mapbox has detected the incident and updated Route 0's ETA to 28 min.
// Route 1 (Jayanagar) is now faster. Congestion data confirms the spike.
//
// Key insight: Mapbox bakes congestion into ETA. When Route 0's congestion
// jumped from 45→82, Mapbox's returned duration for that route increased too.

const ROUTES_INCIDENT = [
  { duration: 1680, distance: 14800, geometry: ROUTE_GEOMETRIES.silkBoard, legs: [{ summary: 'ORR via Silk Board (incident)' }] },
  { duration: 1350, distance: 17200, geometry: ROUTE_GEOMETRIES.jayanagar, legs: [{ summary: 'Bannerghatta Road' }] },
  { duration: 1500, distance: 19400, geometry: ROUTE_GEOMETRIES.krPuram,   legs: [{ summary: 'NH 44 via KR Puram' }] },
];

// ── Scenario 1: First assignment (no active route) ────────────────────────────

async function runScenario1() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCENARIO 1 — First assignment (no active route)');
  console.log('══════════════════════════════════════════════\n');

  const result = await engine.evaluate({
    mapboxRoutes:  ROUTES_NORMAL,
    currentRoute:  null,          // No active route
    lastRerouteAt: null,
    city:          'bangalore',
    db:            mockDb,
  });

  printResult(result);
}

// ── Scenario 2: Active route has degraded — should reroute ────────────────────

async function runScenario2() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCENARIO 2 — Active route degraded (reroute expected)');
  console.log('══════════════════════════════════════════════\n');

  // Driver was assigned Route 0 (Silk Board) 8 min ago — it was fine then.
  // A traffic incident occurred. Mapbox now returns 1680s for Route 0,
  // and our PostGIS sensors show congestion jumped from 45 → 82.
  const currentRoute = {
    routeIndex:         0,
    duration:           1240,   // ETA when originally assigned
    congestion:         82,     // Current sensor reading
    baselineCongestion: 45,     // What it was at assignment time
    score:              0.18,
    geometry:           ROUTE_GEOMETRIES.silkBoard,
  };

  const result = await engine.evaluate({
    mapboxRoutes:  ROUTES_INCIDENT,   // Mapbox now shows Route 0 at 1680s
    currentRoute,
    lastRerouteAt: Date.now() - 8 * 60 * 1000,
    city:          'bangalore',
    db:            mockDb,
  });

  printResult(result);
}

// ── Scenario 3: Cooldown active — should NOT reroute ─────────────────────────

async function runScenario3() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCENARIO 3 — Cooldown active (reroute suppressed)');
  console.log('══════════════════════════════════════════════\n');

  const currentRoute = {
    routeIndex:         0,
    duration:           1680,
    congestion:         82,
    baselineCongestion: 45,
    score:              0.55,
    geometry:           ROUTE_GEOMETRIES.silkBoard,
  };

  const result = await engine.evaluate({
    mapboxRoutes:  ROUTES_INCIDENT,
    currentRoute,
    lastRerouteAt: Date.now() - 90 * 1000,  // Rerouted 90s ago — cooldown = 5 min
    city:          'bangalore',
    db:            mockDb,
  });

  printResult(result);
}

// ── Scenario 4: Minor improvement — should NOT reroute ───────────────────────

async function runScenario4() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SCENARIO 4 — Minor improvement (below threshold)');
  console.log('══════════════════════════════════════════════\n');

  // Driver is on Route 1 (Jayanagar) — already the best route.
  // Conditions stable. No significant degradation or improvement.
  const currentRoute = {
    routeIndex:         1,
    duration:           1380,
    congestion:         42,
    baselineCongestion: 40,
    score:              0.15,
    geometry:           ROUTE_GEOMETRIES.jayanagar,
  };

  const result = await engine.evaluate({
    mapboxRoutes:  ROUTES_NORMAL,
    currentRoute,
    lastRerouteAt: Date.now() - 10 * 60 * 1000,
    city:          'bangalore',
    db:            mockDb,
  });

  printResult(result);
}

// ── Output formatter ──────────────────────────────────────────────────────────

function printResult(result) {
  const icon = result.rerouteTriggered ? '✅ REROUTE' : '⏸  HOLD';

  console.log(`Decision:         ${icon}`);
  console.log(`Gate triggered:   ${result.gate}`);
  console.log(`Reason:           ${result.reason}`);
  console.log('');
  console.log('Selected route:');
  console.log(`  Duration:       ${result.selectedRoute.duration}s`);
  console.log(`  Distance:       ${result.selectedRoute.distance}m`);
  console.log(`  Congestion:     ${result.selectedRoute.congestion.toFixed(1)}`);
  console.log(`  Weather penalty:${result.selectedRoute.weatherPenalty.toFixed(2)}`);
  console.log(`  Stability:      ${result.selectedRoute.stability.toFixed(2)}`);
  console.log(`  Score:          ${result.selectedRoute.score}`);
  console.log('');
  console.log('Score breakdown (weighted contributions):');
  for (const [dim, val] of Object.entries(result.debug.scoreBreakdown)) {
    console.log(`  ${dim.padEnd(16)} ${val}`);
  }
  console.log('');
  console.log('All candidates:');
  for (const r of result.debug.allRoutes) {
    console.log(
      `  [${r.routeIndex}] score=${r.score.toFixed(3)}` +
      `  eta=${r.duration}s  congestion=${r.congestion.toFixed(0)}` +
      `  weather=${r.weatherPenalty.toFixed(2)}  stability=${r.stability.toFixed(2)}`
    );
  }
}

// ── Run all scenarios ─────────────────────────────────────────────────────────

(async () => {
  try {
    await runScenario1();
    await runScenario2();
    await runScenario3();
    await runScenario4();
  } catch (err) {
    console.error('Sample run failed:', err);
    process.exit(1);
  }
})();
