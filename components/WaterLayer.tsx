'use client';

/**
 * components/WaterLayer.tsx
 *
 * Renders water bodies (lakes, rivers, reservoirs, canals, ponds).
 * Day/Night adaptive:
 *   Night: dark midnight blue with cyan shimmer and subtle bloom
 *   Day:   bright blue water with white sparkle reflections
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame }                   from '@react-three/fiber';
import * as THREE                     from 'three';
import type { LakePolygon, LngLat }  from '@/types/osm';
import { projectLngLat }             from '@/utils/geoProject';
import { useTimeOfDay }              from '@/contexts/TimeOfDayContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const WATER_Y = 0.14;

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const WATER_VERT = /* glsl */`
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
  }
`;

const WATER_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3  uDeepColorNight;
  uniform vec3  uDeepColorDay;
  uniform vec3  uShimColorNight;
  uniform vec3  uShimColorDay;
  uniform float uDayFactor;

  varying vec3  vWorldPos;

  void main() {
    vec3 deepColor = mix(uDeepColorNight, uDeepColorDay, uDayFactor);
    vec3 shimColor = mix(uShimColorNight, uShimColorDay, uDayFactor);

    // ── Wave trains ─────────────────────────────────────────────────────
    float w1 = sin(vWorldPos.x * 1.10 + vWorldPos.z * 0.55 - uTime * 1.30);
    float w2 = sin(vWorldPos.x * 0.55 - vWorldPos.z * 0.90 + uTime * 0.85);
    float wave = (w1 * 0.55 + w2 * 0.45) * 0.5 + 0.5;

    // ── Pulse ───────────────────────────────────────────────────────────
    float pulse = sin(uTime * 0.38) * 0.5 + 0.5;

    // ── Compose ─────────────────────────────────────────────────────────
    vec3 col = deepColor;

    // Shimmer: more visible during day (sun reflections)
    float shimStr = mix(0.10, 0.20, uDayFactor);
    col += shimColor * wave  * shimStr;
    col += shimColor * pulse * 0.05;

    // Base emissive: strong at night for bloom, subtle during day
    float baseEmissive = mix(0.25, 0.05, uDayFactor);
    col += shimColor * baseEmissive;

    // Opacity: more opaque during day
    float opacity = mix(0.60, 0.75, uDayFactor);

    gl_FragColor = vec4(col, opacity);
  }
`;

// ─── Polygon geometry builder ─────────────────────────────────────────────────

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
    const wx = pos.getX(i);
    const wz = pos.getY(i);
    pos.setXYZ(i, wx, y, wz);
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
  const indices:  number[] = [];
  let   vOffset = 0;

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

interface WaterLayerProps {
  water:        LakePolygon[];
  centre:       LngLat;
  metresToUnit: number;
}

export function WaterLayer({ water, centre, metresToUnit }: WaterLayerProps) {
  const { dayFactor } = useTimeOfDay();

  const geometry = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];

    for (const body of water) {
      if (!body.polygon || body.polygon.length < 3) continue;
      const geo = buildFlatPolygon(body.polygon, centre, metresToUnit, WATER_Y);
      if (geo) geos.push(geo);
    }

    return mergeGeos(geos);
  }, [water, centre, metresToUnit]);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uTime:           { value: 0 },
      uDeepColorNight: { value: new THREE.Color('#010D1A') },
      uDeepColorDay:   { value: new THREE.Color('#1a5580') },
      uShimColorNight: { value: new THREE.Color('#00d4ff') },
      uShimColorDay:   { value: new THREE.Color('#aaddff') },
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

  if (geometry.attributes.position?.count === 0) return null;

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={1}
      frustumCulled={false}
    />
  );
}
