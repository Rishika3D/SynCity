/**
 * app/explore/page.tsx — Obsidian Apple UI
 *
 * Server Component. Loads city data, renders Three.js CityView + floating UI.
 * No glass panels, no colored borders. Pure floating typography on obsidian.
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

const DATA_SOURCE: 'real' | 'mock' = 'real';

const RENDER_ROAD_TYPES = new Set([
  'motorway', 'motorway_link',
  'trunk',    'trunk_link',
  'primary',  'primary_link',
  'secondary',
  'tertiary',
]);

const MAX_ROADS = 1_200;

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadCityData(): CityData {
  if (DATA_SOURCE === 'mock') return mockBangalore as unknown as CityData;

  const jsonPath = path.join(process.cwd(), 'data', 'realBangalore.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn('[explore] realBangalore.json not found — falling back to mock data.');
    return mockBangalore as unknown as CityData;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as CityData;
  const filteredRoads: RoadWay[] = (raw.roads as RoadWay[])
    .filter(r => RENDER_ROAD_TYPES.has(r.roadType))
    .slice(0, MAX_ROADS);

  const cityData: CityData = { ...raw, roads: filteredRoads, buildings: [] };

  const t0 = performance.now();
  cityData.districts = generateDistricts({
    roads: cityData.roads, water: cityData.water, parks: cityData.parks,
    centre: cityData.centre, metresToUnit: cityData.metresToUnit, bbox: cityData.bbox,
  });
  console.log(`[explore] Generated ${cityData.districts.length} districts in ${(performance.now() - t0).toFixed(1)}ms`);

  const t1 = performance.now();
  cityData.blocks = generateBlocks({
    roads: cityData.roads, districts: cityData.districts,
    centre: cityData.centre, metresToUnit: cityData.metresToUnit,
  });
  const totalLots = cityData.blocks.reduce((s, b) => s + b.lots.length, 0);
  console.log(`[explore] Generated ${cityData.blocks.length} blocks (${totalLots} lots) in ${(performance.now() - t1).toFixed(1)}ms`);

  return cityData;
}

// ─── Top navigation ───────────────────────────────────────────────────────────

function TopNav({ cityName }: { cityName: string }) {
  const F = 'var(--font-inter)';
  return (
    <nav className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 sm:px-10 py-4 pointer-events-none">
      <Link
        href="/"
        className="pointer-events-auto flex items-center gap-2 transition-colors duration-300 hover:text-white/70"
        style={{ fontFamily: F, fontSize: '9px', letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.35)' }}
      >
        ← Syncity
      </Link>

      <span style={{ fontFamily: F, fontSize: '9px', letterSpacing: '0.55em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.35)' }}>
        Explore
      </span>

      <span style={{ fontFamily: F, fontSize: '9px', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.2)' }}>
        {cityName}
      </span>
    </nav>
  );
}

// ─── HUD stats ────────────────────────────────────────────────────────────────

function HudStats({
  centre, roadCount, waterCount, parkCount, districtCount, blockCount, lotCount,
}: {
  centre: [number, number]; roadCount: number; waterCount: number; parkCount: number;
  districtCount: number; blockCount: number; lotCount: number;
}) {
  const F = 'var(--font-inter)';
  const stats = [
    { label: 'Districts', val: districtCount },
    { label: 'Blocks',    val: blockCount.toLocaleString() },
    { label: 'Lots',      val: lotCount.toLocaleString()   },
    { label: 'Roads',     val: roadCount.toLocaleString()  },
    { label: 'Water',     val: waterCount.toLocaleString() },
    { label: 'Parks',     val: parkCount.toLocaleString()  },
  ];

  return (
    <div className="hidden sm:block absolute top-16 left-4 sm:left-6 z-20 pointer-events-none" style={{ minWidth: 160 }}>
      {/* Coordinates */}
      <p style={{ fontFamily: F, fontSize: '10px', color: 'rgba(245,245,247,0.55)', letterSpacing: '0.05em', marginBottom: '2px', fontVariantNumeric: 'tabular-nums' }}>
        {centre[1].toFixed(3)}°N {centre[0].toFixed(3)}°E
      </p>
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />

      {/* Stats */}
      <div className="flex flex-col gap-1">
        {stats.map(({ label, val }) => (
          <div key={label} className="flex items-center justify-between gap-8">
            <span style={{ fontFamily: F, fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.25)' }}>
              {label}
            </span>
            <span style={{ fontFamily: F, fontSize: '10px', color: 'rgba(245,245,247,0.5)', fontVariantNumeric: 'tabular-nums' }}>
              {val}
            </span>
          </div>
        ))}
      </div>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />
      <p style={{ fontFamily: F, fontSize: '7px', letterSpacing: '0.2em', color: 'rgba(245,245,247,0.15)', textTransform: 'uppercase' }}>
        {DATA_SOURCE === 'real' ? 'OSM Live' : 'Mock Data'}
      </p>
    </div>
  );
}

// ─── Layer selector ───────────────────────────────────────────────────────────

function LayerSelector() {
  const F = 'var(--font-inter)';
  const layers = [
    { label: 'Roads',       active: true  },
    { label: 'Districts',   active: true  },
    { label: 'Traffic',     active: false },
    { label: 'Air Quality', active: false },
    { label: 'Energy',      active: false },
    { label: 'Weather',     active: false },
  ];

  return (
    <div className="hidden sm:block absolute top-16 right-4 sm:right-6 z-20 pointer-events-none" style={{ minWidth: 130 }}>
      <p style={{ fontFamily: F, fontSize: '8px', letterSpacing: '0.5em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.25)', marginBottom: '8px' }}>
        Layers
      </p>
      <div className="flex flex-col gap-2">
        {layers.map(({ label, active }) => (
          <div key={label} className="flex items-center justify-between gap-6">
            <span style={{ fontFamily: F, fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: active ? 'rgba(245,245,247,0.6)' : 'rgba(245,245,247,0.2)' }}>
              {label}
            </span>
            <span className="w-1 h-1 rounded-full" style={{ background: active ? 'rgba(245,245,247,0.5)' : 'rgba(245,245,247,0.1)', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Controls hint ────────────────────────────────────────────────────────────

function ControlsHint() {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '8px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(245,245,247,0.2)', whiteSpace: 'nowrap' }}>
        <span className="hidden sm:inline">Drag to orbit · Scroll to zoom · Right-drag to pan</span>
        <span className="sm:hidden">Drag · Pinch · Pan</span>
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const cityData = loadCityData();

  return (
    <main className="relative w-full h-screen overflow-hidden" style={{ background: '#09090b' }}>

      {/* Three.js canvas */}
      <div className="absolute inset-0">
        <CityView data={cityData} />
      </div>

      {/* Edge vignette */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(9,9,11,0.65) 100%)' }}
      />

      {/* UI */}
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
      <LayerSelector />
      <ControlsHint />

    </main>
  );
}
