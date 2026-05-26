'use client';
import { useRef, useMemo } from 'react';
import { useFrame }         from '@react-three/fiber';
import { shaderMaterial }   from '@react-three/drei';
import { extend }           from '@react-three/fiber';
import * as THREE           from 'three';
import { useSimulationStore } from '@/store/useSimulationStore';
import { PARTICLE_COUNT, CITY_GRID } from '@/lib/constants';
import { randRange, mapRange }       from '@/lib/math';

/* ── GLSL inline (avoids webpack raw-loader setup) ───────────────────────── */
const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uSize;

  attribute vec3 aPositionCloud;
  attribute vec3 aPositionCity;

  varying float vDepth;
  varying float vLife;

  float hash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                   mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                   mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }

  void main() {
    float t = uTime * 0.15;
    vec3 drift = vec3(
      noise(aPositionCloud * 0.35 + vec3(t, 0.0, 0.0)) - 0.5,
      noise(aPositionCloud * 0.35 + vec3(0.0, t, 0.0)) - 0.5,
      noise(aPositionCloud * 0.35 + vec3(0.0, 0.0, t)) - 0.5
    ) * 1.2;

    float m = uMorph * uMorph * (3.0 - 2.0 * uMorph);
    vec3 pos = mix(aPositionCloud + drift * (1.0 - m), aPositionCity, m);

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vDepth = 1.0 - clamp(-mvPos.z / 32.0, 0.0, 1.0);
    vLife  = noise(aPositionCloud * 2.0 + vec3(uTime * 0.3));

    float sz = uSize * (0.9 + vLife * 0.5) * max(vDepth, 0.1);
    gl_PointSize = sz * (280.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3  uColor;
  uniform float uOpacity;

  varying float vDepth;
  varying float vLife;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float alpha = smoothstep(0.5, 0.0, d) * vDepth * uOpacity;
    alpha *= 0.65 + vLife * 0.35;

    vec3 col = mix(uColor * 2.0, uColor * 0.5, smoothstep(0.0, 0.5, d));
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── Build positions ──────────────────────────────────────────────────────── */
function buildPositions() {
  // Cloud: uniform sphere distribution
  const cloud = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = randRange(0.5, 1) * 14;
    cloud[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    cloud[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    cloud[i * 3 + 2] = r * Math.cos(phi);
  }

  // City: grid of columns (buildings)
  const city = new Float32Array(PARTICLE_COUNT * 3);
  const { cols, rows } = CITY_GRID;
  const spacingX = 14 / cols;
  const spacingZ = 14 / rows;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const buildingH = randRange(0.5, 4.5);
    const layer     = Math.floor(i / (cols * rows));
    const layerT    = layer / Math.max(1, PARTICLE_COUNT / (cols * rows));

    city[i * 3]     = (col - cols / 2) * spacingX + randRange(-0.15, 0.15);
    city[i * 3 + 1] = layerT * buildingH - 1;
    city[i * 3 + 2] = (row - rows / 2) * spacingZ + randRange(-0.15, 0.15);
  }

  return { cloud, city };
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function Particles() {
  const meshRef  = useRef<THREE.Points>(null);
  const matRef   = useRef<THREE.ShaderMaterial>(null);
  const { scrollProgress } = useSimulationStore();

  const { cloud, city } = useMemo(buildPositions, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('aPositionCloud', new THREE.BufferAttribute(cloud, 3));
    geo.setAttribute('aPositionCity',  new THREE.BufferAttribute(city,  3));
    // position attr is required — use cloud as default
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));
    return geo;
  }, [cloud, city]);

  const uniforms = useMemo(() => ({
    uTime   : { value: 0 },
    uMorph  : { value: 0 },
    uSize   : { value: 3.2 },
    uColor  : { value: new THREE.Color('#4488FF') },
    uOpacity: { value: 1.0 },
  }), []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = clock.getElapsedTime();

    // Morph: 0 in scene 0–1, 1 in scene 2+
    u.uMorph.value = mapRange(scrollProgress, 0.20, 0.40, 0, 1);

    // Colour: blue → cyan → green by scene
    const r = mapRange(scrollProgress, 0, 1, 0.05, 0.0);
    const g = mapRange(scrollProgress, 0, 1, 0.27, 0.85);
    const b = mapRange(scrollProgress, 0, 1, 1.0,  0.5);
    u.uColor.value.setRGB(r, g, b);

    // Opacity: fades out during neural scene
    u.uOpacity.value = mapRange(scrollProgress, 0.85, 0.95, 1, 0.15);

    // Size: larger in mystery, tighter in city
    u.uSize.value = mapRange(scrollProgress, 0, 0.3, 3.8, 2.0);
  });

  return (
    <points ref={meshRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
