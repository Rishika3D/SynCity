'use client';

/**
 * components/CityTerrain.tsx
 *
 * The ground plane for the Bangalore digital-twin scene.
 * Renders as a large circular disc with a custom GLSL shader.
 *
 * Day/Night adaptive:
 *   Night: dark cyberpunk base with neon grid, rim glow, topographic rings
 *   Day:   warm grey ground with subtle grid, natural blue tones
 *   Smooth transition via uDayFactor uniform from TimeOfDayContext.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTimeOfDay } from '@/contexts/TimeOfDayContext';

// ─── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uBaseColorNight;
  uniform vec3  uBaseColorDay;
  uniform vec3  uGridColorNight;
  uniform vec3  uGridColorDay;
  uniform vec3  uGlowColorNight;
  uniform vec3  uGlowColorDay;
  uniform float uGridStep;
  uniform float uRadius;
  uniform float uTime;
  uniform float uDayFactor;   // 0 = night, 1 = day

  varying vec3  vWorldPos;
  varying vec2  vUv;

  float gridLine(vec2 pos, float step, float lineHalf) {
    vec2  f = abs(fract(pos / step + 0.5) - 0.5) * step;
    float d = min(f.x, f.y);
    return 1.0 - smoothstep(0.0, lineHalf, d);
  }

  void main() {
    float dist = length(vWorldPos.xz);
    float nd   = dist / uRadius;

    // ── Interpolate palettes ───────────────────────────────────────────────
    vec3 baseColor = mix(uBaseColorNight, uBaseColorDay, uDayFactor);
    vec3 gridColor = mix(uGridColorNight, uGridColorDay, uDayFactor);
    vec3 glowColor = mix(uGlowColorNight, uGlowColorDay, uDayFactor);

    // ── Grid ───────────────────────────────────────────────────────────────
    float minor = gridLine(vWorldPos.xz, uGridStep,        0.06);
    float major = gridLine(vWorldPos.xz, uGridStep * 5.0,  0.05);

    // ── Topographic rings — dimmer during day ──────────────────────────────
    float ringIntensity = mix(0.045, 0.015, uDayFactor);
    float rings = abs(sin(nd * 22.0 + uTime * 0.08)) * ringIntensity
                  * smoothstep(0.05, 0.55, nd)
                  * smoothstep(1.0,  0.60, nd);

    // ── Animated radial data pulse — dimmer during day ─────────────────────
    float pulseIntensity = mix(0.025, 0.008, uDayFactor);
    float pulse = sin(nd * 12.0 - uTime * 0.9) * 0.5 + 0.5;
    pulse *= pulseIntensity * smoothstep(0.15, 0.75, nd) * smoothstep(1.0, 0.7, nd);

    // ── Rim glow — dimmer during day ──────────────────────────────────────
    float rimStr = mix(0.60, 0.15, uDayFactor);
    float rim    = smoothstep(0.68, 1.0, nd) * smoothstep(1.02, 0.78, nd);

    // ── Centre hot-spot ──────────────────────────────────────────────────
    float coreStr = mix(0.08, 0.02, uDayFactor);
    float core    = smoothstep(4.0, 0.0, dist) * coreStr;

    // ── Edge alpha fade ──────────────────────────────────────────────────
    float alpha = smoothstep(1.01, 0.82, nd);

    // ── Grid intensity — subtle during day ───────────────────────────────
    float minorStr = mix(0.22, 0.10, uDayFactor);
    float majorStr = mix(0.45, 0.18, uDayFactor);

    // ── Compose ──────────────────────────────────────────────────────────
    vec3 col = baseColor;
    col += gridColor * minor * minorStr;
    col += gridColor * major * majorStr;
    col += gridColor * rings;
    col += glowColor * pulse;
    col += glowColor * rim   * rimStr;
    col += glowColor * core;

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
          // Night palette
          uBaseColorNight: { value: new THREE.Color('#05050A') },
          uGridColorNight: { value: new THREE.Color('#07192A') },
          uGlowColorNight: { value: new THREE.Color('#00f3ff') },
          // Day palette
          uBaseColorDay:   { value: new THREE.Color('#3a3e48') },
          uGridColorDay:   { value: new THREE.Color('#5a6270') },
          uGlowColorDay:   { value: new THREE.Color('#7099bb') },
          // Shared
          uGridStep:  { value: gridStep },
          uRadius:    { value: radius   },
          uTime:      { value: 0        },
          uDayFactor: { value: 0        },
        },
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
      }),
    [radius, gridStep],
  );

  useFrame(({ clock }) => {
    material.uniforms.uTime.value      = clock.getElapsedTime();
    material.uniforms.uDayFactor.value = dayFactor;
  });

  // Rim ring opacity adapts to day/night
  const rimOpacity = THREE.MathUtils.lerp(0.14, 0.04, dayFactor);

  return (
    <group name="city-terrain">
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        renderOrder={0}
      >
        <circleGeometry args={[radius, 128]} />
        <primitive object={material} attach="material" />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
        renderOrder={1}
      >
        <ringGeometry args={[radius * 0.94, radius * 1.0, 128]} />
        <meshBasicMaterial
          color={dayFactor > 0.5 ? '#7099bb' : '#00f3ff'}
          transparent
          opacity={rimOpacity}
          toneMapped={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.06, 0]}
        renderOrder={2}
      >
        <ringGeometry args={[1.5, 3.5, 64]} />
        <meshBasicMaterial
          color={dayFactor > 0.5 ? '#7099bb' : '#00f3ff'}
          transparent
          opacity={THREE.MathUtils.lerp(0.35, 0.10, dayFactor)}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {[100, 200, 300, 400, 500].map((r) => (
        <mesh
          key={r}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
          renderOrder={1}
        >
          <ringGeometry args={[r - 0.25, r + 0.25, 128]} />
          <meshBasicMaterial
            color={dayFactor > 0.5 ? '#7099bb' : '#00f3ff'}
            transparent
            opacity={THREE.MathUtils.lerp(0.06, 0.02, dayFactor)}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
