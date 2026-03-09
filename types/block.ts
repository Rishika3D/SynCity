/**
 * types/block.ts
 *
 * City block and lot type system for the urban hierarchy.
 *
 * Urban hierarchy:  District → Block → Lot → Building
 *
 * A CityBlock is the polygon of land enclosed by roads.
 * Each block is subdivided into BuildingLots — individual parcels
 * where a single building (or building cluster) is placed.
 * Lots have a frontage edge (road-facing side) that determines
 * the building's orientation.
 *
 * Generated server-side by utils/blockSubdivision.ts from the
 * road network graph, then serialised into CityData.
 */

// ─── City Block ────────────────────────────────────────────────────────────────

/**
 * A convex polygon of urban land enclosed by road segments.
 * All coordinates are in world-space XZ (post-projection via geoProject).
 */
export interface CityBlock {
  /** Unique block identifier */
  id:          string;
  /** Closed convex polygon boundary in world-space [x, z] pairs */
  polygon:     [number, number][];
  /** Which district this block belongs to */
  districtId:  string;
  /** Area in world-space square units */
  area:        number;
  /** Building lots subdivided from this block */
  lots:        BuildingLot[];
  /** Road IDs that form this block's boundary (for frontage detection) */
  boundaryRoadIds?: number[];
}

// ─── Building Lot ──────────────────────────────────────────────────────────────

/**
 * An individual parcel within a CityBlock where a building is placed.
 * The frontageEdge determines building orientation — the building's
 * main entrance faces the road.
 */
export interface BuildingLot {
  /** Unique lot identifier */
  id:            string;
  /** Polygon boundary in world-space [x, z] pairs */
  polygon:       [number, number][];
  /** The road-facing edge — two endpoints in world-space [x, z] */
  frontageEdge:  [[number, number], [number, number]];
  /** Angle (radians) the building should face to align with frontage */
  frontageAngle: number;
  /** Maximum footprint that fits within this lot */
  maxFootprint:  { width: number; depth: number };
  /** Centre point for building placement [x, z] */
  centre:        [number, number];
  /** Which district this lot belongs to */
  districtId:    string;
}
