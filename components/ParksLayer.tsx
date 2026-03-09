'use client';

/**
 * components/ParksLayer.tsx
 *
 * Renders park areas with an animated shader.
 * Day/Night adaptive:
 *   Night: very dark green with faint neon green pulse
 *   Day:   natural vibrant green with gentle shimmer
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame }                   from '@react-three/fiber';
import * as THREE                     from 'three';
import type { ParkArea, LngLat }     from '@/types/osm';
import { projectLngLat }             from '@/utils/geoProject';
import { useTimeOfDay }              from '@/contexts/TimeOfDayContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARK_Y       = 0.06;
const MIN_AREA_SQM = 2_000;
const MAX_PARKS    = 600;

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const PARK_VERT = /* glsl */`
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
  }
`;

const PARK_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3  uBaseColorNight;
  uniform vec3  uBaseColorDay;
  uniform vec3  uGlowColorNight;
  uniform vec3  uGlowColorDay;
  uniform float uDayFactor;

  varying vec3  vWorldPos;

  void main() {
    vec3 baseColor = mix(uBaseColorNight, uBaseColorDay, uDayFactor);
    vec3 glowColor = mix(uGlowColorNight, uGlowColorDay, uDayFactor);

    // ── Spatial pulse ───────────────────────────────────────────────────
    float phase = vWorldPos.x * 0.18 + vWorldPos.z * 0.13;
    float pulse = sin(uTime * 0.40 + phase) * 0.5 + 0.5;

    // ── Shimmer ─────────────────────────────────────────────────────────
    float shimmer = sin(uTime * 1.8 + vWorldPos.x * 0.9 - vWorldPos.z * 0.7)
                  * 0.5 + 0.5;
    shimmer *= 0.025;

    // ── Compose ─────────────────────────────────────────────────────────
    vec3 col = baseColor;

    // Glow: more visible during day as natural green, neon at night
    float pulseStr  = mix(0.03, 0.06, uDayFactor);
    float shimStr   = mix(0.4,  0.6,  uDayFactor);
    col += glowColor * pulse   * pulseStr;
    col += glowColor * shimmer * shimStr;

    // Opacity: more visible during day
    float opacity = mix(0.45, 0.70, uDayFactor);

    gl_FragColor = vec4(col, opacity);
  }
`;

// ─── Polygon geometry helpers ─────────────────────────────────────────────────

function buildFlatPolygon(
  ring:         LngLat[],
  centre:       LngLat,
  metresToUnit: number,
  y:            number,
): THREE.BufferGeometry | null {
  const pts = ring[0][0] === ring[ring.length - 1][0] &&
              ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring;

  if (pts.length < 3) return null;

  const vecs = pts.map(c => {
    const v = projectLngLat(c, centre, metresToUnit, 0);
    return new THREE.Vector2(v.x, v.z);
  });

  const shape    = new THREE.Shape(vecs);
  const shapeGeo = new THREE.ShapeGeometry(shape, 1);

  const pos = shapeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i), y, pos.getY(i));
  }
  pos.needsUpdate = true;
  shapeGeo.computeVertexNormals();

  return shapeGeo;
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geos.length === 0) return new THREE.BufferGeometry();
  if (geos.length === 1) return geos[0];

  let totalVerts   = 0;
  let totalIndices = 0;
  for (const g of geos) {
    totalVerts   += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : 0;
  }

  const positions = new Float32Array(totalVerts * 3);
  const indices: number[] = [];
  let vOffset = 0;

  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      positions[(vOffset + i) * 3]     = p.getX(i);
      positions[(vOffset + i) * 3 + 1] = p.getY(i);
      positions[(vOffset + i) * 3 + 2] = p.getZ(i);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) {
        indices.push(g.index.getX(i) + vOffset);
      }
    }
    vOffset += p.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (indices.length) merged.setIndex(indices);
  return merged;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ParksLayerProps {
  parks:        ParkArea[];
  centre:       LngLat;
  metresToUnit: number;
}

export function ParksLayer({ parks, centre, metresToUnit }: ParksLayerProps) {
  const { dayFactor } = useTimeOfDay();

  const geometry = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    let   rendered = 0;

    const sorted = [...parks].sort(
      (a, b) => (b.areaSqM ?? 0) - (a.areaSqM ?? 0),
    );

    for (const park of sorted) {
      if (rendered >= MAX_PARKS) break;
      if (!park.polygon || park.polygon.length < 3) continue;

      const area = park.areaSqM ?? 0;
      if (area > 0 && area < MIN_AREA_SQM) continue;

      const geo = buildFlatPolygon(park.polygon, centre, metresToUnit, PARK_Y);
      if (geo) { geos.push(geo); rendered++; }
    }

    return mergeGeos(geos);
  }, [parks, centre, metresToUnit]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   PARK_VERT,
    fragmentShader: PARK_FRAG,
    uniforms: {
      uTime:           { value: 0 },
      uBaseColorNight: { value: new THREE.Color('#020D04') },
      uBaseColorDay:   { value: new THREE.Color('#1a6830') },
      uGlowColorNight: { value: new THREE.Color('#00ff55') },
      uGlowColorDay:   { value: new THREE.Color('#55cc55') },
      uDayFactor:      { value: 0 },
    },
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  }), []);

  const matRef = useRef(material);

  useFrame(({ clock }) => {
    matRef.current.uniforms.uTime.value      = clock.getElapsedTime();
    matRef.current.uniforms.uDayFactor.value = dayFactor;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    return null;
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={1}
      frustumCulled={false}
    />
  );
}
