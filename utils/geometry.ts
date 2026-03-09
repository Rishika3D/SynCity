/**
 * utils/geometry.ts
 *
 * Shared computational geometry algorithms for the urban hierarchy system.
 * All operations work in 2D world-space XZ coordinates (post-projection).
 *
 * Used by:
 *   - districtGenerator.ts  (Voronoi tessellation, polygon clipping)
 *   - blockSubdivision.ts   (convex hull, polygon area, point-in-polygon)
 *   - BuildingGenerator.tsx  (district lookup for building placement)
 */

// ─── Point-in-Polygon ─────────────────────────────────────────────────────────

/**
 * Ray-casting algorithm: count intersections of a horizontal ray
 * from the test point to +infinity with the polygon edges.
 * Odd count = inside, even count = outside.
 */
export function pointInPolygon(
  px: number,
  pz: number,
  polygon: [number, number][],
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0], zi = polygon[i][1];
    const xj = polygon[j][0], zj = polygon[j][1];
    if (
      ((zi > pz) !== (zj > pz)) &&
      (px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── District Lookup ──────────────────────────────────────────────────────────

import type { District } from '@/types/district';

/**
 * Find which district contains the given world-space point.
 * Returns the district, or undefined if the point is outside all districts.
 */
export function findDistrictAt(
  x: number,
  z: number,
  districts: District[],
): District | undefined {
  for (const d of districts) {
    if (pointInPolygon(x, z, d.polygon)) return d;
  }
  return undefined;
}

// ─── Polygon Area ──────────────────────────────────────────────────────────────

/**
 * Shoelace formula for the area of a simple polygon.
 * Returns absolute area (always positive regardless of winding).
 */
export function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += polygon[j][0] * polygon[i][1];
    area -= polygon[i][0] * polygon[j][1];
  }
  return Math.abs(area) / 2;
}

// ─── Polygon Centroid ──────────────────────────────────────────────────────────

/**
 * Compute the centroid of a simple polygon using the signed-area method.
 */
export function polygonCentroid(polygon: [number, number][]): [number, number] {
  let cx = 0, cz = 0, signedArea = 0;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    signedArea += cross;
    cx += (polygon[j][0] + polygon[i][0]) * cross;
    cz += (polygon[j][1] + polygon[i][1]) * cross;
  }
  signedArea /= 2;
  if (Math.abs(signedArea) < 1e-10) {
    // Degenerate polygon — return average of vertices
    const avgX = polygon.reduce((s, p) => s + p[0], 0) / n;
    const avgZ = polygon.reduce((s, p) => s + p[1], 0) / n;
    return [avgX, avgZ];
  }
  cx /= (6 * signedArea);
  cz /= (6 * signedArea);
  return [cx, cz];
}

// ─── Convex Hull ──────────────────────────────────────────────────────────────

/**
 * Graham scan algorithm for 2D convex hull.
 * Returns vertices in counter-clockwise order.
 */
export function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return [...points];

  // Sort by x, then by z
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Build lower hull
  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove the last point of each half because it's repeated at the beginning of the other
  lower.pop();
  upper.pop();

  return [...lower, ...upper];
}

/**
 * 2D cross product of vectors OA and OB where O is the first point.
 * Positive = counter-clockwise turn, negative = clockwise.
 */
function cross2D(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// ─── Polygon Clipping (Sutherland-Hodgman) ────────────────────────────────────

/**
 * Clip a convex polygon to a rectangular region.
 * Returns the clipped polygon vertices.
 */
export function clipPolygonToRect(
  polygon: [number, number][],
  rect: { minX: number; minZ: number; maxX: number; maxZ: number },
): [number, number][] {
  let output = [...polygon];

  // Clip against each edge of the rectangle
  const edges: Array<{
    inside: (p: [number, number]) => boolean;
    intersect: (a: [number, number], b: [number, number]) => [number, number];
  }> = [
    // Left edge
    {
      inside: (p) => p[0] >= rect.minX,
      intersect: (a, b) => {
        const t = (rect.minX - a[0]) / (b[0] - a[0]);
        return [rect.minX, a[1] + t * (b[1] - a[1])];
      },
    },
    // Right edge
    {
      inside: (p) => p[0] <= rect.maxX,
      intersect: (a, b) => {
        const t = (rect.maxX - a[0]) / (b[0] - a[0]);
        return [rect.maxX, a[1] + t * (b[1] - a[1])];
      },
    },
    // Bottom edge (minZ)
    {
      inside: (p) => p[1] >= rect.minZ,
      intersect: (a, b) => {
        const t = (rect.minZ - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), rect.minZ];
      },
    },
    // Top edge (maxZ)
    {
      inside: (p) => p[1] <= rect.maxZ,
      intersect: (a, b) => {
        const t = (rect.maxZ - a[1]) / (b[1] - a[1]);
        return [a[0] + t * (b[0] - a[0]), rect.maxZ];
      },
    },
  ];

  for (const edge of edges) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currInside = edge.inside(current);
      const prevInside = edge.inside(previous);

      if (currInside) {
        if (!prevInside) {
          output.push(edge.intersect(previous, current));
        }
        output.push(current);
      } else if (prevInside) {
        output.push(edge.intersect(previous, current));
      }
    }
  }

  return output;
}

// ─── Voronoi Tessellation (Simple Fortune's Approximation) ────────────────────

/**
 * Generate Voronoi cells from seed points within a bounding rectangle.
 * Uses a pragmatic approach: for each point in a dense grid, find the
 * nearest seed → build per-seed point sets → convex-hull each set.
 *
 * This isn't Fortune's sweep-line (which is complex to implement correctly),
 * but it produces visually identical results for ~10-15 seeds and is
 * deterministic and robust.
 *
 * @param seeds  Array of [x, z] seed points
 * @param bbox   Bounding rectangle
 * @param gridRes  Grid resolution for sampling (default: 80)
 * @returns Array of polygons, one per seed (in same order as seeds)
 */
export function voronoiFromSeeds(
  seeds: [number, number][],
  bbox: { minX: number; minZ: number; maxX: number; maxZ: number },
  gridRes: number = 80,
): [number, number][][] {
  const { minX, minZ, maxX, maxZ } = bbox;
  const dx = (maxX - minX) / gridRes;
  const dz = (maxZ - minZ) / gridRes;

  // For each seed, collect nearby grid points that are closest to it
  const cellPoints: [number, number][][] = seeds.map(() => []);

  for (let gi = 0; gi <= gridRes; gi++) {
    for (let gj = 0; gj <= gridRes; gj++) {
      const x = minX + gi * dx;
      const z = minZ + gj * dz;

      // Find nearest seed
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let si = 0; si < seeds.length; si++) {
        const ddx = x - seeds[si][0];
        const ddz = z - seeds[si][1];
        const dist = ddx * ddx + ddz * ddz;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = si;
        }
      }
      cellPoints[bestIdx].push([x, z]);
    }
  }

  // Convert each cell's point set to a convex hull polygon
  return cellPoints.map(pts => {
    if (pts.length < 3) return pts;
    return convexHull(pts);
  });
}

// ─── Distance utilities ────────────────────────────────────────────────────────

/** Squared distance between two 2D points */
export function dist2D(
  a: [number, number],
  b: [number, number],
): number {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return Math.sqrt(dx * dx + dz * dz);
}

/** Point-to-line-segment distance */
export function pointToSegmentDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-10) return dist2D([px, pz], [ax, az]);

  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projZ = az + t * dz;
  return dist2D([px, pz], [projX, projZ]);
}

// ─── Bounding box from polygon ────────────────────────────────────────────────

export function polygonBBox(polygon: [number, number][]): {
  minX: number; minZ: number; maxX: number; maxZ: number;
} {
  let minX = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

// ─── Line segment intersection ────────────────────────────────────────────────

/**
 * Check if two line segments (a1-a2) and (b1-b2) intersect.
 * Returns the intersection point, or null if no intersection.
 */
export function segmentIntersection(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
): [number, number] | null {
  const d1x = a2[0] - a1[0], d1z = a2[1] - a1[1];
  const d2x = b2[0] - b1[0], d2z = b2[1] - b1[1];
  const cross = d1x * d2z - d1z * d2x;
  if (Math.abs(cross) < 1e-10) return null; // Parallel

  const t = ((b1[0] - a1[0]) * d2z - (b1[1] - a1[1]) * d2x) / cross;
  const u = ((b1[0] - a1[0]) * d1z - (b1[1] - a1[1]) * d1x) / cross;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [a1[0] + t * d1x, a1[1] + t * d1z];
  }
  return null;
}
