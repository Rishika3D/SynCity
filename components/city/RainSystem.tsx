'use client';

/**
 * components/city/RainSystem.tsx
 *
 * GPU-driven rain particle system.
 * Up to MAX_RAIN_PARTICLES point sprites falling diagonally (slight Bangalore
 * south-westerly monsoon drift) with additive blending for the "wet shimmer"
 * effect on the scene below.
 *
 * Day/Night adaptive:
 *   Night: bright white/blue streaks — visible against dark sky
 *   Day:   semi-transparent grey — subtle drizzle appearance
 *
 * WeatherMode-aware:
 *   rainIntensity 0 → 0 visible particles
 *   rainIntensity 1 → MAX_RAIN_PARTICLES fully visible
 *
 * Architecture:
 *   One BufferGeometry with random world-space positions.
 *   Vertex shader resets particles that fall below Y=0 to the top of the box.
 *   Fragment shader renders a vertical streak (elongated in clip-space via
 *   point size) with gaussian radial gradient.
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame }              from '@react-three/fiber';
import * as THREE                from 'three';
import { useWeather }            from '@/contexts/WeatherContext';
import { useTimeOfDay }          from '@/contexts/TimeOfDayContext';

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_RAIN_PARTICLES = 8_000;
/** World-space box the rain fills (centred on origin) */
const RAIN_BOX = { x: 600, y: 200, z: 600 };
/** Base fall speed (world-units/sec) */
const FALL_SPEED = 80;
/** Monsoon wind drift — slight diagonal */
const DRIFT_X = -8;
const DRIFT_Z = 6;

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const RAIN_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uRainIntensity;
  uniform float uDayFactor;

  attribute float aOffset;   // random time offset per particle [0,1)
  attribute float aSpeed;    // per-particle speed multiplier

  varying float vAlpha;

  void main() {
    // Per-particle travel animation
    float t = fract(uTime * aSpeed * 0.5 + aOffset);

    // World-space position: start at top of box, fall down
    vec3 pos = position;
    pos.y -= t * float(${RAIN_BOX.y});
    pos.x += t * float(${DRIFT_X});
    pos.z += t * float(${DRIFT_Z});

    // Wrap back to top when below ground
    if (pos.y < 0.0) {
      pos.y += float(${RAIN_BOX.y});
    }

    vAlpha = uRainIntensity;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Streak length proportional to speed; attenuate with camera distance
    float streak = mix(8.0, 4.0, uDayFactor);
    gl_PointSize = streak * (150.0 / -mvPos.z);
  }
`;

const RAIN_FRAG = /* glsl */ `
  uniform float uDayFactor;

  varying float vAlpha;

  void main() {
    vec2 uv  = gl_PointCoord * 2.0 - 1.0;
    // Vertical streak: compress x axis, gaussian falloff in y
    float dist = length(vec2(uv.x * 3.0, uv.y));
    if (dist > 1.0) discard;

    float alpha = (1.0 - smoothstep(0.0, 1.0, dist)) * vAlpha;

    // Night: blue-white streaks. Day: light grey.
    vec3 nightCol = vec3(0.75, 0.85, 1.00);
    vec3 dayCol   = vec3(0.60, 0.62, 0.65);
    vec3 col      = mix(nightCol, dayCol, uDayFactor);

    // Emissive: stronger at night for a wet shimmery look
    col *= mix(2.5, 1.0, uDayFactor);

    gl_FragColor = vec4(col, alpha * 0.55);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export function RainSystem() {
  const { rainIntensity } = useWeather();
  const { dayFactor }     = useTimeOfDay();

  const { geometry, material } = useMemo(() => {
    // Random starting positions in the rain box
    const positions = new Float32Array(MAX_RAIN_PARTICLES * 3);
    const offsets   = new Float32Array(MAX_RAIN_PARTICLES);
    const speeds    = new Float32Array(MAX_RAIN_PARTICLES);

    for (let i = 0; i < MAX_RAIN_PARTICLES; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * RAIN_BOX.x;
      positions[i * 3 + 1] = Math.random() * RAIN_BOX.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX.z;
      offsets[i]            = Math.random();
      speeds[i]             = 0.8 + Math.random() * 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aOffset',  new THREE.Float32BufferAttribute(offsets, 1));
    geo.setAttribute('aSpeed',   new THREE.Float32BufferAttribute(speeds, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: {
        uTime:          { value: 0 },
        uRainIntensity: { value: 0 },
        uDayFactor:     { value: 0 },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, []);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value          = clock.getElapsedTime();
    material.uniforms.uRainIntensity.value = rainIntensity;
    material.uniforms.uDayFactor.value     = dayFactor;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (rainIntensity === 0) return null;

  return (
    <points
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={10}
    />
  );
}
