'use client';
import { useRef } from 'react';
import { useFrame }    from '@react-three/fiber';
import { Fog }         from 'three';
import { useSimulationStore } from '@/store/useSimulationStore';
import { mapRange }           from '@/lib/math';

export default function Environment() {
  const { scrollProgress, mode } = useSimulationStore();

  // Fog density eases from thick (mystery) → thin (city) → off (neural)
  const fogNear = mapRange(scrollProgress, 0, 0.4, 2,  20);
  const fogFar  = mapRange(scrollProgress, 0, 0.4, 14, 60);

  // Ambient intensity lifts over scroll
  const ambientIntensity = mapRange(scrollProgress, 0, 1, 0.12, 0.45);

  // Directional light colour shifts: deep blue → cyan → white
  const dirColor = mode === 'chaos' ? '#FF3333' : '#4488FF';

  return (
    <>
      <color attach="background" args={['#060B18']} />
      <fog   attach="fog"        args={['#0A1428', fogNear, fogFar]} />

      <ambientLight intensity={ambientIntensity} color="#6688AA" />

      <directionalLight
        position={[8, 16, 10]}
        intensity={0.6}
        color={dirColor}
        castShadow={false}
      />

      {/* Fill light from below — like city glow */}
      <pointLight
        position={[0, -4, 0]}
        intensity={1.4}
        color="#1E3A8A"
        distance={30}
        decay={2}
      />

      {/* Rim light — side accent */}
      <pointLight
        position={[-12, 8, -8]}
        intensity={0.8}
        color="#00EEFF"
        distance={40}
        decay={2}
      />
    </>
  );
}
