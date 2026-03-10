'use client';

/**
 * components/CityTerrain.tsx
 *
 * Realistic ground plane for the Bangalore miniature diorama.
 *
 * - Warm asphalt / earth tones — no neon, no sci-fi rings
 * - Subtle road-block grid lines (muted, naturalistic)
 * - Soft edge fade to transparent so the diorama appears to float
 * - Receives all shadows from buildings, trees, and street props
 * - uDayFactor shifts between warmer dawn/dusk and cooler midday tone
 */

import { useMemo, useEffect } from 'react';
import { useFrame }                   from '@react-three/fiber';
import * as THREE          from 'three';
import { useTimeOfDay }   from '@/contexts/TimeOfDayContext';

// ─── Realistic ground shader ─────────────────────────────────────────────────

const VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 wp  = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uGroundA;    // dawn / warm tone
  uniform vec3  uGroundB;    // midday / cool tone
  uniform vec3  uGridColor;
  uniform float uGridStep;
  uniform float uRadius;
  uniform float uDayFactor;

  varying vec3  vWorldPos;
  varying vec2  vUv;

  float gridLine(vec2 pos, float step, float halfWidth) {
    vec2 f = abs(fract(pos / step + 0.5) - 0.5) * step;
    return 1.0 - smoothstep(0.0, halfWidth, min(f.x, f.y));
  }

  void main() {
    float dist = length(vWorldPos.xz);
    float nd   = dist / uRadius;

    // ── Base colour — warm at low dayFactor (dawn/dusk), neutral at noon ──
    vec3 base = mix(uGroundA, uGroundB, smoothstep(0.0, 1.0, uDayFactor));

    // ── Subtle block-grid seam lines ──
    float minor = gridLine(vWorldPos.xz, uGridStep,        0.04) * 0.06;
    float major = gridLine(vWorldPos.xz, uGridStep * 10.0, 0.03) * 0.10;

    vec3 col = base + uGridColor * (minor + major);

    // ── Soft circular vignette / edge fade ──
    float alpha = smoothstep(1.02, 0.78, nd);

    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface CityTerrainProps {
  radius?:   number;
  gridStep?: number;
}

export function CityTerrain({ radius = 700, gridStep = 10 }: CityTerrainProps) {
  const { dayFactor } = useTimeOfDay();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader:   VERT,
        fragmentShader: FRAG,
        uniforms: {
          // Warm terracotta-ochre at low sun — cool grey-green at midday
          uGroundA:   { value: new THREE.Color('#c4a882') },
          uGroundB:   { value: new THREE.Color('#9aaa96') },
          // Grid seam colour (dark earthy tone)
          uGridColor: { value: new THREE.Color('#706050') },
          uGridStep:  { value: gridStep },
          uRadius:    { value: radius   },
          uDayFactor: { value: 0.5      },
        },
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
      }),
    [radius, gridStep],
  );

  useFrame(() => {
    material.uniforms.uDayFactor.value = dayFactor;
  });

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.02, 0]}
      receiveShadow
    >
      <circleGeometry args={[radius, 128]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
