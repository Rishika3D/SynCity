'use client';

/**
 * components/CityScene.tsx
 *
 * Root Three.js scene for the Bangalore digital twin.
 * Supports automatic day/night mode based on the user's local time:
 *   - Day (06:30–17:30): bright sky, natural sunlight, muted neon
 *   - Night (18:30–05:30): dark cyberpunk, glowing windows, neon bloom
 *   - Dawn/Dusk: smooth 1-hour transitions
 *
 * The DayNightController runs inside the Canvas and lerps all scene
 * properties (background, fog, lights, bloom) each frame using dayFactor
 * from TimeOfDayContext.
 */

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import type { CityData } from '@/types/osm';
import { useTimeOfDay }                    from '@/contexts/TimeOfDayContext';
import { CityTerrain }       from './CityTerrain';
import { RoadNetwork }        from './RoadNetwork';
import { BuildingGenerator }  from './BuildingGenerator';
import { WaterLayer }         from './WaterLayer';
import { ParksLayer }         from './ParksLayer';
import { GreebleLayer }       from './city/GreebleLayer';
import { TrafficSystem }      from './city/TrafficSystem';
import { RainSystem }         from './city/RainSystem';
import { WeatherEffects }     from './city/WeatherEffects';
import { DistrictOverlay }    from './city/DistrictOverlay';
import { bboxRadiusUnits }    from '@/utils/geoProject';

// ─── Layer visibility control ─────────────────────────────────────────────────

export interface LayerVisibility {
  roads:     boolean;
  buildings: boolean;
  water:     boolean;
  parks:     boolean;
  landmarks: boolean;
  traffic:   boolean;
  weather:   boolean;
  districts: boolean;
}

export const DEFAULT_LAYERS: LayerVisibility = {
  roads:     true,
  buildings: true,
  water:     true,
  parks:     true,
  landmarks: true,
  traffic:   true,
  weather:   true,
  districts: false,   // opt-in — off by default
};

// Re-export weather helpers so pages can import from one place
export { WeatherMode, useWeather } from '@/contexts/WeatherContext';

// ─── Day / Night colour palettes ─────────────────────────────────────────────

const NIGHT_BG  = new THREE.Color('#030305');
const DAY_BG    = new THREE.Color('#8aaccc');
// Note: fog color is managed by WeatherEffects (accounts for weather mode)

// ─── Props ────────────────────────────────────────────────────────────────────

interface CitySceneProps {
  data:       CityData;
  layers?:    LayerVisibility;
  onSelect?:  (osmId: number, featureType: string) => void;
}

// ─── Placeholder layer components (landmarks — future prompt) ─────────────────

function LandmarksLayer() { return <group name="landmarks-layer" />; }

// ─── Day/Night scene controller (runs inside Canvas) ─────────────────────────

function DayNightController() {
  const { dayFactor } = useTimeOfDay();
  const { scene }     = useThree();

  const bgColor = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    // ── Background only — fog & exposure handled by WeatherEffects ──
    bgColor.copy(NIGHT_BG).lerp(DAY_BG, dayFactor);
    scene.background = bgColor;
  });

  return null;
}

// ─── Scene lighting — adapts to day/night ────────────────────────────────────

function SceneLighting() {
  const { dayFactor } = useTimeOfDay();

  const ambientRef    = useRef<THREE.AmbientLight>(null);
  const keyLightRef   = useRef<THREE.DirectionalLight>(null);
  const fillLightRef  = useRef<THREE.DirectionalLight>(null);
  const neonCyanRef   = useRef<THREE.PointLight>(null);
  const neonVioletRef = useRef<THREE.PointLight>(null);

  const nightAmbient = useMemo(() => new THREE.Color('#444466'), []);
  const dayAmbient   = useMemo(() => new THREE.Color('#ccccdd'), []);
  const nightKey     = useMemo(() => new THREE.Color('#8888aa'), []);
  const dayKey       = useMemo(() => new THREE.Color('#fff8e8'), []);
  const nightFill    = useMemo(() => new THREE.Color('#334466'), []);
  const dayFill      = useMemo(() => new THREE.Color('#aabbcc'), []);
  const tmpColor     = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const f = dayFactor;

    // Ambient: dim at night, bright during day
    if (ambientRef.current) {
      tmpColor.copy(nightAmbient).lerp(dayAmbient, f);
      ambientRef.current.color.copy(tmpColor);
      ambientRef.current.intensity = THREE.MathUtils.lerp(0.5, 1.8, f);
    }

    // Key directional: cool tint at night, warm sunlight during day
    if (keyLightRef.current) {
      tmpColor.copy(nightKey).lerp(dayKey, f);
      keyLightRef.current.color.copy(tmpColor);
      keyLightRef.current.intensity = THREE.MathUtils.lerp(0.8, 2.5, f);
      // Sun position shifts higher during day
      keyLightRef.current.position.y = THREE.MathUtils.lerp(200, 350, f);
    }

    // Fill light: stronger during day
    if (fillLightRef.current) {
      tmpColor.copy(nightFill).lerp(dayFill, f);
      fillLightRef.current.color.copy(tmpColor);
      fillLightRef.current.intensity = THREE.MathUtils.lerp(0.15, 0.8, f);
    }

    // Neon accent lights: fade out during day
    if (neonCyanRef.current) {
      neonCyanRef.current.intensity = THREE.MathUtils.lerp(8, 0.5, f);
    }
    if (neonVioletRef.current) {
      neonVioletRef.current.intensity = THREE.MathUtils.lerp(6, 0.2, f);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.5} color="#444466" />

      <directionalLight
        ref={keyLightRef}
        position={[100, 200, 80]}
        intensity={0.8}
        color="#8888aa"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-bias={-0.0004}
      />

      <directionalLight
        ref={fillLightRef}
        position={[-60, 80, -40]}
        intensity={0.15}
        color="#334466"
      />

      <pointLight
        ref={neonCyanRef}
        position={[80, 40, 0]}
        color="#00f3ff"
        intensity={8}
        distance={250}
        decay={2}
      />
      <pointLight
        ref={neonVioletRef}
        position={[-80, 30, 0]}
        color="#7700ff"
        intensity={6}
        distance={220}
        decay={2}
      />
    </>
  );
}

// ─── Adaptive Bloom ──────────────────────────────────────────────────────────

function AdaptiveBloom() {
  const { dayFactor } = useTimeOfDay();

  // Night: intense bloom for neon/windows. Day: very subtle bloom.
  const intensity          = THREE.MathUtils.lerp(0.8, 0.15, dayFactor);
  const luminanceThreshold = THREE.MathUtils.lerp(1.5, 3.0, dayFactor);

  return (
    <Bloom
      intensity={intensity}
      luminanceThreshold={luminanceThreshold}
      luminanceSmoothing={0.05}
      mipmapBlur
      radius={0.65}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CityScene({
  data,
  layers = DEFAULT_LAYERS,
  onSelect,
}: CitySceneProps) {
  const cameraRef = useRef<CameraControls>(null);

  const terrainRadius = bboxRadiusUnits(data.bbox, data.centre, data.metresToUnit) * 1.15;

  return (
    <Canvas
      shadows
      camera={{
        position: [0, 180, 220],
        fov:      42,
        near:     1,
        far:      3000,
      }}
      dpr={[1, 1.5]}
      gl={{
        antialias:           true,
        alpha:               false,
        powerPreference:     'high-performance',
        toneMapping:         4,     // ACESFilmic
        toneMappingExposure: 0.95,
      }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* ── TimeOfDayProvider and WeatherProvider live in CityView (outer tree).
           R3F v8 bridges context automatically into the Canvas reconciler. ── */}

      {/* ── Initial background/fog (overridden by DayNightController each frame) ── */}
      <color attach="background" args={['#030305']} />
      <fog   attach="fog"        args={['#030305', 50, 550]} />

      {/* ── Day/Night controller — lerps background ── */}
      <DayNightController />
      {/* ── Weather effects — fog, exposure, rain ── */}
      <WeatherEffects />

      {/* ── Lighting ── */}
      <SceneLighting />

      {/* ── Terrain disc ── */}
      <CityTerrain
        radius={terrainRadius}
        gridStep={10}
      />

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
          <GreebleLayer
            blocks={data.blocks}
            districts={data.districts}
            metresToUnit={data.metresToUnit}
          />
        </group>
        <group name="layer-landmarks" visible={layers.landmarks}>
          <LandmarksLayer />
        </group>
        <group name="layer-traffic" visible={layers.traffic}>
          <TrafficSystem
            roads={data.roads}
            centre={data.centre}
            metresToUnit={data.metresToUnit}
          />
        </group>
        {layers.weather && <RainSystem />}
        {data.districts && (
          <DistrictOverlay
            districts={data.districts}
            visible={layers.districts}
          />
        )}
      </Suspense>

      {/* ── Post-processing ── */}
      <EffectComposer multisampling={0}>
        <AdaptiveBloom />
        <Vignette
          offset={0.22}
          darkness={0.55}
          eskil={false}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>

      {/* ── Camera controls ── */}
      <CameraControls
        ref={cameraRef}
        makeDefault
        minDistance={10}
        maxDistance={800}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2.1}
        smoothTime={0.35}
        draggingSmoothTime={0.15}
      />

    </Canvas>
  );
}

// Re-export CameraControls type so pages can type the ref
export type { CameraControls };
