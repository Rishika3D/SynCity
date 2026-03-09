/**
 * types/osm.ts
 *
 * TypeScript type system for OpenStreetMap city data.
 * All interfaces are designed so that real OSM GeoJSON / Overpass API
 * responses can drop-in replace the mock data without any refactoring.
 *
 * GeoJSON coordinate convention: [longitude, latitude]  ← important
 */

// ─── Primitives ───────────────────────────────────────────────────────────────

/** [longitude, latitude] — GeoJSON standard order */
export type LngLat = [number, number];

/**
 * Closed polygon ring.
 * GeoJSON requires first === last coordinate.
 * Outer rings are counter-clockwise; holes are clockwise.
 */
export type Ring = LngLat[];

// ─── Enumerations ─────────────────────────────────────────────────────────────

/**
 * OSM highway tag values, mapped to the subset relevant for city rendering.
 * Maps 1:1 to the OSM `highway=*` tag so real data needs no transformation.
 */
export enum RoadType {
  Motorway    = 'motorway',     // National Highways / expressways (NH-44, NH-48…)
  MotorwayLink= 'motorway_link',// On/off ramps
  Trunk       = 'trunk',        // Major inter-city arterials
  TrunkLink   = 'trunk_link',
  Primary     = 'primary',      // Main city roads (MG Road, Hosur Road…)
  PrimaryLink = 'primary_link',
  Secondary   = 'secondary',    // Secondary connectors (Brigade Road…)
  Tertiary    = 'tertiary',     // Local through-roads
  Residential = 'residential',  // Housing-area streets
  Service     = 'service',      // Service lanes, parking aisles
  Footway     = 'footway',      // Pedestrian paths
  Cycleway    = 'cycleway',     // Cycling infrastructure
  Unclassified= 'unclassified', // Unmapped / other
}

/**
 * Land-use / building zone classification.
 * Derived from OSM `building=*`, `landuse=*`, and `amenity=*` tags.
 */
export enum Zone {
  Commercial   = 'commercial',   // CBD towers, malls, offices
  Residential  = 'residential',  // Apartments, houses
  Industrial   = 'industrial',   // Factories, warehouses, tech parks
  Educational  = 'educational',  // Schools, colleges, IITs, IISc
  Healthcare   = 'healthcare',   // Hospitals, clinics
  Religious    = 'religious',    // Temples, mosques, churches
  Government   = 'government',   // Vidhana Soudha, courts, civic
  Hospitality  = 'hospitality',  // Hotels, resorts
  Mixed        = 'mixed',        // Mixed-use / TOD zones
  Unknown      = 'unknown',
}

/** Water body classification — OSM `water=*` / `waterway=*` tags */
export enum WaterType {
  Lake       = 'lake',
  River      = 'river',
  Reservoir  = 'reservoir',
  Canal      = 'canal',
  Pond       = 'pond',
  Wetland    = 'wetland',
}

/** Green-space classification — OSM `leisure=*` / `landuse=*` tags */
export enum GreenType {
  Park         = 'park',
  Garden       = 'garden',        // Lal Bagh Botanical Garden
  Forest       = 'forest',
  Grass        = 'grass',
  Recreational = 'recreational',  // Sports grounds
  Cemetery     = 'cemetery',
}

// ─── OSM Metadata (shared base) ──────────────────────────────────────────────

/**
 * Every OSM feature carries this metadata.
 * When using the real Overpass API, `id` is the OSM way/relation ID.
 */
export interface OSMMeta {
  /** Unique OSM numeric ID (way or relation) */
  osmId: number;
  /** OSM `name` tag — localised or English */
  name?: string;
  /**
   * Raw OSM tags preserved as-is.
   * Allows accessing any tag without modifying the interface.
   * e.g. tags['building:levels'], tags['addr:street']
   */
  tags?: Record<string, string>;
  /** Data source — 'mock' during dev, 'osm-live' in production */
  source?: 'mock' | 'osm-live' | 'osm-snapshot';
}

// ─── Feature Interfaces ───────────────────────────────────────────────────────

/**
 * A road, highway, or path — represented as an ordered polyline.
 * Equivalent to an OSM Way with `highway=*`.
 */
export interface RoadWay extends OSMMeta {
  featureType: 'road';
  roadType:    RoadType;
  /** Ordered [lng, lat] points forming the road centre-line */
  coordinates: LngLat[];
  /** Number of lanes total (both directions) */
  lanes?:      number;
  /** True if the road is one-way */
  oneway?:     boolean;
  /** Maximum speed in km/h */
  maxspeed?:   number;
  /** Human-readable label, e.g. "MG Road", "Outer Ring Road" */
  label?:      string;
  /** Whether this road is part of an elevated flyover */
  elevated?:   boolean;
  /** Rendered width multiplier (derived at render time from roadType) */
  widthHint?:  number;
}

/**
 * A building's ground-floor footprint polygon.
 * Equivalent to an OSM Way/Relation with `building=*`.
 *
 * Height resolution order:
 *   1. `height` (metres from OSM `height=` tag)
 *   2. `levels` × 3.5m
 *   3. Zone-based procedural default
 */
export interface BuildingFootprint extends OSMMeta {
  featureType: 'building';
  zone:        Zone;
  /**
   * Counter-clockwise outer ring of the building footprint.
   * All coordinates are [longitude, latitude].
   */
  footprint:   Ring;
  /**
   * Optional inner rings (courtyards / structural holes).
   * Clockwise winding per GeoJSON spec.
   */
  holes?:      Ring[];
  /** Height in metres. null = use procedural fallback. */
  height:      number | null;
  /** Number of above-ground floors */
  levels?:     number;
  /** Prominent landmark name for billboard label */
  landmark?:   string;
  /** Roof shape hint for procedural generation */
  roofShape?:  'flat' | 'gabled' | 'hipped' | 'dome' | 'pyramid';
}

/**
 * A water body polygon — lake, river bank, reservoir, canal.
 * Derived from OSM Ways/Relations with `natural=water` or `waterway=*`.
 */
export interface LakePolygon extends OSMMeta {
  featureType: 'water';
  waterType:   WaterType;
  /** Outer boundary polygon */
  polygon:     Ring;
  /** Area in square metres — for LOD and label visibility decisions */
  areaSqM?:    number;
  /**
   * Surface elevation above mean sea level in metres.
   * Bangalore lakes sit ~900 m ASL.
   */
  elevation?:  number;
  /** Whether the water body is seasonal / intermittent */
  seasonal?:   boolean;
}

/**
 * A green area: park, garden, forest, grass, or recreational ground.
 * Derived from OSM `leisure=park`, `landuse=forest/grass`, etc.
 */
export interface ParkArea extends OSMMeta {
  featureType: 'park';
  greenType:   GreenType;
  /** Outer boundary polygon */
  polygon:     Ring;
  /**
   * Optional inner sub-features (paths, clearings).
   * Not rendered individually — used to vary procedural tree placement.
   */
  subPaths?:   Ring[];
  areaSqM?:    number;
  /**
   * Fractional tree canopy cover (0–1).
   * Used to control procedural tree instance density.
   */
  treeDensity?: number;
}

/**
 * A named point of interest — a pin on the city map.
 * Derived from OSM Nodes or Way centroids with `amenity=*`, `tourism=*`, etc.
 */
export interface Landmark extends OSMMeta {
  featureType:  'landmark';
  coordinates:  LngLat;
  category:
    | 'civic'       // Vidhana Soudha, BBMP
    | 'commercial'  // UB City, Mantri Mall
    | 'educational' // IISc, IITs
    | 'religious'   // Bull Temple, Ulsoor Mosque
    | 'transit'     // Kempegowda Bus Stand, Metro stations
    | 'hospital'
    | 'hotel'
    | 'other';
  /** Icon key referenced by the UI label renderer */
  iconKey?:     string;
  /** Approximate height for label offset */
  heightHint?:  number;
}

// ─── Urban hierarchy imports ─────────────────────────────────────────────────

import type { District } from './district';
import type { CityBlock } from './block';

// ─── Composite City Payload ───────────────────────────────────────────────────

/**
 * Root data structure consumed by <CityScene>.
 *
 * Replace `mockBangalore` with a real OSM/Overpass fetch and this
 * interface ensures no TypeScript refactoring is needed.
 *
 * Prompt 4 additions:
 *   - districts: Voronoi-derived spatial regions (CBD, Residential, etc.)
 *   - blocks: Road-enclosed land parcels subdivided into building lots
 */
export interface CityData {
  /** Human-readable city name */
  cityName: string;

  /**
   * Geographic centre of the rendered area [longitude, latitude].
   * All world-space 3D positions are calculated relative to this point.
   */
  centre: LngLat;

  /**
   * Projection scale: world-units per metre.
   * Default 1.0 means 1 Three.js unit = 1 metre.
   * Use 0.1 to shrink the city by 10× for a miniature digital-twin look.
   */
  metresToUnit: number;

  /**
   * Geographic bounding box: [minLng, minLat, maxLng, maxLat].
   * All features should fall within this box.
   */
  bbox: [number, number, number, number];

  roads:     RoadWay[];
  buildings: BuildingFootprint[];
  water:     LakePolygon[];
  parks:     ParkArea[];
  landmarks: Landmark[];

  // ── Urban hierarchy layers (Prompt 4) ──────────────────────────────────────

  /**
   * Voronoi-derived spatial districts. Each district carries a DistrictProfile
   * controlling building density, height caps, and architectural style.
   * Generated server-side by districtGenerator.ts.
   */
  districts?: District[];

  /**
   * Road-enclosed city blocks, each subdivided into BuildingLots.
   * Generated server-side by blockSubdivision.ts.
   */
  blocks?: CityBlock[];
}
