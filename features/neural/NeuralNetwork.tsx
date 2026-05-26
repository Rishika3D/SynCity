'use client';
import { useRef, useMemo }   from 'react';
import { useFrame }           from '@react-three/fiber';
import * as THREE             from 'three';
import { Line }               from '@react-three/drei';
import { useSimulationStore } from '@/store/useSimulationStore';
import { mapRange, randRange } from '@/lib/math';

/* ── Node positions ──────────────────────────────────────────────────────── */
const LAYER_SIZES = [4, 6, 8, 6, 4];
const LAYER_X     = [-6, -3, 0, 3, 6];
const NODE_SPREAD = 1.8;

function buildGraph() {
  const nodes: THREE.Vector3[] = [];
  const edges: [number, number][] = [];

  LAYER_SIZES.forEach((size, layerIdx) => {
    const startNode = nodes.length;
    for (let j = 0; j < size; j++) {
      nodes.push(new THREE.Vector3(
        LAYER_X[layerIdx],
        (j - (size - 1) / 2) * NODE_SPREAD,
        (Math.random() - 0.5) * 1.2,
      ));
    }
    // Connect to previous layer
    if (layerIdx > 0) {
      const prevSize  = LAYER_SIZES[layerIdx - 1];
      const prevStart = startNode - prevSize;
      for (let a = prevStart; a < startNode; a++) {
        for (let b = startNode; b < startNode + size; b++) {
          if (Math.random() > 0.35) edges.push([a, b]);
        }
      }
    }
  });

  return { nodes, edges };
}

/* ── Pulsing node ────────────────────────────────────────────────────────── */
function Nodes({ nodes, vis }: { nodes: THREE.Vector3[]; vis: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy   = useMemo(() => new THREE.Object3D(), []);
  const mat     = useMemo(() => new THREE.MeshBasicMaterial({
    color      : new THREE.Color('#00EEFF'),
    transparent: true,
    opacity    : 0,
  }), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    mat.opacity = vis * 0.9;

    nodes.forEach((node, i) => {
      const pulse = 0.06 + Math.sin(t * 2.2 + i * 0.8) * 0.025;
      dummy.position.copy(node);
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, mat, nodes.length]}>
      <sphereGeometry args={[1, 10, 10]} />
    </instancedMesh>
  );
}

/* ── Animated connection lines ───────────────────────────────────────────── */
function Edges({
  edges, nodes, vis,
}: { edges: [number,number][]; nodes: THREE.Vector3[]; vis: number }) {
  const { mode } = useSimulationStore();

  return (
    <>
      {edges.map(([a, b], i) => (
        <Line
          key={i}
          points={[nodes[a], nodes[b]]}
          color={mode === 'chaos' ? '#FF4422' : '#00EEFF'}
          lineWidth={0.4}
          transparent
          opacity={vis * 0.28}
        />
      ))}
    </>
  );
}

/* ── Travelling signal dots ──────────────────────────────────────────────── */
function SignalDots({ edges, nodes, vis }: { edges: [number,number][]; nodes: THREE.Vector3[]; vis: number }) {
  const { mode } = useSimulationStore();
  const meshRef  = useRef<THREE.InstancedMesh>(null);
  const dummy    = useMemo(() => new THREE.Object3D(), []);
  const mat      = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00FFCC'), transparent: true, opacity: 0,
  }), []);

  const speeds = useMemo(() =>
    edges.map(() => randRange(0.4, 1.4)), [edges]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    mat.opacity = vis * 0.95;
    mat.color.set(mode === 'chaos' ? '#FF8833' : '#00FFCC');

    edges.forEach(([a, b], i) => {
      const phase = ((t * speeds[i] + i * 0.37) % 1);
      const from  = nodes[a];
      const to    = nodes[b];
      dummy.position.lerpVectors(from, to, phase);
      dummy.scale.setScalar(0.05);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, mat, edges.length]}>
      <sphereGeometry args={[1, 6, 6]} />
    </instancedMesh>
  );
}

/* ── Root ─────────────────────────────────────────────────────────────────── */
export default function NeuralNetwork() {
  const { scrollProgress } = useSimulationStore();
  const { nodes, edges }   = useMemo(buildGraph, []);

  const vis = mapRange(scrollProgress, 0.82, 0.92, 0, 1);

  return (
    <group position={[0, 4, -2]}>
      <Nodes  nodes={nodes} vis={vis} />
      <Edges  edges={edges} nodes={nodes} vis={vis} />
      <SignalDots edges={edges} nodes={nodes} vis={vis} />
    </group>
  );
}
