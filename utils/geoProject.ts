/**
 * utils/geoProject.ts
 *
 * Shared geographic-to-world-space projection utilities.
 * Used by every city layer component: terrain, roads, buildings, water, parks.
 *
 * Projection model: equirectangular approximation (flat-Earth), valid for
 * areas < ~30 km across.  For Bangalore's 10-km city view this gives
 * sub-metre accuracy — more than sufficient for a digital-twin miniature.
 *
 * Convention
 *   +X  = East
 *   +Z  = South   (so North = −Z)
 *    Y  = elevation, passed through unchanged
 */

import * as THREE from 'three';
import type { LngLat } from '@/types/osm';

/** Metres per degree of latitude (WGS-84 average) */
const M_PER_DEG_LAT = 111_320;

// ─── Core projection ──────────────────────────────────────────────────────────

/**
 * Project a single [lng, lat] coordinate to a THREE.Vector3 world position,
 * centred on `centre`.
 *
 * @param coord        The [longitude, latitude] point to project.
 * @param centre       The [longitude, latitude] origin of the world (maps to [0,0,0]).
 * @param metresToUnit Scale factor: world-units per real-world metre.
 *                     Use `CityData.metresToUnit` (e.g. 0.10 → 1 unit = 10 m).
 * @param yElevation   World-space Y to assign to all projected points.
 */
export function projectLngLat(
  coord:         LngLat,
  centre:        LngLat,
  metresToUnit:  number,
  yElevation:    number = 0,
): THREE.Vector3 {
  // cos(centreLat) corrects for longitude convergence toward the poles
  const cosLat = Math.cos((centre[1] * Math.PI) / 180);

  // East/West offset in metres
  const xMetres =  (coord[0] - centre[0]) * cosLat * M_PER_DEG_LAT;
  // North/South offset in metres — negated so North maps to −Z
  const zMetres = -(coord[1] - centre[1])          * M_PER_DEG_LAT;

  return new THREE.Vector3(
    xMetres * metresToUnit,
    yElevation,
    zMetres * metresToUnit,
  );
}

/**
 * Project an array of [lng, lat] coordinates to THREE.Vector3[].
 * All resulting points share the same Y elevation.
 */
export function projectCoords(
  coords:        LngLat[],
  centre:        LngLat,
  metresToUnit:  number,
  yElevation:    number = 0,
): THREE.Vector3[] {
  return coords.map(c => projectLngLat(c, centre, metresToUnit, yElevation));
}

/**
 * Compute the approximate world-space bounding radius of a CityData bbox.
 * Useful for sizing the terrain disc and fog distances.
 *
 * @param bbox         [minLng, minLat, maxLng, maxLat]
 * @param centre       [centreLng, centreLat]
 * @param metresToUnit Scale factor
 */
export function bboxRadiusUnits(
  bbox:          [number, number, number, number],
  centre:        LngLat,
  metresToUnit:  number,
): number {
  const corners: LngLat[] = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[2], bbox[3]],
    [bbox[0], bbox[3]],
  ];
  return Math.max(
    ...corners.map(c => projectLngLat(c, centre, metresToUnit).length()),
  );
}

/**
 * Return the straight-line world-space distance between two geographic points.
 */
export function geoDistanceUnits(
  a:             LngLat,
  b:             LngLat,
  centre:        LngLat,
  metresToUnit:  number,
): number {
  return projectLngLat(a, centre, metresToUnit)
    .distanceTo(projectLngLat(b, centre, metresToUnit));
}
