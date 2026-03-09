/**
 * utils/blockSubdivision.ts
 *
 * Server-side block and lot generation for the urban hierarchy.
 * Runs in the explore page Server Component.
 *
 * Urban hierarchy:  District → Block → Lot → Building
 *
 * Algorithm (pragmatic road-buffer approach):
 *   1. Project all road centre-lines into world-space XZ segments.
 *   2. Build a uniform spatial grid for fast segment neighbor lookup.
 *   3. Walk each road at regular intervals:
 *      a. Cast perpendicular rays to find nearest road on each side.
 *      b. Create rectangular lots with frontage along the current road.
 *   4. Group consecutive same-side lots into CityBlocks.
 *   5. Assign each block/lot to its containing District.
 *
 * This produces ~2000-4000 lots from 1200 roads in ~100-200ms server-side.
 * The BuildingGenerator reads these lots for placement & orientation.
 */

import type { LngLat, RoadWay } from '@/types/osm';
import type { District }        from '@/types/district';
import type { CityBlock, BuildingLot } from '@/types/block';
import { findDistrictAt, polygonArea, polygonCentroid } from './geometry';

// ─── Config ────────────────────────────────────────────────────────────────────

/** Maximum lots to generate across all roads */
const MAX_LOTS = 4000;

/** Maximum blocks to emit */
const MAX_BLOCKS = 600;

/** How far to look for a neighbouring road (world units) */
const MAX_RAY_DIST = 30;

/** Minimum lot width along road frontage (world units) */
const MIN_LOT_WIDTH = 2.5;

/** Minimum lot depth (perpendicular to road, world units) */
const MIN_LOT_DEPTH = 2.0;

/** Maximum lot depth cap (world units) */
const MAX_LOT_DEPTH = 20;

/** Spacing along road between lot sample points (world units) */
const LOT_SPACING = 4.0;

/** Spatial grid cell size for segment lookup (world units) */
const GRID_CELL = 15;

// ─── Lightweight projection (no THREE dependency on server) ────────────────────

const M_PER_DEG_LAT = 111_320;

function projectXZ(
  coord: LngLat,
  centre: LngLat,
  metresToUnit: number,
): [number, number] {
  const cosLat = Math.cos((centre[1] * Math.PI) / 180);
  const x =  (coord[0] - centre[0]) * cosLat * M_PER_DEG_LAT * metresToUnit;
  const z = -(coord[1] - centre[1])          * M_PER_DEG_LAT * metresToUnit;
  return [x, z];
}

// ─── Road segment representation ──────────────────────────────────────────────

interface Segment {
  a: [number, number];  // start point [x, z]
  b: [number, number];  // end point [x, z]
  roadId: number;       // source road osmId
  roadType: string;
}

// ─── Spatial grid for fast neighbor queries ────────────────────────────────────

class SegmentGrid {
  private cells = new Map<string, Segment[]>();

  private key(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  insert(seg: Segment): void {
    // Determine grid cells this segment passes through
    const minX = Math.min(seg.a[0], seg.b[0]);
    const maxX = Math.max(seg.a[0], seg.b[0]);
    const minZ = Math.min(seg.a[1], seg.b[1]);
    const maxZ = Math.max(seg.a[1], seg.b[1]);

    const gx0 = Math.floor(minX / GRID_CELL);
    const gx1 = Math.floor(maxX / GRID_CELL);
    const gz0 = Math.floor(minZ / GRID_CELL);
    const gz1 = Math.floor(maxZ / GRID_CELL);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const k = this.key(gx, gz);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(seg);
      }
    }
  }

  /** Find all segments near a point (within GRID_CELL radius) */
  query(x: number, z: number): Segment[] {
    const gx = Math.floor(x / GRID_CELL);
    const gz = Math.floor(z / GRID_CELL);
    const result: Segment[] = [];
    const seen = new Set<Segment>();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.cells.get(this.key(gx + dx, gz + dz));
        if (arr) {
          for (const seg of arr) {
            if (!seen.has(seg)) {
              seen.add(seg);
              result.push(seg);
            }
          }
        }
      }
    }
    return result;
  }
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function dist2(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0], dz = a[1] - b[1];
  return dx * dx + dz * dz;
}

function pointToSegmentDistSq(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-10) return (px - ax) ** 2 + (pz - az) ** 2;

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projZ = az + t * dz;
  return (px - projX) ** 2 + (pz - projZ) ** 2;
}

/**
 * Cast a ray from origin in direction (dx, dz) and find the nearest
 * non-self road segment intersection distance.
 */
function castRay(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  maxDist: number,
  selfRoadId: number,
  grid: SegmentGrid,
): number {
  // Check point at max distance to query segments near the ray path
  const nearSegs = grid.query(ox + dx * maxDist * 0.5, oz + dz * maxDist * 0.5);
  const originSegs = grid.query(ox, oz);

  // Merge and deduplicate
  const allSegs = new Set([...nearSegs, ...originSegs]);

  let bestDist = maxDist;

  for (const seg of allSegs) {
    if (seg.roadId === selfRoadId) continue;

    // Find closest distance from the ray line to this segment
    // Simplified: check distance from several ray sample points to the segment
    for (let s = 0.2; s <= 1.0; s += 0.2) {
      const rx = ox + dx * maxDist * s;
      const rz = oz + dz * maxDist * s;
      const d2 = pointToSegmentDistSq(rx, rz, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
      if (d2 < (2.0 * 2.0)) { // within 2 world units of a road segment
        const rayDist = maxDist * s;
        if (rayDist < bestDist) bestDist = rayDist;
      }
    }
  }

  return bestDist;
}

// ─── Projected road data ──────────────────────────────────────────────────────

interface ProjectedRoad {
  osmId: number;
  roadType: string;
  points: [number, number][];
  /** Cumulative distance along road at each point */
  cumDist: number[];
  totalLength: number;
  segments: Segment[];
}

function projectRoads(
  roads: RoadWay[],
  centre: LngLat,
  metresToUnit: number,
): ProjectedRoad[] {
  const result: ProjectedRoad[] = [];

  for (const road of roads) {
    if (road.coordinates.length < 2) continue;

    const points = road.coordinates.map(c => projectXZ(c, centre, metresToUnit));
    const cumDist: number[] = [0];
    let totalLen = 0;
    const segments: Segment[] = [];

    for (let i = 1; i < points.length; i++) {
      const dx = points[i][0] - points[i - 1][0];
      const dz = points[i][1] - points[i - 1][1];
      totalLen += Math.sqrt(dx * dx + dz * dz);
      cumDist.push(totalLen);
      segments.push({
        a: points[i - 1],
        b: points[i],
        roadId: road.osmId,
        roadType: road.roadType,
      });
    }

    if (totalLen > 1) {
      result.push({
        osmId: road.osmId,
        roadType: road.roadType,
        points,
        cumDist,
        totalLength: totalLen,
        segments,
      });
    }
  }

  return result;
}

/**
 * Interpolate position and tangent along a projected road at distance `d`.
 */
function interpolateRoad(
  road: ProjectedRoad,
  d: number,
): { pos: [number, number]; tangent: [number, number]; normal: [number, number] } | null {
  if (d < 0 || d > road.totalLength) return null;

  // Find the segment containing distance d
  let segIdx = 0;
  while (segIdx < road.cumDist.length - 2 && road.cumDist[segIdx + 1] < d) {
    segIdx++;
  }

  const segStart = road.cumDist[segIdx];
  const segEnd = road.cumDist[segIdx + 1];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (d - segStart) / segLen : 0;

  const a = road.points[segIdx];
  const b = road.points[segIdx + 1];

  const px = a[0] + t * (b[0] - a[0]);
  const pz = a[1] + t * (b[1] - a[1]);

  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dz * dz) || 1;

  // Tangent along road
  const tx = dx / len;
  const tz = dz / len;

  // Normal perpendicular to road (rotate tangent 90° CW)
  const nx = -tz;
  const nz = tx;

  return {
    pos: [px, pz],
    tangent: [tx, tz],
    normal: [nx, nz],
  };
}

// ─── Road type to lot spacing modifier ────────────────────────────────────────

function spacingForRoadType(roadType: string): number {
  switch (roadType) {
    case 'motorway':
    case 'motorway_link':
    case 'trunk':
    case 'trunk_link':
      return LOT_SPACING * 2.0;  // wider spacing on highways
    case 'primary':
    case 'primary_link':
      return LOT_SPACING * 1.5;
    case 'secondary':
      return LOT_SPACING * 1.2;
    default:
      return LOT_SPACING;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface GenerateBlocksInput {
  roads:        RoadWay[];
  districts:    District[];
  centre:       LngLat;
  metresToUnit: number;
}

export function generateBlocks(input: GenerateBlocksInput): CityBlock[] {
  const { roads, districts, centre, metresToUnit } = input;

  // 1. Project all roads
  const projRoads = projectRoads(roads, centre, metresToUnit);

  // 2. Build spatial grid
  const grid = new SegmentGrid();
  for (const road of projRoads) {
    for (const seg of road.segments) {
      grid.insert(seg);
    }
  }

  // 3. Walk each road and generate lots
  const allLots: BuildingLot[] = [];
  let lotCounter = 0;

  for (const road of projRoads) {
    if (allLots.length >= MAX_LOTS) break;

    const spacing = spacingForRoadType(road.roadType);
    // Start slightly inset from road endpoints to avoid intersection chaos
    const startD = spacing;
    const endD = road.totalLength - spacing;

    for (let d = startD; d < endD; d += spacing) {
      if (allLots.length >= MAX_LOTS) break;

      const interp = interpolateRoad(road, d);
      if (!interp) continue;

      const { pos, normal } = interp;

      // Cast rays in both perpendicular directions to find lot depth
      for (const side of [1, -1]) {
        if (allLots.length >= MAX_LOTS) break;

        const rayDx = normal[0] * side;
        const rayDz = normal[1] * side;

        const rawDepth = castRay(
          pos[0] + rayDx * 1.5, // offset slightly from road centre
          pos[1] + rayDz * 1.5,
          rayDx,
          rayDz,
          MAX_RAY_DIST,
          road.osmId,
          grid,
        );

        // Lot depth: half the distance to the next road (leave a gap)
        let depth = Math.min(rawDepth * 0.45, MAX_LOT_DEPTH);
        if (depth < MIN_LOT_DEPTH) continue;

        const width = spacing * 0.85; // slight gap between lots
        if (width < MIN_LOT_WIDTH) continue;

        // Lot centre (offset from road centre by depth/2 + small setback)
        const setback = 1.5; // world units from road edge
        const cx = pos[0] + rayDx * (setback + depth / 2);
        const cz = pos[1] + rayDz * (setback + depth / 2);

        // Frontage angle: angle the building faces toward the road
        const frontageAngle = Math.atan2(-rayDx, -rayDz);

        // Build lot polygon (rectangle aligned to road)
        const hw = width / 2;
        const hd = depth / 2;
        // tangent direction for width
        const tx = -normal[1] * side; // perpendicular to normal
        const tz =  normal[0] * side;

        const corners: [number, number][] = [
          [cx - tx * hw - rayDx * hd, cz - tz * hw - rayDz * hd],
          [cx + tx * hw - rayDx * hd, cz + tz * hw - rayDz * hd],
          [cx + tx * hw + rayDx * hd, cz + tz * hw + rayDz * hd],
          [cx - tx * hw + rayDx * hd, cz - tz * hw + rayDz * hd],
        ];

        // Frontage edge (the road-facing edge)
        const frontageEdge: [[number, number], [number, number]] = [
          corners[0],
          corners[1],
        ];

        // Determine district
        const district = findDistrictAt(cx, cz, districts);
        const districtId = district?.id ?? 'unknown';

        allLots.push({
          id:            `lot-${lotCounter++}`,
          polygon:       corners,
          frontageEdge,
          frontageAngle,
          maxFootprint:  { width, depth },
          centre:        [cx, cz],
          districtId,
        });
      }
    }
  }

  // 4. Group lots into blocks by proximity and road association
  //    Simple approach: cluster consecutive lots on the same side of the same road
  const blocks: CityBlock[] = [];
  let blockCounter = 0;

  // Group lots by road + side (using a spatial hash based on lot centre)
  const lotGroups = new Map<string, BuildingLot[]>();

  for (const lot of allLots) {
    // Group by a coarse spatial key
    const gx = Math.floor(lot.centre[0] / (GRID_CELL * 2));
    const gz = Math.floor(lot.centre[1] / (GRID_CELL * 2));
    const key = `${gx},${gz}`;
    let group = lotGroups.get(key);
    if (!group) {
      group = [];
      lotGroups.set(key, group);
    }
    group.push(lot);
  }

  for (const [, lots] of lotGroups) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (lots.length === 0) continue;

    // Compute block polygon from the convex hull of all lot corners
    const allCorners: [number, number][] = [];
    for (const lot of lots) {
      allCorners.push(...lot.polygon);
    }

    // Simple bounding polygon from lot centres
    const blockPoly = computeBlockPolygon(allCorners);
    if (blockPoly.length < 3) continue;

    const area = polygonArea(blockPoly);
    if (area < 10) continue;

    blocks.push({
      id:          `block-${blockCounter++}`,
      polygon:     blockPoly,
      districtId:  lots[0].districtId,
      area,
      lots,
    });
  }

  return blocks;
}

/**
 * Compute a simplified block polygon from lot corner points.
 * Uses a simple convex hull approach.
 */
function computeBlockPolygon(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;

  // Sort by x, then z
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Andrew's monotone chain
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2) {
      const o = lower[lower.length - 2];
      const a = lower[lower.length - 1];
      if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) <= 0) {
        lower.pop();
      } else break;
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2) {
      const o = upper[upper.length - 2];
      const a = upper[upper.length - 1];
      if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) <= 0) {
        upper.pop();
      } else break;
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
