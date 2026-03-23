'use client';
import { useRef, useMemo }   from 'react';
import { useFrame }           from '@react-three/fiber';
import * as THREE             from 'three';
import { useSimulationStore } from '@/store/useSimulationStore';
import { mapRange }           from '@/lib/math';

const vertexShader = /* glsl */ `
  varying vec2  vUv;
  varying float vElevation;
  uniform float uTime;
  uniform float uIntensity;

  void main() {
    vUv = uv;
    float wave = sin(position.x * 1.4 + uTime * 1.6) *
                 cos(position.z * 1.4 + uTime * 1.2) * uIntensity;
    vElevation = wave;
    vec3 pos = position + normal * wave * 0.3;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec2  vUv;
  varying float vElevation;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;

  void main() {
    vec2 uv  = vUv;
    uv.x    += sin(uv.y * 9.0 + uTime * 0.7) * 0.013;
    uv.y    += cos(uv.x * 9.0 + uTime * 0.6) * 0.013;

    float t   = clamp((vElevation + 0.5) + sin(uv.x * 7.0 + uTime) * 0.2, 0.0, 1.0);
    vec3 col  = mix(uColorA, uColorB, t);

    float ring = fract(length(uv - 0.5) * 7.0 - uTime * 0.55);
    col += uColorB * ring * ring * 0.18;

    float edge = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x)
               * smoothstep(0.0, 0.1, uv.y) * smoothstep(1.0, 0.9, uv.y);

    gl_FragColor = vec4(col, uOpacity * edge * 0.50);
  }
`;

export default function Heatmap() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { scrollProgress, mode } = useSimulationStore();

  const uniforms = useMemo(() => ({
    uTime     : { value: 0 },
    uIntensity: { value: 0.35 },
    uOpacity  : { value: 0 },
    uColorA   : { value: new THREE.Color('#0A2040') },
    uColorB   : { value: new THREE.Color('#FF2244') },
  }), []);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const u = matRef.current.uniforms;
    u.uTime.value = clock.getElapsedTime();

    const vis = mapRange(scrollProgress, 0.40, 0.58, 0, 1)
              * mapRange(scrollProgress, 0.68, 0.78, 1, 0);
    u.uOpacity.value = vis;

    if (mode === 'chaos') {
      u.uColorA.value.set('#1A0A00');
      u.uColorB.value.set('#FF3300');
      u.uIntensity.value = 0.55;
    } else {
      u.uColorA.value.set('#001A30');
      u.uColorB.value.set('#0088FF');
      u.uIntensity.value = 0.28;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
      <planeGeometry args={[14, 14, 48, 48]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
