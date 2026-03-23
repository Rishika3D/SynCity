'use client';
import { useRef, useMemo }   from 'react';
import { useFrame }           from '@react-three/fiber';
import * as THREE             from 'three';
import { Line }               from '@react-three/drei';
import Buildings              from './Buildings';
import { useSimulationStore } from '@/store/useSimulationStore';
import { mapRange, randRange } from '@/lib/math';

/* ── Ground plane ─────────────────────────────────────────────────────────── */
function Ground() {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { scrollProgress } = useSimulationStore();

  useFrame(() => {
    if (!matRef.current) return;
    matRef.current.opacity = mapRange(scrollProgress, 0.25, 0.45, 0, 0.85);
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[18, 18, 1, 1]} />
      <meshStandardMaterial
        ref={matRef}
        color={0x040D1E}
        emissive={new THREE.Color(0x0A1840)}
        emissiveIntensity={0.4}
        transparent
        opacity={0}
      />
    </mesh>
  );
}

/* ── Traffic flow lines ───────────────────────────────────────────────────── */
function TrafficFlows() {
  const { scrollProgress, mode } = useSimulationStore();
  const lineRefs = useRef<any[]>([]);

  // Pre-generate road paths
  const roads = useMemo(() => {
    const r: Array<{ pts: [number, number, number][]; color: string }> = [];
    // Horizontal roads
    for (let i = -2; i <= 2; i++) {
      r.push({
        pts : [[-7, 0.08, i * 2.2], [7, 0.08, i * 2.2]],
        color: '#1A3C6E',
      });
    }
    // Vertical roads
    for (let i = -2; i <= 2; i++) {
      r.push({
        pts : [[i * 2.2, 0.08, -7], [i * 2.2, 0.08, 7]],
        color: '#1A3C6E',
      });
    }
    return r;
  }, []);

  const vis = mapRange(scrollProgress, 0.38, 0.52, 0, 1);
  if (vis < 0.01) return null;

  return (
    <group>
      {roads.map((road, i) => (
        <Line
          key={i}
          points={road.pts}
          color={mode === 'chaos' ? '#FF4422' : road.color}
          lineWidth={0.8}
          transparent
          opacity={vis * 0.6}
        />
      ))}
    </group>
  );
}

/* ── Animated traffic dots ────────────────────────────────────────────────── */
function TrafficDots() {
  const { scrollProgress, mode } = useSimulationStore();
  const COUNT = 40;

  const dots = useMemo(() =>
    Array.from({ length: COUNT }, (_, i) => ({
      axis    : i % 2 === 0 ? 'x' : 'z',
      lane    : (Math.floor(i / 2) % 5 - 2) * 2.2,
      speed   : randRange(0.8, 2.2) * (Math.random() > 0.5 ? 1 : -1),
      offset  : Math.random() * 14,
    })), []);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy   = useMemo(() => new THREE.Object3D(), []);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color      : new THREE.Color('#00CCFF'),
    transparent: true,
    opacity    : 0,
  }), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t   = clock.getElapsedTime();
    const vis = mapRange(scrollProgress, 0.40, 0.55, 0, 1);
    material.opacity = vis * 0.85;
    material.color.set(mode === 'chaos' ? '#FF6633' : '#00CCFF');

    dots.forEach((dot, i) => {
      const pos = ((dot.speed * t + dot.offset) % 14) - 7;
      if (dot.axis === 'x') dummy.position.set(pos, 0.15, dot.lane);
      else                   dummy.position.set(dot.lane, 0.15, pos);
      dummy.scale.setScalar(0.08);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, material, COUNT]}>
      <sphereGeometry args={[1, 6, 6]} />
    </instancedMesh>
  );
}

/* ── City root ────────────────────────────────────────────────────────────── */
export default function City() {
  return (
    <group>
      <Ground />
      <Buildings />
      <TrafficFlows />
      <TrafficDots />
    </group>
  );
}
