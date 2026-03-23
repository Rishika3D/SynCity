'use client';
import { Canvas }         from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

import Environment          from './Environment';
import CameraController     from './CameraController';
import Particles            from '@/features/particles/Particles';
import City                 from '@/features/city/City';
import Heatmap              from '@/features/heatmap/Heatmap';
import NeuralNetwork        from '@/features/neural/NeuralNetwork';
import SimulationController from '@/features/simulation/SimulationController';
import { useSimulationStore } from '@/store/useSimulationStore';

export default function Scene() {
  const { mode } = useSimulationStore();

  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ position: [0, 12, 28], fov: 55, near: 0.1, far: 200 }}
      gl={{
        antialias           : true,
        toneMapping         : ACESFilmicToneMapping,
        toneMappingExposure : 0.9,
        alpha               : false,
        powerPreference     : 'high-performance',
      }}
      shadows={false}
      dpr={[1, 1.5]}
    >
      <SimulationController />
      <CameraController />
      <Environment />

      <Particles />
      <City />
      <Heatmap />
      <NeuralNetwork />

      <EffectComposer>
        <Bloom
          intensity={mode === 'chaos' ? 1.8 : 1.2}
          luminanceThreshold={0.35}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
        <Noise
          premultiply
          blendFunction={BlendFunction.SOFT_LIGHT}
          opacity={0.08}
        />
        <Vignette
          offset={0.42}
          darkness={0.72}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>
    </Canvas>
  );
}
