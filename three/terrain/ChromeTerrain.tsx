'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm } from '@/utils/noise';

const GRID = 80;
const SIZE = 62;

export function ChromeTerrain() {
  const meshRef = useRef<THREE.Mesh>(null!);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Slight bowl under city cluster + undulating waves
      const dist = Math.sqrt(x * x + z * z);
      const bowl = Math.max(0, 1 - dist * 0.065) * 0.5;

      const elevation =
        fbm(x * 0.055 + t * 0.032, z * 0.055 + t * 0.020, 3) * 2.4 +
        fbm(x * 0.16  - t * 0.048, z * 0.16  + t * 0.032, 2) * 0.50 +
        fbm(x * 0.38  + t * 0.038, z * 0.38  - t * 0.024, 1) * 0.16 -
        bowl;

      pos.setY(i, elevation);
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      {/* Deep gunmetal — catches and reflects neon light in the valleys */}
      <meshStandardMaterial
        color="#0D1420"
        metalness={0.95}
        roughness={0.20}
        envMapIntensity={2.8}
      />
    </mesh>
  );
}
