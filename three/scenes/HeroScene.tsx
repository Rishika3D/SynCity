'use client';

import { Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { ChromeTerrain } from '@/three/terrain/ChromeTerrain';
import { GlassBuildings } from '@/three/buildings/GlassBuildings';
import { CinematicLights } from '@/three/lights/CinematicLights';
import type { MousePosition } from '@/hooks/useMouseParallax';

function CameraRig({ mouse }: { mouse: MousePosition }) {
  const { camera, viewport } = useThree();
  useFrame(() => {
    // Portrait (mobile) — slightly higher and farther for balanced composition
    const portrait = viewport.aspect < 1;
    const baseY = portrait ? 11  : 9;
    const baseZ = portrait ? 30  : 26;

    camera.position.x += (mouse.x * 2.0 - camera.position.x) * 0.032;
    camera.position.y += (mouse.y * 1.0 + baseY - camera.position.y) * 0.032;
    camera.position.z += (baseZ - camera.position.z) * 0.05;
    camera.lookAt(0, 2.5, 0);
  });
  return null;
}

export function HeroScene({ mouse }: { mouse: MousePosition }) {
  return (
    <Canvas
      camera={{ position: [0, 9, 26], fov: 42, near: 0.1, far: 200 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: 4,           // ACESFilmic — rich deep blacks
        toneMappingExposure: 0.9, // slightly under-exposed for drama
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0B0C10']} />
      <fog attach="fog" args={['#0B0C10', 32, 72]} />

      <CameraRig mouse={mouse} />
      <CinematicLights mouse={mouse} />
      <ChromeTerrain />

      <Suspense fallback={null}>
        <GlassBuildings mouse={mouse} />
        {/* Night environment — dark HDR for metallic reflections */}
        <Environment preset="night" background={false} />

        <EffectComposer multisampling={0}>
          {/* Strong bloom — makes neon glow bleed through frosted glass */}
          <Bloom
            intensity={1.4}
            luminanceThreshold={0.45}
            luminanceSmoothing={0.08}
            mipmapBlur
            radius={0.75}
          />
          {/* Deep vignette — focuses eye on the glowing city */}
          <Vignette
            offset={0.25}
            darkness={0.7}
            eskil={false}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
