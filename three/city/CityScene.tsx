'use client';

import { useRef, Suspense, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { CityGrid } from './CityGrid';
import type { BuildingData } from './CityGrid';

// ─── Orbiting neon key lights ─────────────────────────────────────────────────
function CityLights() {
  const c1 = useRef<THREE.PointLight>(null!);
  const c2 = useRef<THREE.PointLight>(null!);
  const c3 = useRef<THREE.PointLight>(null!);
  const c4 = useRef<THREE.PointLight>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    c1.current.position.set(Math.sin(t * 0.11) * 40,  22, Math.cos(t * 0.11) * 40);
    c2.current.position.set(Math.sin(t * 0.08 + Math.PI) * 34, 15, Math.cos(t * 0.08 + Math.PI) * 34);
    c3.current.position.set(Math.sin(t * 0.07 + 1.1) * 24, 26, Math.cos(t * 0.07 + 1.1) * 24);
    c4.current.position.set(Math.sin(t * 0.05 + 2.6) * 30, 10, Math.cos(t * 0.05 + 2.6) * 30);
  });

  return (
    <>
      <ambientLight intensity={0.10}  color="#07071A" />
      {/* Soft top-down fill — reveals building silhouettes without washing neon */}
      <directionalLight position={[0, 60, 0]} intensity={0.18} color="#1A1A3A" />
      <pointLight ref={c1} color="#00f3ff" intensity={100} distance={110} decay={2} />
      <pointLight ref={c2} color="#b900ff" intensity={85}  distance={100} decay={2} />
      <pointLight ref={c3} color="#003dff" intensity={60}  distance={85}  decay={2} />
      <pointLight ref={c4} color="#ff4400" intensity={25}  distance={70}  decay={2} />
    </>
  );
}

// ─── Flat dark ground ─────────────────────────────────────────────────────────
function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[500, 500]} />
      <meshStandardMaterial color="#050508" roughness={0.90} metalness={0.06} />
    </mesh>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  selected:   BuildingData | null;
  onSelect:   (d: BuildingData) => void;
  onDeselect: () => void;
}

export function CityScene({ selected, onSelect, onDeselect }: Props) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'CANVAS') onDeselect();
  }, [onDeselect]);

  return (
    <Canvas
      camera={{ position: [0, 32, 62], fov: 52, near: 0.5, far: 700 }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha:     false,
        powerPreference: 'high-performance',
        toneMapping:         4,   // ACESFilmic
        toneMappingExposure: 1.0,
      }}
      style={{ width: '100%', height: '100%' }}
      onClick={handleClick}
    >
      <color attach="background" args={['#030305']} />
      <fog   attach="fog"        args={['#030305', 45, 200]} />

      <CityLights />
      <Ground />

      <Suspense fallback={null}>
        <CityGrid selected={selected} onSelect={onSelect} />
      </Suspense>

      {/* Post-FX — outside Suspense so it always renders */}
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={1.6}
          luminanceThreshold={1.0}
          luminanceSmoothing={0.08}
          mipmapBlur
          radius={0.88}
        />
        <Vignette
          offset={0.22}
          darkness={0.72}
          eskil={false}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        minDistance={6}
        maxDistance={160}
        minPolarAngle={0.08}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 4, 0]}
      />
    </Canvas>
  );
}
