'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MousePosition } from '@/hooks/useMouseParallax';

interface Props { mouse: MousePosition }

export function CinematicLights({ mouse }: Props) {
  // Outer orbit — wide sweeping accents
  const outerCyanRef  = useRef<THREE.PointLight>(null!);
  const outerAmberRef = useRef<THREE.PointLight>(null!);
  // Inner orbit — drifts THROUGH the frosted-glass cluster
  const innerCyanRef  = useRef<THREE.PointLight>(null!);
  const innerAmberRef = useRef<THREE.PointLight>(null!);
  const innerVioletRef= useRef<THREE.PointLight>(null!);
  // Interactive key light (mouse driven)
  const keyRef = useRef<THREE.DirectionalLight>(null!);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Key follows mouse — long elegant shadows
    keyRef.current.position.x += (mouse.x * 14 - keyRef.current.position.x) * 0.035;
    keyRef.current.position.y += (mouse.y * 6 + 12  - keyRef.current.position.y) * 0.035;

    // Outer wide orbit — terrain reflections
    outerCyanRef.current.position.set(
      Math.sin(t * 0.18) * 16,
      6 + Math.sin(t * 0.28) * 3,
      Math.cos(t * 0.18) * 16,
    );
    outerAmberRef.current.position.set(
      Math.sin(t * 0.13 + Math.PI) * 14,
      4 + Math.cos(t * 0.22) * 2,
      Math.cos(t * 0.13 + Math.PI) * 14,
    );

    // Inner tight orbit — glows through frosted glass buildings
    innerCyanRef.current.position.set(
      Math.sin(t * 0.35) * 2.2,
      1.8 + Math.sin(t * 0.55) * 1.2,
      Math.cos(t * 0.35) * 2.2,
    );
    innerAmberRef.current.position.set(
      Math.sin(t * 0.28 + Math.PI * 0.6) * 2.8,
      1.2 + Math.cos(t * 0.42) * 0.9,
      Math.cos(t * 0.28 + Math.PI * 0.6) * 2.8,
    );
    innerVioletRef.current.position.set(
      Math.sin(t * 0.22 + Math.PI * 1.3) * 2.0,
      2.5 + Math.sin(t * 0.36) * 0.8,
      Math.cos(t * 0.22 + Math.PI * 1.3) * 2.0,
    );

    // Pulse inner lights for breathing glow
    innerCyanRef.current.intensity  = 7 + Math.sin(t * 0.9) * 1.5;
    innerAmberRef.current.intensity = 6 + Math.cos(t * 0.7) * 1.2;
    innerVioletRef.current.intensity= 4 + Math.sin(t * 0.6) * 1.0;
  });

  return (
    <>
      {/* Very dark ambient — preserve inky blacks */}
      <ambientLight intensity={0.08} color="#090C14" />

      {/* Directional key — mouse-interactive, casts long shadows */}
      <directionalLight
        ref={keyRef}
        position={[6, 12, 6]}
        intensity={0.7}
        color="#C8D8FF"
      />

      {/* ── Outer orbit — light the terrain ── */}
      <pointLight ref={outerCyanRef}  color="#00EEFF" intensity={5}   distance={32} decay={2} />
      <pointLight ref={outerAmberRef} color="#FF7722" intensity={4}   distance={28} decay={2} />

      {/* ── Inner orbit — glow through frosted glass ── */}
      <pointLight ref={innerCyanRef}   color="#00FFEE" intensity={7}  distance={9}  decay={2} />
      <pointLight ref={innerAmberRef}  color="#FF6600" intensity={6}  distance={9}  decay={2} />
      <pointLight ref={innerVioletRef} color="#AA44FF" intensity={4}  distance={7}  decay={2} />
    </>
  );
}
