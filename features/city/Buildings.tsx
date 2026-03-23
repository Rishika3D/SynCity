'use client';
import { useRef, useMemo }    from 'react';
import { useFrame }            from '@react-three/fiber';
import * as THREE              from 'three';
import { useSimulationStore }  from '@/store/useSimulationStore';
import { CITY_GRID }           from '@/lib/constants';
import { mapRange, randRange } from '@/lib/math';

const BUILDING_COUNT = CITY_GRID.cols * CITY_GRID.rows;

interface BuildingData {
  x: number; z: number;
  h: number; w: number; d: number;
}

function generateCity(): BuildingData[] {
  const { cols, rows } = CITY_GRID;
  const sx = 12 / cols;
  const sz = 12 / rows;
  return Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      x: (col - cols / 2 + 0.5) * sx,
      z: (row - rows / 2 + 0.5) * sz,
      h: randRange(0.3, 4.5),
      w: randRange(0.35, 0.75) * sx,
      d: randRange(0.35, 0.75) * sz,
    };
  });
}

export default function Buildings() {
  const meshRef  = useRef<THREE.InstancedMesh>(null);
  const { scrollProgress, mode } = useSimulationStore();

  const buildings = useMemo(generateCity, []);

  // Shared emissive material
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color         : 0x0A1E42,
    emissive      : new THREE.Color(0x1144AA),
    emissiveIntensity: 0.6,
    metalness     : 0.8,
    roughness     : 0.35,
    transparent   : true,
    opacity       : 0,
  }), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();

    // Visibility: appear during formation (0.2–0.4)
    const vis = mapRange(scrollProgress, 0.25, 0.42, 0, 1);
    material.opacity = vis;

    // Emissive colour by mode
    if (mode === 'chaos') {
      material.emissive.setRGB(0.8, 0.1, 0.1);
      material.emissiveIntensity = 0.9 + Math.sin(t * 4) * 0.3;
    } else {
      const r = mapRange(scrollProgress, 0.4, 0.85, 0.07, 0.0);
      const g = mapRange(scrollProgress, 0.4, 0.85, 0.27, 0.8);
      material.emissive.setRGB(r, g, 1.0);
      material.emissiveIntensity = mapRange(scrollProgress, 0.4, 0.7, 0.6, 1.1);
    }

    // Update instance transforms
    buildings.forEach((b, i) => {
      // Buildings "grow" from ground during formation
      const scale = mapRange(scrollProgress, 0.2, 0.45, 0, 1);
      const ht    = b.h * scale;

      // Chaos: jitter height
      const chaos = mode === 'chaos' ? Math.sin(t * 2.5 + i * 0.7) * 0.2 : 0;

      dummy.position.set(b.x, ht / 2 + chaos, b.z);
      dummy.scale.set(b.w, ht + 0.01, b.d);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, BUILDING_COUNT]}
      material={material}
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}
