/**
 * app/explore/page.tsx  — Server Component
 *
 * Reads the real Bangalore OSM dataset (data/realBangalore.json, 31 MB)
 * server-side, filters it down to renderable road types, and passes
 * the compact payload to the <CityView> client component for 3-D rendering.
 *
 * Why filter server-side?
 *   The raw JSON has 23 k roads.  Shipping all of them to the browser would
 *   create millions of ribbon-geometry vertices and saturate the GPU.
 *   By keeping only the major road categories (motorway → secondary) we get
 *   a rich city network (~500–900 ways) that renders at a solid frame-rate.
 *
 * Swap DATA_SOURCE to 'mock' during offline development.
 */

import fs   from 'fs';
import path from 'path';
import Link from 'next/link';

import { CityView }              from './CityView';
import { mockBangalore }         from '@/data/mockBangalore';
import { generateDistricts }     from '@/utils/districtGenerator';
import { generateBlocks }        from '@/utils/blockSubdivision';
import type { CityData, RoadWay } from '@/types/osm';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Switch to 'mock' if realBangalore.json is not available (offline dev). */
const DATA_SOURCE: 'real' | 'mock' = 'real';

/**
 * Road types that are rendered as ribbon meshes.
 * Anything narrower than 'secondary' is skipped for rendering performance;
 * the BuildingGenerator still uses its own internal filter for building placement.
 */
const RENDER_ROAD_TYPES = new Set([
  'motorway', 'motorway_link',
  'trunk',    'trunk_link',
  'primary',  'primary_link',
  'secondary',
  'tertiary',   // include tertiary — good for building placement density
]);

/** Hard cap on road count sent to the client. */
const MAX_ROADS = 1_200;

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadCityData(): CityData {
  if (DATA_SOURCE === 'mock') {
    return mockBangalore as unknown as CityData;
  }

  const jsonPath = path.join(process.cwd(), 'data', 'realBangalore.json');

  if (!fs.existsSync(jsonPath)) {
    console.warn('[explore] realBangalore.json not found — falling back to mock data.');
    console.warn('[explore] Run: node scripts/fetchBangaloreData.mjs');
    return mockBangalore as unknown as CityData;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as CityData;

  // Filter roads to renderable types and apply count cap
  const filteredRoads: RoadWay[] = (raw.roads as RoadWay[])
    .filter(r => RENDER_ROAD_TYPES.has(r.roadType))
    .slice(0, MAX_ROADS);

  const cityData: CityData = {
    ...raw,
    roads:     filteredRoads,
    buildings: [],   // buildings are generated procedurally by BuildingGenerator
  };

  // ── Prompt 4: Generate urban hierarchy districts server-side ──
  const t0 = performance.now();
  cityData.districts = generateDistricts({
    roads:        cityData.roads,
    water:        cityData.water,
    parks:        cityData.parks,
    centre:       cityData.centre,
    metresToUnit: cityData.metresToUnit,
    bbox:         cityData.bbox,
  });
  const dt = (performance.now() - t0).toFixed(1);
  console.log(`[explore] Generated ${cityData.districts.length} districts in ${dt}ms`);

  // ── Prompt 4: Generate block subdivision from road network ──
  const t1 = performance.now();
  cityData.blocks = generateBlocks({
    roads:        cityData.roads,
    districts:    cityData.districts,
    centre:       cityData.centre,
    metresToUnit: cityData.metresToUnit,
  });
  const dt1 = (performance.now() - t1).toFixed(1);
  const totalLots = cityData.blocks.reduce((sum, b) => sum + b.lots.length, 0);
  console.log(`[explore] Generated ${cityData.blocks.length} blocks (${totalLots} lots) in ${dt1}ms`);

  return cityData;
}

// ─── UI components ────────────────────────────────────────────────────────────

function TopNav({ cityName }: { cityName: string }) {
  return (
    <nav
      className="
        absolute top-0 left-0 right-0 z-20
        flex items-center justify-between
        px-4 sm:px-8 py-3 sm:py-4
        border-b border-white/6
      "
      style={{ background: 'rgba(11,12,16,0.62)', backdropFilter: 'blur(22px)' }}
    >
      <Link
        href="/"
        className="
          font-mono text-[9.5px] tracking-[0.28em] uppercase
          text-white/35 hover:text-white/70 transition-colors duration-300
          flex items-center gap-2
        "
      >
        <span className="text-white/20">←</span> BACK
      </Link>

      <span className="font-['Space_Mono'] text-[10px] tracking-[0.55em] uppercase text-white/30">
        SYNCITY
      </span>

      <span className="font-mono text-[9px] tracking-[0.28em] text-white/20 uppercase">
        {cityName} · Twin
      </span>
    </nav>
  );
}

function HudStats({
  centre, roadCount, waterCount, parkCount, districtCount, blockCount, lotCount,
}: {
  centre: [number, number];
  roadCount: number;
  waterCount: number;
  parkCount: number;
  districtCount: number;
  blockCount: number;
  lotCount: number;
}) {
  return (
    <div className="absolute top-20 left-4 sm:left-6 flex flex-col gap-1 pointer-events-none">
      <p className="font-mono text-[8px] tracking-[0.3em] text-white/20 uppercase">
        SYNCITY / EXPLORE
      </p>
      <p className="font-mono text-[9px] tracking-[0.18em] text-cyan-400/60">
        {centre[1].toFixed(4)}°N · {centre[0].toFixed(4)}°E · LIVE
      </p>
      <div className="mt-2 flex flex-col gap-0.5">
        {[
          { label: 'DISTRICTS', val: districtCount },
          { label: 'BLOCKS',    val: blockCount },
          { label: 'LOTS',      val: lotCount },
          { label: 'ROADS',     val: roadCount  },
          { label: 'WATER',     val: waterCount },
          { label: 'PARKS',     val: parkCount  },
        ].map(({ label, val }) => (
          <p key={label} className="font-mono text-[8px] tracking-[0.22em] text-white/18">
            {label} <span className="text-white/38">{val.toLocaleString()}</span>
          </p>
        ))}
      </div>
      <p className="mt-3 font-mono text-[7px] tracking-[0.2em] text-white/12 uppercase">
        {DATA_SOURCE === 'real' ? '● OSM LIVE DATA' : '○ MOCK DATA'}
      </p>
    </div>
  );
}

function ControlsHint() {
  return (
    <div
      className="
        absolute bottom-6 left-1/2 -translate-x-1/2
        pointer-events-none
        font-mono text-[9px] tracking-[0.24em] uppercase text-white/22
        px-5 py-2.5 rounded-sm border border-white/8
      "
      style={{ background: 'rgba(11,12,16,0.52)', backdropFilter: 'blur(16px)' }}
    >
      Drag to orbit · Scroll to zoom · Right-drag to pan
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const cityData = loadCityData();

  return (
    <main className="relative w-full h-screen overflow-hidden bg-[#030308]">

      {/* Full-viewport 3-D canvas — client component handles Three.js */}
      <div className="absolute inset-0">
        <CityView data={cityData} />
      </div>

      {/* UI overlay — rendered by the server, no client JS needed */}
      <TopNav cityName={cityData.cityName} />
      <HudStats
        centre={cityData.centre}
        roadCount={cityData.roads.length}
        waterCount={cityData.water.length}
        parkCount={cityData.parks.length}
        districtCount={cityData.districts ? cityData.districts.length : 0}
        blockCount={cityData.blocks ? cityData.blocks.length : 0}
        lotCount={cityData.blocks ? cityData.blocks.reduce((s, b) => s + b.lots.length, 0) : 0}
      />
      <ControlsHint />

    </main>
  );
}
