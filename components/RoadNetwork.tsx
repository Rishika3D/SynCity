'use client';

/**
 * components/RoadNetwork.tsx
 *
 * Renders all roads as flat ribbon meshes.
 * Phase 5 optimization: merges ALL ribbons of the same road category into
 * ONE BufferGeometry — exactly 4 draw calls regardless of road count.
 * (Was: one draw call per road = ~1200 draw calls.)
 *
 * Day/Night adaptive via uDayFactor uniform.
 */

import { useMemo, useEffect } from 'react';
import { useFrame }           from '@react-three/fiber';
import * as THREE             from 'three';
import type { LngLat, RoadWay } from '@/types/osm';
import { RoadType }             from '@/types/osm';
import { projectCoords }        from '@/utils/geoProject';
import { useTimeOfDay }         from '@/contexts/TimeOfDayContext';

type RoadCategory = 0 | 1 | 2 | 3;

interface RoadStyle { halfWidthM: number; elevation: number; category: RoadCategory; }

const ROAD_STYLE: Partial<Record<RoadType, RoadStyle>> = {
  [RoadType.Motorway]:     { halfWidthM: 14,  elevation: 0.18, category: 0 },
  [RoadType.MotorwayLink]: { halfWidthM:  6,  elevation: 0.18, category: 0 },
  [RoadType.Trunk]:        { halfWidthM: 10,  elevation: 0.14, category: 0 },
  [RoadType.TrunkLink]:    { halfWidthM:  5,  elevation: 0.14, category: 1 },
  [RoadType.Primary]:      { halfWidthM:  7,  elevation: 0.12, category: 1 },
  [RoadType.PrimaryLink]:  { halfWidthM:  4,  elevation: 0.12, category: 1 },
  [RoadType.Secondary]:    { halfWidthM:  5,  elevation: 0.09, category: 2 },
  [RoadType.Tertiary]:     { halfWidthM: 3.5, elevation: 0.07, category: 2 },
  [RoadType.Residential]:  { halfWidthM: 2.5, elevation: 0.06, category: 3 },
  [RoadType.Service]:      { halfWidthM: 1.8, elevation: 0.05, category: 3 },
  [RoadType.Footway]:      { halfWidthM: 1.0, elevation: 0.04, category: 3 },
  [RoadType.Cycleway]:     { halfWidthM: 1.0, elevation: 0.04, category: 3 },
  [RoadType.Unclassified]: { halfWidthM: 2.5, elevation: 0.06, category: 3 },
};
const FALLBACK: RoadStyle = { halfWidthM: 2.5, elevation: 0.06, category: 3 };

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const ROAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ROAD_FRAG = /* glsl */`
  uniform vec3  uRoadColorNight;
  uniform vec3  uRoadColorDay;
  uniform vec3  uEdgeColorNight;
  uniform vec3  uEdgeColorDay;
  uniform float uEdgeWidth;
  uniform float uTime;
  uniform float uCategory;
  uniform float uDayFactor;

  varying vec2 vUv;

  void main() {
    float u = vUv.x;
    float v = vUv.y;

    vec3 roadColor = mix(uRoadColorNight, uRoadColorDay, uDayFactor);
    vec3 edgeColor = mix(uEdgeColorNight, uEdgeColorDay, uDayFactor);

    float edgeDist = min(u, 1.0 - u);
    float glow     = 1.0 - smoothstep(0.0, uEdgeWidth, edgeDist);
    float coreGlow = 1.0 - smoothstep(0.0, uEdgeWidth * 0.22, edgeDist);

    float streamV     = fract(v * 6.0 - uTime * 0.6);
    float streamPulse = (0.5 + 0.5 * sin(streamV * 6.28318)) * 0.06;
    float centreMask  = 1.0 - smoothstep(0.0, 0.12, abs(u - 0.5));
    float stream      = streamPulse * centreMask * (1.0 - uDayFactor);

    float lane = 0.0;
    if (uCategory < 2.0) {
      float dashOn = step(0.38, fract(v * 14.0 - uTime * 0.35));
      lane = (1.0 - smoothstep(0.0, 0.038, abs(u - 0.5))) * dashOn * 0.65;
    }

    vec3 col = roadColor;
    col += edgeColor * glow     * mix(0.55, 0.15, uDayFactor);
    col += edgeColor * coreGlow * mix(5.5,  0.3,  uDayFactor);
    col += edgeColor * stream;
    col += edgeColor * lane * 0.75;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Ribbon builder ───────────────────────────────────────────────────────────

function buildRibbon(
  curve: THREE.CatmullRomCurve3,
  halfW: number,
  segs:  number,
): { positions: number[]; uvs: number[]; normals: number[]; indices: number[]; } {
  const pts = curve.getPoints(segs);
  const n   = pts.length;
  const positions: number[] = [];
  const uvs:       number[] = [];
  const normals:   number[] = [];
  const indices:   number[] = [];

  for (let i = 0; i < n; i++) {
    const t    = Math.min(Math.max(i / (n - 1), 0.0005), 0.9995);
    const tan  = curve.getTangentAt(t).normalize();
    const perp = new THREE.Vector3(-tan.z, 0, tan.x);
    const p    = pts[i];
    const L    = p.clone().addScaledVector(perp,  halfW);
    const R    = p.clone().addScaledVector(perp, -halfW);

    positions.push(L.x, L.y, L.z, R.x, R.y, R.z);
    uvs.push(0, t, 1, t);
    normals.push(0, 1, 0, 0, 1, 0);
  }

  // Note: indices are LOCAL to this ribbon and will be offset when merging
  for (let i = 0; i < n - 1; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }

  return { positions, uvs, normals, indices };
}

// ─── Merge ribbons per category → 4 BufferGeometries ──────────────────────

function mergeRibbonsByCategory(
  roads:  RoadWay[],
  centre: LngLat,
  m2u:    number,
): Record<RoadCategory, THREE.BufferGeometry> {

  const buckets: Record<RoadCategory, {
    positions: number[]; uvs: number[]; normals: number[]; indices: number[];
    vertexOffset: number;
  }> = {
    0: { positions: [], uvs: [], normals: [], indices: [], vertexOffset: 0 },
    1: { positions: [], uvs: [], normals: [], indices: [], vertexOffset: 0 },
    2: { positions: [], uvs: [], normals: [], indices: [], vertexOffset: 0 },
    3: { positions: [], uvs: [], normals: [], indices: [], vertexOffset: 0 },
  };

  for (const road of roads) {
    if (road.coordinates.length < 2) continue;
    const style  = ROAD_STYLE[road.roadType] ?? FALLBACK;
    const hw     = style.halfWidthM * m2u;
    const pts3d  = projectCoords(road.coordinates, centre, m2u, style.elevation);
    if (pts3d.length < 2) continue;

    const curve  = new THREE.CatmullRomCurve3(pts3d, false, 'catmullrom', 0.5);
    const segs   = Math.max(20, road.coordinates.length * 8);
    const ribbon = buildRibbon(curve, hw, segs);
    const bkt    = buckets[style.category];

    // Offset indices by current vertex count
    const offset = bkt.vertexOffset;
    for (const idx of ribbon.indices) bkt.indices.push(idx + offset);
    bkt.positions.push(...ribbon.positions);
    bkt.uvs.push(...ribbon.uvs);
    bkt.normals.push(...ribbon.normals);
    bkt.vertexOffset += ribbon.positions.length / 3;
  }

  const result = {} as Record<RoadCategory, THREE.BufferGeometry>;
  for (const cat of [0, 1, 2, 3] as RoadCategory[]) {
    const bkt = buckets[cat];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bkt.positions, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(bkt.uvs,       2));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(bkt.normals,   3));
    if (bkt.indices.length > 0) geo.setIndex(bkt.indices);
    result[cat] = geo;
  }
  return result;
}

// ─── Material factory ─────────────────────────────────────────────────────────

function makeMat(cat: RoadCategory): THREE.ShaderMaterial {
  const edgeN: Record<RoadCategory, string> = { 0: '#00f3ff', 1: '#00d8f0', 2: '#0088bb', 3: '#004466' };
  const edgeD: Record<RoadCategory, string> = { 0: '#ffffff', 1: '#dddddd', 2: '#aaaaaa', 3: '#888888' };
  const eW:    Record<RoadCategory, number> = { 0: 0.12, 1: 0.15, 2: 0.18, 3: 0.24 };

  return new THREE.ShaderMaterial({
    vertexShader:   ROAD_VERT,
    fragmentShader: ROAD_FRAG,
    uniforms: {
      uRoadColorNight: { value: new THREE.Color('#07070F') },
      uRoadColorDay:   { value: new THREE.Color('#4a4a55') },
      uEdgeColorNight: { value: new THREE.Color(edgeN[cat]) },
      uEdgeColorDay:   { value: new THREE.Color(edgeD[cat]) },
      uEdgeWidth:      { value: eW[cat] },
      uTime:           { value: 0 },
      uCategory:       { value: cat as number },
      uDayFactor:      { value: 0 },
    },
    side:        THREE.DoubleSide,
    depthWrite:  true,
    transparent: false,
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RoadNetworkProps { roads: RoadWay[]; centre: LngLat; metresToUnit: number; }

export function RoadNetwork({ roads, centre, metresToUnit }: RoadNetworkProps) {
  const { dayFactor } = useTimeOfDay();

  // 4 merged geometries — one per category
  const geos = useMemo(
    () => mergeRibbonsByCategory(roads, centre, metresToUnit),
    [roads, centre, metresToUnit],
  );

  // 4 materials
  const mats = useMemo<Record<RoadCategory, THREE.ShaderMaterial>>(
    () => ({ 0: makeMat(0), 1: makeMat(1), 2: makeMat(2), 3: makeMat(3) }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    (Object.values(mats) as THREE.ShaderMaterial[]).forEach(m => {
      m.uniforms.uTime.value      = t;
      m.uniforms.uDayFactor.value = dayFactor;
    });
  });

  useEffect(() => () => {
    Object.values(geos).forEach(g => g.dispose());
    Object.values(mats).forEach(m => m.dispose());
  }, [geos, mats]);

  return (
    <group name="road-network">
      {([0, 1, 2, 3] as RoadCategory[]).map(cat => (
        geos[cat].attributes.position?.count > 0 && (
          <mesh
            key={cat}
            geometry={geos[cat]}
            material={mats[cat]}
            renderOrder={2}
            receiveShadow={false}
          />
        )
      ))}
    </group>
  );
}
