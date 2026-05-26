'use client';
/**
 * SimulationController — invisible R3F component that drives
 * per-frame global effects based on simulation mode.
 * (No DOM — just useFrame side-effects.)
 */
import { useFrame }           from '@react-three/fiber';
import { useSimulationStore } from '@/store/useSimulationStore';
import { mapRange }           from '@/lib/math';

export default function SimulationController() {
  const { scrollProgress, mode } = useSimulationStore();

  useFrame(({ gl, scene }) => {
    // Adjust renderer tone mapping exposure by mode
    if (mode === 'chaos') {
      gl.toneMappingExposure = 1.15 + Math.sin(Date.now() * 0.003) * 0.08;
    } else {
      gl.toneMappingExposure = mapRange(scrollProgress, 0, 1, 0.85, 1.1);
    }
  });

  return null;
}
