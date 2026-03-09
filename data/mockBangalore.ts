/**
 * data/mockBangalore.ts
 *
 * Structured mock dataset for central Bangalore (Bengaluru).
 * Centre: 12.9716°N, 77.5946°E
 *
 * All coordinates are [longitude, latitude] — GeoJSON standard.
 * Heights are in metres. Bangalore sits ~900 m above sea level.
 *
 * REPLACE WITH REAL DATA: swap this export with a fetch from
 *   https://overpass-api.de/api/interpreter?data=[bbox:…]
 * The CityData interface ensures zero TypeScript changes are needed.
 */

import type { CityData } from '@/types/osm';
import { RoadType, Zone, WaterType, GreenType } from '@/types/osm';

// ─── Geographic constants ─────────────────────────────────────────────────────
const LNG = 77.5946;   // centre longitude
const LAT = 12.9716;   // centre latitude

/** Offset a coordinate by approximate metres (flat-earth approx, fine for <10km) */
function offset(
  baseLng: number,
  baseLat: number,
  dxMetres: number,
  dyMetres: number,
): [number, number] {
  // ~111,320 m per degree latitude; longitude varies by cos(lat)
  const dLat = dyMetres / 111_320;
  const dLng = dxMetres / (111_320 * Math.cos((baseLat * Math.PI) / 180));
  return [baseLng + dLng, baseLat + dLat];
}

/** Build a rectangular footprint polygon centred at (cx, cy) with half-extents (hw, hd) in metres */
function rect(
  cx: number, cy: number,
  hwMetres: number, hdMetres: number,
  rotateDeg = 0,
): [number, number][] {
  const corners: [number, number][] = [
    [-hwMetres, -hdMetres],
    [ hwMetres, -hdMetres],
    [ hwMetres,  hdMetres],
    [-hwMetres,  hdMetres],
    [-hwMetres, -hdMetres], // closed ring
  ];

  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return corners.map(([dx, dy]) => {
    const rx = cos * dx - sin * dy;
    const ry = sin * dx + cos * dy;
    return offset(cx, cy, rx, ry);
  });
}

// ─── Mock dataset ─────────────────────────────────────────────────────────────
export const mockBangalore: CityData = {
  cityName:     'Bengaluru',
  centre:       [LNG, LAT],
  metresToUnit: 0.10,   // 1 m = 0.1 Three.js unit → 10 m = 1 unit (miniature scale)
  bbox:         [77.540, 12.940, 77.650, 13.005],
  source: 'mock' as const,

  // ─── ROADS ─────────────────────────────────────────────────────────────────
  //
  // All four major arteries have been upgraded with dense, realistic spline
  // waypoints that trace actual Bangalore road geometry.
  // dx = East offset in metres, dy = North offset in metres from city centre.
  //
  roads: [
    // ══════════════════════════════════════════════════════════════════════
    // Artery 1 — MG Road  (ENE primary arterial through the CBD)
    //   Real path: Kempe Gowda Circle → Corp. Circle → Trinity → Halasuru
    //   Slight northward drift and kink at Trinity Circle
    // ══════════════════════════════════════════════════════════════════════
    {
      osmId:       100001,
      featureType: 'road',
      name:        'Mahatma Gandhi Road',
      label:       'MG Road',
      roadType:    RoadType.Primary,
      lanes:       6,
      oneway:      false,
      maxspeed:    50,
      coordinates: [
        offset(LNG, LAT, -3600,  320),   // Kempe Gowda Circle (west)
        offset(LNG, LAT, -3000,  310),
        offset(LNG, LAT, -2400,  295),
        offset(LNG, LAT, -1800,  275),   // Corporation Circle area
        offset(LNG, LAT, -1200,  255),
        offset(LNG, LAT,  -600,  240),   // Cauvery Bhavan
        offset(LNG, LAT,     0,  230),   // City centre
        offset(LNG, LAT,   600,  220),   // UB City / Vittal Mallya Rd
        offset(LNG, LAT,  1200,  215),
        offset(LNG, LAT,  1800,  225),   // Trinity Circle (slight kink)
        offset(LNG, LAT,  2400,  240),
        offset(LNG, LAT,  3000,  260),
        offset(LNG, LAT,  3500,  280),   // Halasuru / Ulsoor end
      ],
      tags: { highway: 'primary', lanes: '6', name: 'Mahatma Gandhi Road' },
      source: 'mock',
    },

    // ══════════════════════════════════════════════════════════════════════
    // Artery 2 — Outer Ring Road (ORR)
    //   A large irregular loop ~6-8 km from centre.
    //   Traces the real ORR: Hebbal → Marathahalli → Silk Board → Mysore Rd
    //   16 waypoints, closed loop.
    // ══════════════════════════════════════════════════════════════════════
    {
      osmId:       100002,
      featureType: 'road',
      name:        'Outer Ring Road',
      label:       'ORR',
      roadType:    RoadType.Trunk,
      lanes:       8,
      oneway:      false,
      maxspeed:    60,
      elevated:    false,
      coordinates: [
        offset(LNG, LAT,  -800,  6300),  // Hebbal flyover (north)
        offset(LNG, LAT,  1200,  6500),
        offset(LNG, LAT,  3200,  6000),  // Nagawara
        offset(LNG, LAT,  5400,  4800),  // Banaswadi
        offset(LNG, LAT,  6800,  3200),
        offset(LNG, LAT,  8000,  1200),  // Marathahalli area (east)
        offset(LNG, LAT,  8200, -1000),
        offset(LNG, LAT,  7500, -3200),  // HSR / Bellandur
        offset(LNG, LAT,  5800, -5000),
        offset(LNG, LAT,  3500, -6200),  // Silk Board (south)
        offset(LNG, LAT,   800, -6800),
        offset(LNG, LAT, -2000, -6400),  // Bannerghatta Rd junction
        offset(LNG, LAT, -4500, -5200),  // JP Nagar
        offset(LNG, LAT, -6200, -3000),  // Mysore Road (west)
        offset(LNG, LAT, -7000,  -200),
        offset(LNG, LAT, -6500,  2800),  // Tumkur Rd junction (NW)
        offset(LNG, LAT, -4800,  5000),  // Yeshwanthpur
        offset(LNG, LAT, -2500,  6200),
        offset(LNG, LAT,  -800,  6300),  // closed → back to Hebbal
      ],
      tags: { highway: 'trunk', lanes: '8', ref: 'ORR' },
      source: 'mock',
    },

    // ══════════════════════════════════════════════════════════════════════
    // Artery 3 — NH 44 / Hosur Road
    //   South from Silk Board through Bommanahalli to Electronic City.
    //   Slight east–west meandering typical of the real corridor.
    // ══════════════════════════════════════════════════════════════════════
    {
      osmId:       100003,
      featureType: 'road',
      name:        'National Highway 44',
      label:       'NH-44 / Hosur Rd',
      roadType:    RoadType.Motorway,
      lanes:       6,
      oneway:      false,
      maxspeed:    80,
      elevated:    false,
      coordinates: [
        offset(LNG, LAT,   200,  2400),  // near City Market / Krishnarajendra Rd
        offset(LNG, LAT,   400,  1200),
        offset(LNG, LAT,   600,    200),  // Lalbagh Road junction
        offset(LNG, LAT,   850,  -900),
        offset(LNG, LAT,  1100, -2000),  // Koramangala 6th Block
        offset(LNG, LAT,  1250, -3400),  // Madiwala
        offset(LNG, LAT,  1100, -4600),  // Silk Board Junction
        offset(LNG, LAT,  1000, -5800),  // Bommanahalli
        offset(LNG, LAT,  1050, -7200),
        offset(LNG, LAT,  1150, -8600),  // Electronic City Phase 1
        offset(LNG, LAT,  1250,-10000),  // Electronic City Phase 2
      ],
      tags: { highway: 'motorway', ref: 'NH 44', lanes: '6' },
      source: 'mock',
    },

    // ══════════════════════════════════════════════════════════════════════
    // Artery 4 — Old Madras Road / Whitefield Road (east arterial)
    //   The main spine heading east from city centre toward ITPL/Whitefield.
    //   Rises slightly north then bends south-east through Indiranagar.
    // ══════════════════════════════════════════════════════════════════════
    {
      osmId:       100008,
      featureType: 'road',
      name:        'Old Madras Road',
      label:       'Old Madras Rd / Whitefield Rd',
      roadType:    RoadType.Primary,
      lanes:       6,
      oneway:      false,
      maxspeed:    60,
      coordinates: [
        offset(LNG, LAT,   200,   150),  // Richmond Circle (start)
        offset(LNG, LAT,  1000,   280),
        offset(LNG, LAT,  1900,   450),  // Indiranagar 100 Ft Rd junction
        offset(LNG, LAT,  2800,   520),
        offset(LNG, LAT,  3800,   400),  // HAL Old Airport Rd junction
        offset(LNG, LAT,  4900,   200),
        offset(LNG, LAT,  6000,  -100),  // Marathahalli Bridge
        offset(LNG, LAT,  7200,  -350),
        offset(LNG, LAT,  8500,  -500),  // ITPL / Whitefield Road
        offset(LNG, LAT,  9800,  -600),
        offset(LNG, LAT, 11200,  -650),  // Whitefield
      ],
      tags: { highway: 'primary', lanes: '6', ref: 'SH 35' },
      source: 'mock',
    },

    // ── Supporting roads (unchanged) ──────────────────────────────────────
    {
      osmId:       100004,
      featureType: 'road',
      name:        'Residency Road',
      roadType:    RoadType.Secondary,
      lanes:       4,
      coordinates: [
        offset(LNG, LAT, -1400, -650),
        offset(LNG, LAT,  -700, -600),
        offset(LNG, LAT,     0, -560),
        offset(LNG, LAT,   800, -520),
      ],
      tags: { highway: 'secondary', lanes: '4' },
      source: 'mock',
    },
    {
      osmId:       100005,
      featureType: 'road',
      name:        'Brigade Road',
      roadType:    RoadType.Secondary,
      lanes:       2,
      coordinates: [
        offset(LNG, LAT,  300,  180),
        offset(LNG, LAT,  380,  -80),
        offset(LNG, LAT,  420, -380),
        offset(LNG, LAT,  460, -650),
      ],
      tags: { highway: 'secondary' },
      source: 'mock',
    },
    {
      osmId:       100006,
      featureType: 'road',
      name:        'Indiranagar 100 Feet Road',
      label:       '100 Feet Rd',
      roadType:    RoadType.Primary,
      lanes:       4,
      coordinates: [
        offset(LNG, LAT, 3600,  1400),
        offset(LNG, LAT, 3650,   800),
        offset(LNG, LAT, 3680,   100),
        offset(LNG, LAT, 3700,  -600),
        offset(LNG, LAT, 3720, -1300),
      ],
      tags: { highway: 'primary', lanes: '4' },
      source: 'mock',
    },
    {
      osmId:       100007,
      featureType: 'road',
      name:        'Koramangala Inner Ring Road',
      roadType:    RoadType.Tertiary,
      lanes:       2,
      coordinates: [
        offset(LNG, LAT,  1400, -1500),
        offset(LNG, LAT,  2000, -1900),
        offset(LNG, LAT,  2700, -2500),
        offset(LNG, LAT,  2700, -3200),
        offset(LNG, LAT,  2000, -3500),
        offset(LNG, LAT,  1300, -3400),
      ],
      tags: { highway: 'tertiary' },
      source: 'mock',
    },
  ],

  // ─── BUILDINGS ─────────────────────────────────────────────────────────────
  buildings: [
    // ── Vidhana Soudha (State Legislature) ───────────────────────────────
    {
      osmId:      200001,
      featureType: 'building',
      name:       'Vidhana Soudha',
      zone:       Zone.Government,
      footprint:  rect(LNG - 0.006, LAT + 0.004, 180, 120),
      height:     50,
      levels:     14,
      landmark:   'Vidhana Soudha',
      roofShape:  'dome',
      tags: { 'building': 'government', 'historic': 'yes' },
      source: 'mock',
    },

    // ── UB City (luxury mall & commercial tower) ──────────────────────────
    {
      osmId:      200002,
      featureType: 'building',
      name:       'UB City',
      zone:       Zone.Commercial,
      footprint:  rect(LNG + 0.003, LAT - 0.002, 100, 80),
      height:     105,
      levels:     28,
      landmark:   'UB City',
      roofShape:  'flat',
      tags: { 'building': 'commercial', 'height': '105' },
      source: 'mock',
    },

    // ── World Trade Center (CBD tower) ────────────────────────────────────
    {
      osmId:      200003,
      featureType: 'building',
      name:       'World Trade Center Bangalore',
      zone:       Zone.Commercial,
      footprint:  rect(LNG + 0.005, LAT + 0.001, 60, 60),
      height:     128,
      levels:     32,
      landmark:   'WTC',
      roofShape:  'flat',
      tags: { 'building': 'office', 'height': '128' },
      source: 'mock',
    },

    // ── Prestige Shantiniketan (mixed-use tower, Whitefield area) ─────────
    {
      osmId:      200004,
      featureType: 'building',
      name:       'Prestige Shantiniketan',
      zone:       Zone.Mixed,
      footprint:  rect(LNG + 0.040, LAT + 0.010, 90, 70),
      height:     95,
      levels:     25,
      roofShape:  'flat',
      tags: { 'building': 'mixed_use' },
      source: 'mock',
    },

    // ── IISc Main Building (educational) ─────────────────────────────────
    {
      osmId:      200005,
      featureType: 'building',
      name:       'Indian Institute of Science',
      zone:       Zone.Educational,
      footprint:  rect(LNG - 0.025, LAT + 0.020, 220, 160),
      height:     20,
      levels:     4,
      landmark:   'IISc',
      roofShape:  'gabled',
      tags: { 'building': 'university', 'amenity': 'university' },
      source: 'mock',
    },

    // ── Apollo Hospital (healthcare) ──────────────────────────────────────
    {
      osmId:      200006,
      featureType: 'building',
      name:       'Apollo Hospital',
      zone:       Zone.Healthcare,
      footprint:  rect(LNG + 0.010, LAT - 0.008, 70, 55),
      height:     42,
      levels:     12,
      roofShape:  'flat',
      tags: { 'building': 'hospital', 'amenity': 'hospital' },
      source: 'mock',
    },

    // ── Koramangala residential block 1 ───────────────────────────────────
    {
      osmId:      200007,
      featureType: 'building',
      zone:       Zone.Residential,
      footprint:  rect(LNG + 0.018, LAT - 0.014, 30, 25),
      height:     18,
      levels:     5,
      tags: { 'building': 'apartments' },
      source: 'mock',
    },

    // ── Koramangala residential block 2 ───────────────────────────────────
    {
      osmId:      200008,
      featureType: 'building',
      zone:       Zone.Residential,
      footprint:  rect(LNG + 0.022, LAT - 0.016, 25, 30),
      height:     24,
      levels:     7,
      tags: { 'building': 'apartments' },
      source: 'mock',
    },

    // ── Indiranagar commercial strip ──────────────────────────────────────
    {
      osmId:      200009,
      featureType: 'building',
      name:       'Indiranagar Commercial Block',
      zone:       Zone.Commercial,
      footprint:  rect(LNG + 0.030, LAT + 0.008, 55, 35, 5),
      height:     32,
      levels:     8,
      roofShape:  'flat',
      tags: { 'building': 'commercial' },
      source: 'mock',
    },

    // ── Bull Temple (religious, Basavanagudi) ─────────────────────────────
    {
      osmId:      200010,
      featureType: 'building',
      name:       'Bull Temple',
      zone:       Zone.Religious,
      footprint:  rect(LNG - 0.010, LAT - 0.025, 40, 30),
      height:     15,
      levels:     null as unknown as number,
      landmark:   'Bull Temple',
      roofShape:  'pyramid',
      tags: { 'building': 'temple', 'religion': 'hindu' },
      source: 'mock',
    },

    // ── Electronic City tech campus (large industrial-tech footprint) ──────
    {
      osmId:      200011,
      featureType: 'building',
      name:       'Electronic City Tech Park',
      zone:       Zone.Industrial,
      footprint:  rect(LNG + 0.010, LAT - 0.065, 300, 200),
      height:     28,
      levels:     7,
      tags: { 'building': 'industrial', 'landuse': 'commercial' },
      source: 'mock',
    },
  ],

  // ─── WATER ─────────────────────────────────────────────────────────────────
  water: [
    // ── Ulsoor Lake (central Bangalore) ──────────────────────────────────
    {
      osmId:      300001,
      featureType: 'water',
      name:       'Ulsoor Lake',
      waterType:  WaterType.Lake,
      areaSqM:    1_230_000,
      elevation:  920,
      seasonal:   false,
      polygon: [
        offset(LNG, LAT,  1800,  800),
        offset(LNG, LAT,  2800,  600),
        offset(LNG, LAT,  3200,  200),
        offset(LNG, LAT,  3100, -400),
        offset(LNG, LAT,  2500, -700),
        offset(LNG, LAT,  1600, -600),
        offset(LNG, LAT,  1200, -100),
        offset(LNG, LAT,  1400,  500),
        offset(LNG, LAT,  1800,  800), // closed
      ],
      tags: { 'natural': 'water', 'water': 'lake', 'name': 'Ulsoor Lake' },
      source: 'mock',
    },

    // ── Hebbal Lake (north) ────────────────────────────────────────────────
    {
      osmId:      300002,
      featureType: 'water',
      name:       'Hebbal Lake',
      waterType:  WaterType.Lake,
      areaSqM:    880_000,
      elevation:  910,
      seasonal:   false,
      polygon: [
        offset(LNG, LAT, -1200,  5200),
        offset(LNG, LAT,   200,  5400),
        offset(LNG, LAT,  1100,  5100),
        offset(LNG, LAT,  1000,  4400),
        offset(LNG, LAT,   100,  4100),
        offset(LNG, LAT, -1000,  4300),
        offset(LNG, LAT, -1200,  5200), // closed
      ],
      tags: { 'natural': 'water', 'water': 'lake', 'name': 'Hebbal Lake' },
      source: 'mock',
    },

    // ── Bellandur Lake (south-east, large) ────────────────────────────────
    {
      osmId:      300003,
      featureType: 'water',
      name:       'Bellandur Lake',
      waterType:  WaterType.Lake,
      areaSqM:    3_610_000,
      elevation:  905,
      seasonal:   false,
      polygon: [
        offset(LNG, LAT,  3000, -3500),
        offset(LNG, LAT,  5000, -3800),
        offset(LNG, LAT,  6000, -4500),
        offset(LNG, LAT,  5800, -5500),
        offset(LNG, LAT,  4500, -5800),
        offset(LNG, LAT,  3200, -5500),
        offset(LNG, LAT,  2500, -4800),
        offset(LNG, LAT,  2800, -4000),
        offset(LNG, LAT,  3000, -3500), // closed
      ],
      tags: { 'natural': 'water', 'water': 'lake', 'name': 'Bellandur Lake' },
      source: 'mock',
    },
  ],

  // ─── PARKS ─────────────────────────────────────────────────────────────────
  parks: [
    // ── Cubbon Park (heart of CBD) ────────────────────────────────────────
    {
      osmId:      400001,
      featureType: 'park',
      name:       'Cubbon Park',
      greenType:  GreenType.Park,
      areaSqM:    1_240_000,
      treeDensity: 0.72,
      polygon: [
        offset(LNG, LAT, -1800,  800),
        offset(LNG, LAT,  -200, 1000),
        offset(LNG, LAT,   400,  600),
        offset(LNG, LAT,   200, -200),
        offset(LNG, LAT, -1000, -400),
        offset(LNG, LAT, -2000,  100),
        offset(LNG, LAT, -1800,  800), // closed
      ],
      tags: { 'leisure': 'park', 'name': 'Cubbon Park' },
      source: 'mock',
    },

    // ── Lal Bagh Botanical Garden (south) ─────────────────────────────────
    {
      osmId:      400002,
      featureType: 'park',
      name:       'Lal Bagh Botanical Garden',
      greenType:  GreenType.Garden,
      areaSqM:    970_000,
      treeDensity: 0.80,
      polygon: [
        offset(LNG, LAT, -1200, -2000),
        offset(LNG, LAT,   200, -1800),
        offset(LNG, LAT,   800, -2400),
        offset(LNG, LAT,   600, -3200),
        offset(LNG, LAT, -1000, -3400),
        offset(LNG, LAT, -1600, -2800),
        offset(LNG, LAT, -1200, -2000), // closed
      ],
      tags: { 'leisure': 'garden', 'name': 'Lal Bagh Botanical Garden' },
      source: 'mock',
    },

    // ── IISc Campus green (north-west) ────────────────────────────────────
    {
      osmId:      400003,
      featureType: 'park',
      name:       'IISc Green Campus',
      greenType:  GreenType.Forest,
      areaSqM:    1_800_000,
      treeDensity: 0.65,
      polygon: [
        offset(LNG, LAT, -3000,  1500),
        offset(LNG, LAT, -1800,  1800),
        offset(LNG, LAT, -1400,  1200),
        offset(LNG, LAT, -2000,   600),
        offset(LNG, LAT, -3200,   800),
        offset(LNG, LAT, -3000,  1500), // closed
      ],
      tags: { 'landuse': 'forest', 'name': 'IISc Campus' },
      source: 'mock',
    },
  ],

  // ─── LANDMARKS ─────────────────────────────────────────────────────────────
  landmarks: [
    {
      osmId:       500001,
      featureType: 'landmark',
      name:        'Vidhana Soudha',
      coordinates: offset(LNG, LAT, -700, 450),
      category:    'civic',
      iconKey:     'government',
      heightHint:  50,
      source: 'mock',
    },
    {
      osmId:       500002,
      featureType: 'landmark',
      name:        'Kempegowda International Airport',
      coordinates: offset(LNG, LAT, -8000, 28000),
      category:    'transit',
      iconKey:     'airport',
      source: 'mock',
    },
    {
      osmId:       500003,
      featureType: 'landmark',
      name:        'Kempegowda Bus Stand',
      coordinates: offset(LNG, LAT, -600, 1200),
      category:    'transit',
      iconKey:     'bus',
      source: 'mock',
    },
    {
      osmId:       500004,
      featureType: 'landmark',
      name:        'UB City',
      coordinates: offset(LNG, LAT, 330, -250),
      category:    'commercial',
      iconKey:     'shopping',
      heightHint:  105,
      source: 'mock',
    },
    {
      osmId:       500005,
      featureType: 'landmark',
      name:        'IISc',
      coordinates: offset(LNG, LAT, -2600, 1900),
      category:    'educational',
      iconKey:     'university',
      source: 'mock',
    },
    {
      osmId:       500006,
      featureType: 'landmark',
      name:        'Bull Temple, Basavanagudi',
      coordinates: offset(LNG, LAT, -1100, -2600),
      category:    'religious',
      iconKey:     'temple',
      source: 'mock',
    },
    {
      osmId:       500007,
      featureType: 'landmark',
      name:        'Electronic City',
      coordinates: offset(LNG, LAT, 1000, -6500),
      category:    'commercial',
      iconKey:     'tech',
      source: 'mock',
    },
    {
      osmId:       500008,
      featureType: 'landmark',
      name:        'Indiranagar Metro Station',
      coordinates: offset(LNG, LAT, 3600, 300),
      category:    'transit',
      iconKey:     'metro',
      source: 'mock',
    },
  ],
} as CityData;
