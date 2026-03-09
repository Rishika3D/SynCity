/**
 * utils/districtGenerator.ts
 *
 * Server-side district generation for the urban hierarchy system.
 * Runs in the explore page Server Component — generates ~10-12 districts
 * by analysing road density, proximity to parks/water, and road type
 * distribution.
 *
 * Algorithm overview:
 *   1. Project all road midpoints into world-space XZ.
 *   2. Compute a density grid from road midpoints.
 *   3. Identify cluster seeds via k-means on high-density cells.
 *   4. Generate Voronoi tessellation from cluster seeds.
 *   5. Classify each cell by analysing its road type mix & proximity
 *      to parks/water to assign a DistrictType.
 *   6. Return District[] with profiles & clipped polygons.
 *
 * This runs once at page load (~50-100ms for ~1200 roads) — purely
 * computational, no rendering dependencies.
 */

import type { LngLat, RoadWay, LakePolygon, ParkArea } from '@/types/osm';
import {
  District,
  DistrictType,
  DistrictProfile,
  DISTRICT_PROFILES,
} from '@/types/district';
import {
  voronoiFromSeeds,
  clipPolygonToRect,
  polygonArea,
  polygonCentroid,
  pointInPolygon,
} from './geometry';

// ─── Config ────────────────────────────────────────────────────────────────────

/** Target number of districts to generate */
const TARGET_DISTRICTS = 10;

/** k-means iterations */
const KMEANS_ITERATIONS = 12;

/** Minimum district polygon area (world-space sq units) — filter tiny slivers */
const MIN_DISTRICT_AREA = 500;

// ─── Coordinate projection (lightweight — avoids importing THREE on server) ──

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

// ─── Road midpoint extraction ──────────────────────────────────────────────────

interface RoadPoint {
  x: number;
  z: number;
  roadType: string;
  isHighway: boolean;
  isPrimary: boolean;
}

function extractRoadPoints(
  roads: RoadWay[],
  centre: LngLat,
  metresToUnit: number,
): RoadPoint[] {
  const points: RoadPoint[] = [];
  for (const road of roads) {
    if (road.coordinates.length < 2) continue;
    // Use midpoint of each road
    const midIdx = Math.floor(road.coordinates.length / 2);
    const [x, z] = projectXZ(road.coordinates[midIdx], centre, metresToUnit);
    const isHighway = road.roadType === 'motorway' || road.roadType === 'motorway_link' ||
                      road.roadType === 'trunk' || road.roadType === 'trunk_link';
    const isPrimary = road.roadType === 'primary' || road.roadType === 'primary_link';
    points.push({ x, z, roadType: road.roadType, isHighway, isPrimary });
  }
  return points;
}

// ─── Park / Water centroid extraction ──────────────────────────────────────────

function extractFeatureCentroids(
  features: Array<{ polygon: LngLat[] }>,
  centre: LngLat,
  metresToUnit: number,
): [number, number][] {
  return features.map(f => {
    // Simple average centroid for GPS polygons
    let sx = 0, sz = 0;
    for (const coord of f.polygon) {
      const [x, z] = projectXZ(coord, centre, metresToUnit);
      sx += x;
      sz += z;
    }
    const n = f.polygon.length || 1;
    return [sx / n, sz / n] as [number, number];
  });
}

// ─── k-means clustering ───────────────────────────────────────────────────────

function kMeans(
  points: [number, number][],
  k: number,
  iterations: number,
): [number, number][] {
  if (points.length === 0) return [];
  if (points.length <= k) return [...points];

  // Initialize centroids by picking evenly-spaced points from the sorted array
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const centroids: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const idx = Math.floor((i / k) * sorted.length);
    centroids.push([...sorted[idx]]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    // Assign each point to nearest centroid
    const clusters: [number, number][][] = centroids.map(() => []);
    for (const p of points) {
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let ci = 0; ci < centroids.length; ci++) {
        const dx = p[0] - centroids[ci][0];
        const dz = p[1] - centroids[ci][1];
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = ci;
        }
      }
      clusters[bestIdx].push(p);
    }

    // Update centroids
    for (let ci = 0; ci < centroids.length; ci++) {
      const cluster = clusters[ci];
      if (cluster.length === 0) continue;
      let sx = 0, sz = 0;
      for (const p of cluster) {
        sx += p[0];
        sz += p[1];
      }
      centroids[ci] = [sx / cluster.length, sz / cluster.length];
    }
  }

  return centroids;
}

// ─── District classification ──────────────────────────────────────────────────

function classifyDistrict(
  cellPolygon: [number, number][],
  roadPoints: RoadPoint[],
  parkCentroids: [number, number][],
  waterCentroids: [number, number][],
): DistrictType {
  // Count road types within this cell
  let highways = 0, primaries = 0, total = 0;
  for (const rp of roadPoints) {
    if (pointInPolygon(rp.x, rp.z, cellPolygon)) {
      total++;
      if (rp.isHighway) highways++;
      if (rp.isPrimary) primaries++;
    }
  }

  // Count nearby parks & water bodies
  const centroid = polygonCentroid(cellPolygon);
  let nearbyParks = 0, nearbyWater = 0;
  const PROXIMITY = 80; // world-space units
  for (const pc of parkCentroids) {
    const dx = pc[0] - centroid[0], dz = pc[1] - centroid[1];
    if (Math.sqrt(dx * dx + dz * dz) < PROXIMITY) nearbyParks++;
  }
  for (const wc of waterCentroids) {
    const dx = wc[0] - centroid[0], dz = wc[1] - centroid[1];
    if (Math.sqrt(dx * dx + dz * dz) < PROXIMITY) nearbyWater++;
  }

  // Classification rules
  const highwayRatio = total > 0 ? highways / total : 0;
  const primaryRatio = total > 0 ? primaries / total : 0;
  const greenScore = nearbyParks + nearbyWater;

  // High green score → GreenLung
  if (greenScore >= 5 && total < 20) return DistrictType.GreenLung;

  // Many highways + primaries → CBD
  if (highwayRatio > 0.15 && primaryRatio > 0.2 && total > 15) return DistrictType.CBD;

  // Highway intersections with moderate density → TechHub
  if (highwayRatio > 0.1 && total > 8 && total <= 30) return DistrictType.TechHub;

  // High primary density → CBD
  if (primaryRatio > 0.35 && total > 20) return DistrictType.CBD;

  // Low density with parks → Residential
  if (total < 15 && greenScore >= 2) return DistrictType.Residential;

  // Very low density → Industrial or Residential
  if (total < 8) return DistrictType.Industrial;

  // Low road count → Residential
  if (total < 20) return DistrictType.Residential;

  // Default → Mixed
  return DistrictType.Mixed;
}

// ─── Name generator ───────────────────────────────────────────────────────────

const DISTRICT_NAME_PREFIXES: Record<DistrictType, string[]> = {
  [DistrictType.CBD]:         ['Central', 'Downtown', 'Metro', 'Core'],
  [DistrictType.TechHub]:     ['Silicon', 'Digital', 'Cyber', 'Tech'],
  [DistrictType.Residential]: ['Garden', 'Heights', 'View', 'Colony'],
  [DistrictType.GreenLung]:   ['Park', 'Lake', 'Green', 'Eco'],
  [DistrictType.Industrial]:  ['Industrial', 'Works', 'Port', 'Zone'],
  [DistrictType.Mixed]:       ['Cross', 'Junction', 'Hub', 'Quarter'],
};

function generateDistrictName(type: DistrictType, index: number): string {
  const prefixes = DISTRICT_NAME_PREFIXES[type];
  const prefix = prefixes[index % prefixes.length];
  return `${prefix} District ${index + 1}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface GenerateDistrictsInput {
  roads:        RoadWay[];
  water:        LakePolygon[];
  parks:        ParkArea[];
  centre:       LngLat;
  metresToUnit: number;
  bbox:         [number, number, number, number];
}

/**
 * Generate districts from city data.
 * Runs server-side in page.tsx — returns District[] ready to serialise.
 */
export function generateDistricts(input: GenerateDistrictsInput): District[] {
  const { roads, water, parks, centre, metresToUnit, bbox } = input;

  // 1. Project all road midpoints to world-space XZ
  const roadPoints = extractRoadPoints(roads, centre, metresToUnit);
  if (roadPoints.length === 0) return [];

  // 2. Project park/water centroids
  const parkCentroids = extractFeatureCentroids(
    parks.map(p => ({ polygon: p.polygon })),
    centre,
    metresToUnit,
  );
  const waterCentroids = extractFeatureCentroids(
    water.map(w => ({ polygon: w.polygon })),
    centre,
    metresToUnit,
  );

  // 3. Compute world-space bounding box
  const bboxCorners: [number, number][] = [
    projectXZ([bbox[0], bbox[1]], centre, metresToUnit),
    projectXZ([bbox[2], bbox[1]], centre, metresToUnit),
    projectXZ([bbox[2], bbox[3]], centre, metresToUnit),
    projectXZ([bbox[0], bbox[3]], centre, metresToUnit),
  ];
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of bboxCorners) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  // Add 5% padding
  const padX = (maxX - minX) * 0.05;
  const padZ = (maxZ - minZ) * 0.05;
  const worldBBox = {
    minX: minX - padX,
    minZ: minZ - padZ,
    maxX: maxX + padX,
    maxZ: maxZ + padZ,
  };

  // 4. k-means clustering on road midpoints to find district seeds
  const roadXZs = roadPoints.map(rp => [rp.x, rp.z] as [number, number]);
  const seeds = kMeans(roadXZs, TARGET_DISTRICTS, KMEANS_ITERATIONS);

  // 5. Voronoi tessellation
  const cellPolygons = voronoiFromSeeds(seeds, worldBBox, 80);

  // 6. Build District objects
  const districts: District[] = [];
  let districtIndex = 0;

  for (let i = 0; i < cellPolygons.length; i++) {
    const rawPoly = cellPolygons[i];
    if (rawPoly.length < 3) continue;

    // Clip to world bounding box
    const clipped = clipPolygonToRect(rawPoly, worldBBox);
    if (clipped.length < 3) continue;

    // Filter out tiny slivers
    const area = polygonArea(clipped);
    if (area < MIN_DISTRICT_AREA) continue;

    // Classify district type based on road mix + green features
    const type = classifyDistrict(clipped, roadPoints, parkCentroids, waterCentroids);
    const profile = { ...DISTRICT_PROFILES[type] };
    const centroid = polygonCentroid(clipped);

    districts.push({
      id:       `district-${districtIndex}`,
      name:     generateDistrictName(type, districtIndex),
      profile,
      polygon:  clipped,
      centroid,
    });
    districtIndex++;
  }

  return districts;
}
