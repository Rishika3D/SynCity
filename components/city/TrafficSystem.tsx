'use client';

/**
 * components/city/TrafficSystem.tsx
 *
 * Animated traffic light trails flowing along road splines.
 * GPU point sprites — headlights (warm white) + taillights (red).
 *
 * DataTexture layout — 2D grid to stay within WebGL MAX_TEXTURE_SIZE:
 *   Width  = PATH_SAMPLES (64 columns, one sample per column)
 *   Height = road count   (one row per road, ≤ MAX_ROADS = 300)
 *   Format = RGBA Float   — R=x, G=y, B=z, A=unused
 *
 * Vertex shader UV: u = sampleIndex/PATH_SAMPLES, v = roadIndex/texHeight
 *
 * Day/Night adaptive:
 *   Night: bright additive particles for neon bloom
 *   Day:   smaller, dimmer, still visible as moving vehicles
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame }               from '@react-three/fiber';
import * as THREE                 from 'three';
import type { RoadWay, LngLat }  from '@/types/osm';
import { RoadType }               from '@/types/osm';
import { projectCoords }          from '@/utils/geoProject';
import { useTimeOfDay }           from '@/contexts/TimeOfDayContext';

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_PARTICLES  = 4_000;
const PATH_SAMPLES   = 64;      // columns in the 2D texture (power-of-2 friendly)
const MAX_ROADS      = 300;     // rows in the 2D texture  (64×300 = 19,200 px — safe)
const PARTICLE_Y     = 0.38;    // elevation above road surface

const ROAD_SPEED: Partial<Record<RoadType, number>> = {
  [RoadType.Motorway]:     12.0,
  [RoadType.MotorwayLink]: 10.0,
  [RoadType.Trunk]:         9.0,
  [RoadType.TrunkLink]:     7.0,
  [RoadType.Primary]:       6.0,
  [RoadType.PrimaryLink]:   5.0,
  [RoadType.Secondary]:     4.5,
  [RoadType.Tertiary]:      3.5,
  [RoadType.Residential]:   2.5,
};

const ROAD_DENSITY: Partial<Record<RoadType, number>> = {
  [RoadType.Motorway]:     8,
  [RoadType.MotorwayLink]: 5,
  [RoadType.Trunk]:        6,
  [RoadType.TrunkLink]:    4,
  [RoadType.Primary]:      5,
  [RoadType.PrimaryLink]:  3,
  [RoadType.Secondary]:    3,
  [RoadType.Tertiary]:     2,
  [RoadType.Residential]:  1,
};

// ─── Seeded random ────────────────────────────────────────────────────────────

const sr = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

// ─── Road baking ─────────────────────────────────────────────────────────────

interface BakedRoad { points: Float32Array; speed: number; density: number; length: number; }

function bakeRoads(roads: RoadWay[], centre: LngLat, m2u: number): BakedRoad[] {
  const out: BakedRoad[] = [];
  for (const road of roads) {
    if (out.length >= MAX_ROADS) break;
    if (road.coordinates.length < 2) continue;
    const speed   = ROAD_SPEED[road.roadType];
    const density = ROAD_DENSITY[road.roadType];
    if (!speed || !density) continue;
    const pts3d = projectCoords(road.coordinates, centre, m2u, PARTICLE_Y);
    if (pts3d.length < 2) continue;
    const curve  = new THREE.CatmullRomCurve3(pts3d, false, 'catmullrom', 0.5);
    const length = curve.getLength();
    if (length < 5) continue;
    const points = new Float32Array(PATH_SAMPLES * 3);
    for (let i = 0; i < PATH_SAMPLES; i++) {
      const p = curve.getPointAt(i / (PATH_SAMPLES - 1));
      points[i * 3] = p.x; points[i * 3 + 1] = p.y; points[i * 3 + 2] = p.z;
    }
    out.push({ points, speed, density, length });
  }
  return out;
}

// ─── Particle attributes ─────────────────────────────────────────────────────

function makeParticles(roads: BakedRoad[]) {
  const roadIdx  = new Float32Array(MAX_PARTICLES);
  const tOff     = new Float32Array(MAX_PARTICLES);
  const spd      = new Float32Array(MAX_PARTICLES);
  const dir      = new Float32Array(MAX_PARTICLES);
  const lat      = new Float32Array(MAX_PARTICLES);
  let count = 0;

  for (let ri = 0; ri < roads.length && count < MAX_PARTICLES; ri++) {
    const r  = roads[ri];
    const n  = Math.ceil(r.density * r.length / 100);
    for (let pi = 0; pi < n && count < MAX_PARTICLES; pi++) {
      const s = ri * 1000 + pi;
      roadIdx[count] = ri;
      tOff[count]    = sr(s * 1.1);
      spd[count]     = r.speed * (0.7 + 0.6 * sr(s * 2.3));
      dir[count]     = sr(s * 3.7) > 0.5 ? 1.0 : -1.0;
      lat[count]     = (sr(s * 4.9) - 0.5) * 0.6;
      count++;
    }
  }
  return { roadIdx, tOff, spd, dir, lat, count };
}

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  uniform float      uTime;
  uniform float      uDayFactor;
  uniform sampler2D  uPathTex;   // PATH_SAMPLES wide × roadCount tall
  uniform float      uTexH;      // actual texture height (= road count)

  attribute float aRoad;
  attribute float aTOff;
  attribute float aSpd;
  attribute float aDir;
  attribute float aLat;

  varying float vDir;
  varying float vDay;

  vec3 roadPt(float road, float t) {
    // v coordinate centres on the road's row
    float v  = (road + 0.5) / uTexH;
    float u0 = (floor(t * (${PATH_SAMPLES}.0 - 1.0)) + 0.5) / ${PATH_SAMPLES}.0;
    float u1 = min(u0 + 1.0 / ${PATH_SAMPLES}.0, (${PATH_SAMPLES}.0 - 0.5) / ${PATH_SAMPLES}.0);
    float f  = fract(t * (${PATH_SAMPLES}.0 - 1.0));
    vec3 p0 = texture2D(uPathTex, vec2(u0, v)).rgb;
    vec3 p1 = texture2D(uPathTex, vec2(u1, v)).rgb;
    return mix(p0, p1, f);
  }

  void main() {
    float rawT = fract(aTOff + uTime * aSpd * 0.006 * aDir);
    float t    = aDir > 0.0 ? rawT : 1.0 - rawT;

    vec3 pos     = roadPt(aRoad, t);
    vec3 posNext = roadPt(aRoad, clamp(t + 0.02, 0.0, 1.0));
    vec3 tang    = normalize(posNext - pos);
    vec3 lateral = normalize(vec3(-tang.z, 0.0, tang.x));
    pos += lateral * aLat;

    vDir = aDir;
    vDay = uDayFactor;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position  = projectionMatrix * mv;
    float base   = mix(5.0, 2.5, uDayFactor);
    gl_PointSize = base * (180.0 / -mv.z);
  }
`;

const FRAG = /* glsl */`
  varying float vDir;
  varying float vDay;

  void main() {
    vec2  uv   = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);
    if (dist > 1.0) discard;

    float alpha = (1.0 - smoothstep(0.0, 1.0, dist)) * mix(0.85, 0.45, vDay);
    vec3  head  = vec3(1.00, 0.95, 0.85) * mix(4.0, 1.2, vDay);
    vec3  tail  = vec3(1.00, 0.12, 0.04) * mix(4.0, 1.2, vDay);
    vec3  col   = vDir > 0.0 ? head : tail;

    gl_FragColor = vec4(col, alpha * 0.6);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface TrafficSystemProps {
  roads: RoadWay[]; centre: LngLat; metresToUnit: number;
}

export function TrafficSystem({ roads, centre, metresToUnit }: TrafficSystemProps) {
  const { dayFactor } = useTimeOfDay();

  const bakedRoads = useMemo(() => bakeRoads(roads, centre, metresToUnit),
    [roads, centre, metresToUnit]);

  // ── 2D DataTexture: PATH_SAMPLES wide × roadCount tall ──────────────────────
  const { pathTex, texH } = useMemo(() => {
    const h    = Math.max(bakedRoads.length, 1);
    const w    = PATH_SAMPLES;
    const data = new Float32Array(w * h * 4);

    for (let ri = 0; ri < bakedRoads.length; ri++) {
      const road = bakedRoads[ri];
      for (let si = 0; si < PATH_SAMPLES; si++) {
        const px = (ri * w + si) * 4;
        data[px]     = road.points[si * 3];
        data[px + 1] = road.points[si * 3 + 1];
        data[px + 2] = road.points[si * 3 + 2];
        data[px + 3] = 1.0;
      }
    }

    const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter  = THREE.LinearFilter;
    tex.magFilter  = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { pathTex: tex, texH: h };
  }, [bakedRoads]);

  // ── Particle geometry + material ────────────────────────────────────────────
  const { geo, mat } = useMemo(() => {
    const p   = makeParticles(bakedRoads);
    const cnt = p.count;

    const g = new THREE.BufferGeometry();
    // Dummy positions — vertex shader overwrites via texture lookup
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cnt * 3), 3));
    g.setAttribute('aRoad', new THREE.Float32BufferAttribute(p.roadIdx.slice(0, cnt), 1));
    g.setAttribute('aTOff', new THREE.Float32BufferAttribute(p.tOff.slice(0, cnt), 1));
    g.setAttribute('aSpd',  new THREE.Float32BufferAttribute(p.spd.slice(0, cnt), 1));
    g.setAttribute('aDir',  new THREE.Float32BufferAttribute(p.dir.slice(0, cnt), 1));
    g.setAttribute('aLat',  new THREE.Float32BufferAttribute(p.lat.slice(0, cnt), 1));
    g.setDrawRange(0, cnt);

    const m = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:      { value: 0 },
        uDayFactor: { value: 0 },
        uPathTex:   { value: pathTex },
        uTexH:      { value: texH },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });
    return { geo: g, mat: m };
  }, [bakedRoads, pathTex, texH]);

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value      = clock.getElapsedTime();
    mat.uniforms.uDayFactor.value = dayFactor;
  });

  useEffect(() => () => { geo.dispose(); mat.dispose(); pathTex.dispose(); },
    [geo, mat, pathTex]);

  if (bakedRoads.length === 0) return null;

  return (
    <points geometry={geo} material={mat}
      frustumCulled={false} renderOrder={6} />
  );
}
