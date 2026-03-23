'use client';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 }            from 'three';
import { useSimulationStore }  from '@/store/useSimulationStore';
import { CAMERA_WAYPOINTS, CAMERA_TARGETS } from '@/lib/constants';
import { lerp, mapRange, smoothstep }       from '@/lib/math';

const _pos    = new Vector3();
const _target = new Vector3();
const _curr   = new Vector3();

export default function CameraController() {
  const { camera } = useThree();
  const { scrollProgress } = useSimulationStore();
  const tRef = useRef(0);

  useFrame((_, delta) => {
    // Which two waypoints are we between?
    const totalSegs = CAMERA_WAYPOINTS.length - 1;
    const raw       = scrollProgress * totalSegs;
    const segIdx    = Math.min(Math.floor(raw), totalSegs - 1);
    const segT      = raw - segIdx;

    const a = CAMERA_WAYPOINTS[segIdx];
    const b = CAMERA_WAYPOINTS[segIdx + 1];
    const ta = CAMERA_TARGETS[segIdx];
    const tb = CAMERA_TARGETS[segIdx + 1];

    const t = smoothstep(0, 1, segT);

    _pos.set(
      lerp(a[0], b[0], t),
      lerp(a[1], b[1], t),
      lerp(a[2], b[2], t),
    );
    _target.set(
      lerp(ta[0], tb[0], t),
      lerp(ta[1], tb[1], t),
      lerp(ta[2], tb[2], t),
    );

    // Lazy follow — smooth damping
    const speed = 1 - Math.pow(0.02, delta);
    camera.position.lerp(_pos, speed);
    _curr.lerp(_target, speed);
    camera.lookAt(_curr);

    // Subtle autonomous sway for Scene 0 (mystery)
    if (scrollProgress < 0.15) {
      tRef.current += delta;
      camera.position.x += Math.sin(tRef.current * 0.22) * 0.008;
      camera.position.y += Math.cos(tRef.current * 0.17) * 0.004;
    }
  });

  return null;
}
