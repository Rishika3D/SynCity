'use client';

/**
 * components/CityScene.tsx
 *
 * Realistic Miniature Diorama — Bangalore digital twin.
 *
 * Visual direction (Prompt 5 pivot):
 *   - Physically-based rendering (PBR) via Environment HDRI preset
 *   - Soft directional sun with 4096² shadow maps
 *   - DepthOfField post-processing for "tilt-shift miniature" look
 *   - NO bloom, NO neon, NO emissive glow
 *   - Street-level zoom: minDistance = 2 world units
 *
 * Providers (TimeOfDayContext, WeatherContext) live in CityView (outer tree).
 * R3F v8 bridges them automatically into the Canvas reconciler.
 */

import { useRef, useMemo, Suspense }          from 'react';
import { Canvas, useThree, useFrame }         from '@react-three/fiber';
import { CameraControls, Environment }        from '@react-three/drei';
import { EffectComposer, DepthOfField }       from '@react-three/postprocessing';
import * as THREE                             from 'three';
import type { CityData }                      from '@/types/osm';
import { useTimeOfDay }                       from '@/contexts/TimeOfDayContext';
import { CityTerrain }                        from './CityTerrain';
import { RoadNetwork }                        from './RoadNetwork';
import { BuildingGenerator }                  from './BuildingGenerator';
import { WaterLayer }                         from './WaterLayer';
import { ParksLayer }                         from './ParksLayer';
import { StreetProps }                        from './StreetProps';
import { TrafficSystem }                      from './city/TrafficSystem';
import { DistrictOverlay }                    from './city/DistrictOverlay';
import { bboxRadiusUnits }                    from '@/utils/geoProject';

// Re-export weather helpers for HUD / layer controls
export { WeatherMode, useWeather } from '@/contexts/WeatherContext';

// ─── Layer visibility ─────────────────────────────────────────────────────────

export interface LayerVisibility {
  roads:       boolean;
  buildings:   boolean;
  water:       boolean;
  parks:       boolean;
  landmarks:   boolean;
  traffic:     boolean;
  weather:     boolean;  // reserved — kept for API compat
  districts:   boolean;
  streetProps: boolean;
  googleMap:   boolean;
}

export const DEFAULT_LAYERS: LayerVisibility = {
  roads:       true,
  buildings:   true,
  water:       true,
  parks:       true,
  landmarks:   true,
  traffic:     true,
  weather:     false,
  districts:   false,
  streetProps: true,
  googleMap:   false,
};

// ─── Sky colours (lerped by dayFactor) ────────────────────────────────────────

const NIGHT_SKY = new THREE.Color('#0d1020');
const DAY_SKY   = new THREE.Color('#aac8e4');

// ─── Placeholder layer ────────────────────────────────────────────────────────

function LandmarksLayer() { return <group name="landmarks-layer" />; }

// ─── Sky / background controller ─────────────────────────────────────────────

function SkyController() {
  const { dayFactor } = useTimeOfDay();
  const { scene }     = useThree();
  const tmpColor      = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    tmpColor.copy(NIGHT_SKY).lerp(DAY_SKY, dayFactor);
    scene.background = tmpColor;
  });

  return null;
}

// ─── Physically-based sun + fill lighting ─────────────────────────────────────

function SunLight() {
  const { dayFactor } = useTimeOfDay();

  const sunRef      = useRef<THREE.DirectionalLight>(null);
  const fillRef     = useRef<THREE.DirectionalLight>(null);
  const ambientRef  = useRef<THREE.AmbientLight>(null);

  useFrame(() => {
    const f = dayFactor;

    // Sun arc: low on horizon at night/dawn, high at noon
    const angle = f * Math.PI;              // 0 → π over the day
    const sunX  =  Math.cos(angle) * 300;
    const sunY  =  Math.sin(angle) * 300 + 40;   // +40 keeps it above horizon
    const sunZ  =  100;

    if (sunRef.current) {
      sunRef.current.position.set(sunX, sunY, sunZ);
      // Warm at dawn/dusk, neutral at noon
      const warmth = 1.0 - Math.abs(f - 0.5) * 0.6;
      sunRef.current.color.setRGB(
        1.0,
        THREE.MathUtils.lerp(0.85, 1.0, warmth),
        THREE.MathUtils.lerp(0.70, 0.95, warmth),
      );
      sunRef.current.intensity = THREE.MathUtils.lerp(0.05, 3.8, f);
    }

    // Cool sky fill from opposite side
    if (fillRef.current) {
      fillRef.current.intensity = THREE.MathUtils.lerp(0.05, 0.9, f);
    }

    // Scene ambient
    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.4, 1.0, f);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={1.0} color="#d8e4f0" />

      {/* Sun — casts soft shadows across the miniature city */}
      <directionalLight
        ref={sunRef}
        position={[200, 280, 100]}
        intensity={3.8}
        color="#fff8e0"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
        shadow-camera-near={0.5}
        shadow-camera-far={1200}
        shadow-bias={-0.0003}
        shadow-normalBias={0.05}
      />

      {/* Cool sky fill — simulates sky dome bounce */}
      <directionalLight
        ref={fillRef}
        position={[-120, 80, -80]}
        intensity={0.9}
        color="#a8c4e0"
      />
    </>
  );
}

// ─── Tilt-shift depth of field ────────────────────────────────────────────────

function TiltShiftDoF() {
  /**
   * DepthOfField parameters for the "miniature photography" tilt-shift look.
   * - focusDistance: normalized 0–1, where 0 = at camera.  ~0.02 keeps the
   *   mid-city in focus when viewing from the default bird's-eye position.
   * - focalLength: smaller = shallower depth of field = more blur outside focus.
   * - bokehScale: blur radius multiplier.  2–3 is subtle; 5+ is dramatic.
   *
   * Tune these to taste — lower the camera, reduce focusDistance for street view.
   */
  return (
    <DepthOfField
      focusDistance={0.02}
      focalLength={0.015}
      bokehScale={2.0}
      height={480}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CitySceneProps {
  data:      CityData;
  layers?:   LayerVisibility;
  onSelect?: (osmId: number, featureType: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CityScene({
  data,
  layers = DEFAULT_LAYERS,
  onSelect,
}: CitySceneProps) {
  const cameraRef     = useRef<CameraControls>(null);
  const terrainRadius = bboxRadiusUnits(data.bbox, data.centre, data.metresToUnit) * 1.15;

  return (
    <Canvas
      shadows="soft"
      camera={{
        position: [0, 180, 220],
        fov:      42,
        near:     0.5,
        far:      3000,
      }}
      dpr={[1, 1.5]}
      gl={{
        antialias:           true,
        alpha:               false,
        powerPreference:     'high-performance',
        toneMapping:         4,       // ACESFilmic
        toneMappingExposure: 1.1,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* ── Sky & lighting ── */}
      <SkyController />
      <SunLight />

      {/* ── HDRI environment — provides realistic reflections on glass / roads ── */}
      <Environment
        preset="city"
        background={false}   // we manage sky colour in SkyController
      />

      {/* ── Atmospheric haze (realistic, not neon fog) ── */}
      <fog attach="fog" args={['#c8dce8', 500, 1400]} />

      {/* ── Ground plane ── */}
      <CityTerrain radius={terrainRadius} />

      {/* ── City layers ── */}
      <Suspense fallback={null}>

        <group name="layer-water" visible={layers.water}>
          <WaterLayer
            water={data.water}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
          />
        </group>

        <group name="layer-parks" visible={layers.parks}>
          <ParksLayer
            parks={data.parks}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
          />
        </group>

        <group name="layer-roads" visible={layers.roads}>
          <RoadNetwork
            roads={data.roads}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
          />
        </group>

        <group name="layer-buildings" visible={layers.buildings}>
          <BuildingGenerator
            roads={data.roads}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
            blocks={data.blocks}
            districts={data.districts}
          />
        </group>

        <group name="layer-landmarks" visible={layers.landmarks}>
          <LandmarksLayer />
        </group>

        {/* Street-level props: lamps, benches, people */}
        <group name="layer-street-props" visible={layers.streetProps}>
          <StreetProps
            roads={data.roads}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
          />
        </group>

        {/* Traffic light trails (can be toggled off for clean daytime look) */}
        <group name="layer-traffic" visible={layers.traffic}>
          <TrafficSystem
            roads={data.roads}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
          />
        </group>

        {data.districts && (
          <DistrictOverlay
            districts={data.districts}
            visible={layers.districts}
          />
        )}

      </Suspense>

      {/* ── Post-processing: tilt-shift DoF only — no bloom ── */}
      <EffectComposer multisampling={4}>
        <TiltShiftDoF />
      </EffectComposer>

      {/* ── Camera — allow zoom to street level ── */}
      <CameraControls
        ref={cameraRef}
        makeDefault
        minDistance={2}               // zoom all the way to street level
        maxDistance={800}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.05}
        smoothTime={0.35}
        draggingSmoothTime={0.15}
      />

    </Canvas>
  );
}

// Re-export CameraControls type
export type { CameraControls };
