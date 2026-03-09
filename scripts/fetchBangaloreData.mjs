#!/usr/bin/env node
/**
 * scripts/fetchBangaloreData.mjs
 *
 * Fetches real OpenStreetMap data for Bangalore from the public Overpass API
 * and converts it into a CityData-compatible JSON file that can replace
 * (or augment) the hand-crafted mockBangalore.ts.
 *
 * Usage
 * ─────
 *   node scripts/fetchBangaloreData.mjs
 *
 * Output
 * ──────
 *   data/realBangalore.json  (CityData-shaped, drop-in for mockBangalore)
 *
 * Requirements
 * ────────────
 *   Node 18+  (uses built-in globalThis.fetch and AbortSignal.timeout)
 *   No external dependencies.
 *
 * Coordinate convention (matches types/osm.ts + utils/geoProject.ts)
 * ──────────────────────────────────────────────────────────────────
 *   All coordinates are stored as [longitude, latitude] (GeoJSON order).
 *   Conversion to Three.js world-space (x, z) happens at render-time
 *   inside components/RoadNetwork.tsx, etc., via utils/geoProject.ts.
 *
 *   For reference — the equirectangular projection used at runtime:
 *     cosLat  = cos(centreLat × π/180)
 *     x       = (lng − centreLng) × cosLat  × 111_320 × metresToUnit  → East  (+X)
 *     z       = -(lat − centreLat)           × 111_320 × metresToUnit  → South (+Z)
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ─── Configuration ────────────────────────────────────────────────────────────

/** Geographic centre of the rendered area. Maps to world-space [0, 0, 0]. */
const CENTRE = { lat: 12.97, lng: 77.59 };

/** World-units per metre (miniature twin aesthetic: 1 unit = 10 m). */
const METRES_TO_UNIT = 0.10;

/**
 * Overpass bounding box: south, west, north, east (decimal degrees).
 *
 * Default: ~8 km × 8 km around central Bangalore, covering the CBD,
 * Cubbon Park, Ulsoor Lake, and the inner NICE Road corridor.
 *
 * Expand this to capture ORR, Electronic City, Whitefield, etc.
 * Larger boxes yield more data but take longer and produce bigger JSON.
 *   Full BMA: { south: 12.84, west: 77.46, north: 13.08, east: 77.78 }
 */
const BBOX = { south: 12.93, west: 77.55, north: 13.01, east: 77.63 };

/** Public Overpass API endpoint. Mirror alternatives if rate-limited:
 *    https://overpass.kumi.systems/api/interpreter
 *    https://overpass.openstreetmap.ru/api/interpreter
 */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Server-side Overpass timeout in seconds. */
const TIMEOUT_S = 30;

// ─── Overpass QL query ────────────────────────────────────────────────────────

function buildOverpassQuery(bbox) {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `
[out:json][timeout:${TIMEOUT_S}];
(
  /* ── Roads ────────────────────────────────────────────────────────── */
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|tertiary|residential|service|footway|cycleway|unclassified)$"](${b});

  /* ── Buildings ────────────────────────────────────────────────────── */
  way["building"](${b});

  /* ── Parks & green space ──────────────────────────────────────────── */
  way["leisure"~"^(park|garden|recreation_ground|pitch)$"](${b});
  way["landuse"~"^(forest|grass|cemetery|meadow|recreation_ground)$"](${b});
  way["natural"~"^(wood|scrub|heath)$"](${b});

  /* ── Water bodies ─────────────────────────────────────────────────── */
  way["natural"="water"](${b});
  way["waterway"~"^(riverbank|canal)$"](${b});
  way["landuse"="reservoir"](${b});
);
out body;
>;
out skel qt;
`.trim();
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;

/**
 * For documentation / debugging: project a GPS point to Three.js world-space.
 * CityData stores raw LngLat; runtime projection is done by geoProject.ts.
 */
function projectToWorldXZ(lat, lng) {
  const cosLat = Math.cos((CENTRE.lat * Math.PI) / 180);
  return {
    x:  (lng - CENTRE.lng) * cosLat * M_PER_DEG_LAT * METRES_TO_UNIT,
    z: -(lat - CENTRE.lat)           * M_PER_DEG_LAT * METRES_TO_UNIT,
  };
}

/**
 * Compute the approximate area of a [lng, lat] polygon ring in m²
 * using the projected shoelace formula.
 */
function polygonAreaM2(coords) {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[(i + 1) % n];
    const cosLat = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    const x1 = lng1 * cosLat * M_PER_DEG_LAT;
    const y1 = lat1           * M_PER_DEG_LAT;
    const x2 = lng2 * cosLat * M_PER_DEG_LAT;
    const y2 = lat2           * M_PER_DEG_LAT;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

// ─── OSM → our enum helpers ───────────────────────────────────────────────────

/**
 * Map an OSM highway= tag to a valid RoadType string.
 * Our enum values are identical to OSM tag values, so no transformation needed
 * for recognised types — unknown types fall back to 'unclassified'.
 */
function toRoadType(highwayTag) {
  const VALID = new Set([
    'motorway', 'motorway_link',
    'trunk',    'trunk_link',
    'primary',  'primary_link',
    'secondary', 'tertiary',
    'residential', 'service',
    'footway', 'cycleway', 'unclassified',
  ]);
  return VALID.has(highwayTag) ? highwayTag : 'unclassified';
}

/**
 * Map a combination of OSM building= / amenity= / landuse= / tourism= tags
 * to a Zone string.  Priority: building tag > amenity > landuse > tourism.
 */
function toZone(tags) {
  const b  = tags.building ?? '';
  const a  = tags.amenity  ?? '';
  const lu = tags.landuse  ?? '';
  const t  = tags.tourism  ?? '';

  // Commercial / retail
  if (['commercial', 'office', 'retail', 'supermarket', 'mall', 'shop'].includes(b)) return 'commercial';
  if (lu === 'commercial' || lu === 'retail')                                          return 'commercial';

  // Residential
  if (['residential', 'apartments', 'house', 'detached', 'terrace', 'bungalow', 'villa'].includes(b)) return 'residential';
  if (lu === 'residential')                                                            return 'residential';

  // Industrial
  if (['industrial', 'warehouse', 'factory', 'shed', 'storage_tank'].includes(b))     return 'industrial';
  if (lu === 'industrial')                                                             return 'industrial';

  // Educational
  if (['school', 'university', 'college', 'library'].includes(b))                     return 'educational';
  if (['school', 'university', 'college', 'library', 'kindergarten'].includes(a))     return 'educational';

  // Healthcare
  if (['hospital', 'clinic', 'doctors', 'pharmacy', 'dentist'].includes(b))           return 'healthcare';
  if (['hospital', 'clinic', 'doctors', 'pharmacy', 'dentist'].includes(a))           return 'healthcare';

  // Religious
  if (['cathedral', 'chapel', 'church', 'mosque', 'temple', 'shrine', 'synagogue'].includes(b)) return 'religious';
  if (a === 'place_of_worship')                                                        return 'religious';

  // Government
  if (['government', 'civic', 'public', 'service'].includes(b))                       return 'government';
  if (['townhall', 'courthouse', 'police', 'fire_station', 'post_office'].includes(a)) return 'government';

  // Hospitality
  if (['hotel', 'hostel', 'guest_house', 'motel'].includes(b))                        return 'hospitality';
  if (['hotel', 'hostel', 'motel', 'chalet'].includes(t))                             return 'hospitality';

  // Mixed / generic
  if (b === 'yes' || b === 'building' || b === 'construction')                        return 'mixed';
  return 'unknown';
}

/** Map OSM water / waterway / natural / landuse tags → WaterType string. */
function toWaterType(tags) {
  const w  = tags.water    ?? '';
  const ww = tags.waterway ?? '';
  const lu = tags.landuse  ?? '';

  if (w === 'lake' || w === 'oxbow')                           return 'lake';
  if (w === 'reservoir' || lu === 'reservoir')                 return 'reservoir';
  if (w === 'pond' || w === 'reflecting_pool' || w === 'pool') return 'pond';
  if (w === 'wetland')                                         return 'wetland';
  if (ww === 'river' || ww === 'riverbank' || ww === 'stream') return 'river';
  if (ww === 'canal')                                          return 'canal';
  return 'lake';   // default for natural=water
}

/** Map OSM leisure / landuse / natural tags → GreenType string. */
function toGreenType(tags) {
  const l  = tags.leisure ?? '';
  const lu = tags.landuse ?? '';
  const n  = tags.natural ?? '';

  if (l === 'park')                                            return 'park';
  if (l === 'garden')                                          return 'garden';
  if (l === 'recreation_ground' || l === 'pitch')              return 'recreational';
  if (lu === 'forest' || n === 'wood' || n === 'scrub')        return 'forest';
  if (lu === 'grass' || lu === 'meadow' || n === 'heath')      return 'grass';
  if (lu === 'cemetery')                                       return 'cemetery';
  return 'park';
}

// ─── Overpass result helpers ──────────────────────────────────────────────────

/** Build a Map<nodeId, {lat, lng}> from the Overpass elements array. */
function buildNodeMap(elements) {
  const map = new Map();
  for (const el of elements) {
    if (el.type === 'node') {
      map.set(el.id, { lat: el.lat, lng: el.lon });
    }
  }
  return map;
}

/**
 * Resolve a way's node-id array to [[lng, lat], ...] coordinates.
 * Skips any node IDs not present in the node map (incomplete data).
 */
function resolveCoords(nodeIds, nodeMap) {
  const coords = [];
  for (const id of nodeIds) {
    const n = nodeMap.get(id);
    if (n) coords.push([n.lng, n.lat]);   // [longitude, latitude] — GeoJSON order
  }
  return coords;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  SynCity — Bangalore OSM Data Fetcher                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Centre      : ${CENTRE.lat}°N  ${CENTRE.lng}°E`);
  console.log(`  BBox        : ${BBOX.south}–${BBOX.north}°N, ${BBOX.west}–${BBOX.east}°E`);
  console.log(`  Scale       : metresToUnit ${METRES_TO_UNIT}  (1 unit = ${1/METRES_TO_UNIT} m)`);
  console.log('');

  // ── 1. Build and fire the Overpass query ─────────────────────────────────────
  const query = buildOverpassQuery(BBOX);
  console.log('⏳  Querying Overpass API…');
  console.log(`    ${OVERPASS_URL}`);

  let elements;
  try {
    const res = await fetch(OVERPASS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
      signal:  AbortSignal.timeout((TIMEOUT_S + 15) * 1_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    elements   = json.elements ?? [];
  } catch (err) {
    console.error('\n❌  Overpass request failed:', err.message);
    console.error('    Tip: check your internet connection or try a mirror URL.');
    process.exit(1);
  }
  console.log(`✅  ${elements.length.toLocaleString()} elements received`);

  // ── 2. Index nodes, filter ways ───────────────────────────────────────────────
  const nodeMap = buildNodeMap(elements);
  const ways    = elements.filter(el => el.type === 'way');

  console.log(`    Nodes     : ${nodeMap.size.toLocaleString()}`);
  console.log(`    Ways      : ${ways.length.toLocaleString()}`);
  console.log('');
  console.log('🔧  Parsing features…');

  // ── 3. Classify each way ──────────────────────────────────────────────────────
  const roads     = [];
  const buildings = [];
  const water     = [];
  const parks     = [];

  for (const way of ways) {
    const tags   = way.tags ?? {};
    const coords = resolveCoords(way.nodes ?? [], nodeMap);
    if (coords.length < 2) continue;   // skip if node geometry is unavailable

    const osmId = way.id;
    const name  = tags.name || tags['name:en'] || undefined;

    // ── Roads ───────────────────────────────────────────────────────────────
    if (tags.highway) {
      const roadType = toRoadType(tags.highway);
      const lanesN   = parseInt(tags.lanes ?? '', 10);
      const speedN   = parseInt(tags.maxspeed ?? '', 10);

      roads.push({
        osmId,
        featureType: 'road',
        roadType,
        coordinates: coords,
        source: 'osm-live',
        ...(name             && { name, label: name          }),
        ...(isFinite(lanesN) && { lanes: lanesN              }),
        ...(isFinite(speedN) && { maxspeed: speedN           }),
        ...(tags.oneway === 'yes'  && { oneway: true         }),
        ...(tags.bridge === 'yes'  && { elevated: true       }),
      });
      continue;
    }

    // ── Buildings ────────────────────────────────────────────────────────────
    if (tags.building) {
      if (coords.length < 3) continue;

      const zone    = toZone(tags);
      const heightM = parseFloat(tags.height ?? '');
      const levelsN = parseInt(tags['building:levels'] ?? '', 10);

      buildings.push({
        osmId,
        featureType: 'building',
        zone,
        footprint: coords,
        height:    isFinite(heightM) ? heightM : null,
        source: 'osm-live',
        ...(isFinite(levelsN)    && { levels: levelsN         }),
        ...(name                 && { name                    }),
        ...(name                 && { landmark: name          }),
        ...(tags['roof:shape']   && { roofShape: tags['roof:shape'] }),
      });
      continue;
    }

    // ── Water bodies ─────────────────────────────────────────────────────────
    const isWater = tags.natural === 'water'
                 || tags.waterway === 'riverbank'
                 || tags.waterway === 'canal'
                 || tags.landuse  === 'reservoir';
    if (isWater) {
      if (coords.length < 3) continue;

      const waterType = toWaterType(tags);
      const areaSqM   = Math.round(polygonAreaM2(coords));

      water.push({
        osmId,
        featureType: 'water',
        waterType,
        polygon: coords,
        source: 'osm-live',
        ...(areaSqM > 0           && { areaSqM              }),
        ...(name                  && { name                 }),
        ...(tags.seasonal === 'yes' && { seasonal: true     }),
      });
      continue;
    }

    // ── Parks & green space ───────────────────────────────────────────────────
    const isGreen = tags.leisure === 'park'
                 || tags.leisure === 'garden'
                 || tags.leisure === 'recreation_ground'
                 || tags.leisure === 'pitch'
                 || tags.landuse === 'forest'
                 || tags.landuse === 'grass'
                 || tags.landuse === 'meadow'
                 || tags.landuse === 'cemetery'
                 || tags.natural === 'wood'
                 || tags.natural === 'scrub'
                 || tags.natural === 'heath';
    if (isGreen) {
      if (coords.length < 3) continue;

      const greenType   = toGreenType(tags);
      const areaSqM     = Math.round(polygonAreaM2(coords));
      const treeDensity = greenType === 'forest'  ? 0.80
                        : greenType === 'park'    ? 0.40
                        : greenType === 'garden'  ? 0.30
                        : greenType === 'grass'   ? 0.10
                        : 0.20;

      parks.push({
        osmId,
        featureType: 'park',
        greenType,
        polygon: coords,
        treeDensity,
        source: 'osm-live',
        ...(areaSqM > 0 && { areaSqM }),
        ...(name        && { name    }),
      });
      continue;
    }
  }

  // ── 4. Stats ──────────────────────────────────────────────────────────────────
  console.log('');
  console.log('  Feature counts:');
  console.log(`    🛣️   Roads       : ${roads.length.toLocaleString()}`);
  console.log(`    🏙️   Buildings   : ${buildings.length.toLocaleString()}`);
  console.log(`    💧  Water        : ${water.length.toLocaleString()}`);
  console.log(`    🌳  Parks        : ${parks.length.toLocaleString()}`);
  console.log(`    📍  Landmarks    : 0  (node fetch not included — add separately)`);
  console.log('');

  // ── 5. Assemble the CityData payload ─────────────────────────────────────────
  const cityData = {
    cityName:     'Bangalore',
    centre:       [CENTRE.lng, CENTRE.lat],   // [longitude, latitude] — GeoJSON order
    metresToUnit: METRES_TO_UNIT,
    bbox:         [BBOX.west, BBOX.south, BBOX.east, BBOX.north],
    roads,
    buildings,
    water,
    parks,
    landmarks: [],   // populated by a separate landmarks-only Overpass query
  };

  // ── 6. Write to data/realBangalore.json ──────────────────────────────────────
  const outDir  = join(ROOT, 'data');
  const outPath = join(outDir, 'realBangalore.json');

  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(cityData, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌  Failed to write output file:', err.message);
    process.exit(1);
  }

  const rawBytes = JSON.stringify(cityData).length;
  const sizeStr  = rawBytes > 1_048_576
    ? `${(rawBytes / 1_048_576).toFixed(1)} MB`
    : `${(rawBytes / 1_024).toFixed(1)} KB`;

  console.log(`✅  Saved → data/realBangalore.json  (${sizeStr})`);
  console.log('');
  console.log('  Next steps:');
  console.log('  ① Add tsconfig.json "resolveJsonModule": true  (if not already set)');
  console.log('  ② In your page:');
  console.log('       import rawData from \'@/data/realBangalore.json\';');
  console.log('       import type { CityData } from \'@/types/osm\';');
  console.log('       const cityData = rawData as unknown as CityData;');
  console.log('');
  console.log('  Or keep the mock for development and load this on demand:');
  console.log('       const res  = await fetch(\'/api/bangalore\');');
  console.log('       const city = await res.json() as CityData;');
  console.log('');

  // ── 7. Projection demo (for verification) ────────────────────────────────────
  console.log('  Projection check (city centre → world-space):');
  const check = projectToWorldXZ(CENTRE.lat, CENTRE.lng);
  console.log(`    Centre [${CENTRE.lng}, ${CENTRE.lat}] → { x: ${check.x}, z: ${check.z} }  (should be {0, 0})`);

  if (roads.length > 0) {
    const [lng0, lat0] = roads[0].coordinates[0];
    const p = projectToWorldXZ(lat0, lng0);
    console.log(`    Road[0][0] [${lng0.toFixed(5)}, ${lat0.toFixed(5)}] → { x: ${p.x.toFixed(2)}, z: ${p.z.toFixed(2)} }`);
  }
  console.log('');
}

main();
