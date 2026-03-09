'use client';

/**
 * components/city/WeatherEffects.tsx
 *
 * Scene-level weather controller that runs inside the R3F Canvas.
 * Reads WeatherContext and TimeOfDayContext to smoothly animate:
 *
 *   1. Fog density  — FogExp2 added/removed based on fogDensity
 *   2. Fog colour   — interpolated between night fog and day + rain tones
 *   3. Tone mapping — slightly darker exposure in rain / haze
 *
 * The uWetness uniform on BuildingGenerator's window shader is updated
 * by BuildingGenerator itself (via a shared ref); here we publish wetness
 * to a window global so sibling shaders can pick it up without prop-drilling.
 *
 * Note: For a simpler architecture, WeatherEffects drives scene-level fog
 * and exposure; individual component shaders read WeatherContext directly
 * via useWeather() in their own useFrame hooks.
 */

import { useMemo }   from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE    from 'three';
import { useWeather }  from '@/contexts/WeatherContext';
import { useTimeOfDay } from '@/contexts/TimeOfDayContext';

// ─── Fog colour palettes ──────────────────────────────────────────────────────

const FOG_NIGHT_CLEAR  = new THREE.Color('#030305');
const FOG_NIGHT_RAIN   = new THREE.Color('#0a1018');
const FOG_NIGHT_HAZE   = new THREE.Color('#0d1520');
const FOG_DAY_CLEAR    = new THREE.Color('#9ab8d0');
const FOG_DAY_RAIN     = new THREE.Color('#5a6a78');
const FOG_DAY_HAZE     = new THREE.Color('#a8b8c0');

// ─── Component ────────────────────────────────────────────────────────────────

export function WeatherEffects() {
  const { fogDensity, rainIntensity } = useWeather();
  const { dayFactor }                 = useTimeOfDay();
  const { scene, gl }                 = useThree();

  const fogColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    // ── Fog ─────────────────────────────────────────────────────────────
    if (fogDensity > 0.01) {
      if (!(scene.fog instanceof THREE.FogExp2)) {
        scene.fog = new THREE.FogExp2(0x030305, 0.001);
      }
      const exp2Fog = scene.fog as THREE.FogExp2;

      // Night/day fog colour with rain tint
      const nightFogCol = rainIntensity > 0.1
        ? FOG_NIGHT_RAIN
        : fogDensity > 0.6 ? FOG_NIGHT_HAZE : FOG_NIGHT_CLEAR;
      const dayFogCol = rainIntensity > 0.1
        ? FOG_DAY_RAIN
        : fogDensity > 0.6 ? FOG_DAY_HAZE : FOG_DAY_CLEAR;

      fogColor.copy(nightFogCol).lerp(dayFogCol, dayFactor);
      exp2Fog.color.copy(fogColor);

      // Density target: haze/rain much denser
      const targetDensity = fogDensity * 0.006;
      exp2Fog.density = THREE.MathUtils.lerp(exp2Fog.density, targetDensity, 0.05);

    } else {
      // Switch back to linear fog when weather clears
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog = new THREE.Fog(0x030305, 50, 550);
      }
      if (scene.fog instanceof THREE.Fog) {
        const nightCol = FOG_NIGHT_CLEAR;
        const dayCol   = FOG_DAY_CLEAR;
        fogColor.copy(nightCol).lerp(dayCol, dayFactor);
        scene.fog.color.copy(fogColor);
        scene.fog.near = THREE.MathUtils.lerp(50, 100, dayFactor);
        scene.fog.far  = THREE.MathUtils.lerp(550, 900, dayFactor);
      }
    }

    // ── Exposure adjustment — rain darkens the scene slightly ────────────
    const baseExposure    = THREE.MathUtils.lerp(0.95, 1.35, dayFactor);
    const rainDarken      = rainIntensity * 0.25;
    gl.toneMappingExposure = baseExposure - rainDarken;
  });

  return null;
}
