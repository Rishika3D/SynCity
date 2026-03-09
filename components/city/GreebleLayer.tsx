'use client';

/**
 * components/city/GreebleLayer.tsx
 *
 * Rooftop greebles: small detail objects placed on top of buildings.
 * Day/Night adaptive: darker at night with red antenna glow, lighter during day.
 *
 * Three InstancedMesh types:
 *   1. AC units    — small boxes clustered on rooftops (max 1000)
 *   2. Water tanks — cylinders on taller buildings    (max 500)
 *   3. Antennas    — thin tall cylinders              (max 500)
 */

import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CityBlock } from '@/types/block';
import type { District } from '@/types/district';
import { DistrictType, DISTRICT_PROFILES } from '@/types/district';
import { hashSeed } from './BuildingGrammar';
import { useTimeOfDay } from '@/contexts/TimeOfDayContext';

// ─── Instance caps ────────────────────────────────────────────────────────────

const MAX_AC       = 1000;
const MAX_TANKS    = 500;
const MAX_ANTENNAS = 500;

const MIN_HEIGHT_FOR_GREEBLE = 3.0;

const DUMMY = new THREE.Object3D();

// ─── Seeded random ───────────────────────────────────────────────────────────

const sr = (seed: number): number => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43_758.5453;
  return v - Math.floor(v);
};

// ─── Greeble placement data ──────────────────────────────────────────────────

interface GreeblePlacement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  type: 'ac' | 'tank' | 'antenna';
}

function generateGreebles(
  blocks:    CityBlock[],
  districts: District[],
  metresToUnit: number,
): GreeblePlacement[] {
  const placements: GreeblePlacement[] = [];

  for (const block of blocks) {
    for (const lot of block.lots) {
      const district = districts.find(d => d.id === lot.districtId)
        ?? districts.find(d => d.id === block.districtId);
      const profile = district?.profile ?? DISTRICT_PROFILES[DistrictType.Mixed];

      const h = hashSeed(lot.id + '-height');
      const totalH = (profile.minHeight + h * h * (profile.maxHeight - profile.minHeight)) * metresToUnit;

      if (totalH < MIN_HEIGHT_FOR_GREEBLE) continue;

      const greebleRoll = hashSeed(lot.id + '-greeble');
      if (greebleRoll > profile.greebleProbability) continue;

      const roofY = totalH;
      const cx = lot.centre[0];
      const cz = lot.centre[1];

      const typeRoll = hashSeed(lot.id + '-gtype');

      if (typeRoll < 0.5) {
        const count = 1 + Math.floor(sr(cx * 73 + cz * 131) * 3);
        for (let i = 0; i < count; i++) {
          if (placements.length >= MAX_AC + MAX_TANKS + MAX_ANTENNAS) break;
          const ox = (sr(cx * 17 + i * 37) - 0.5) * 1.5;
          const oz = (sr(cz * 23 + i * 41) - 0.5) * 1.5;
          placements.push({
            x: cx + ox,
            y: roofY,
            z: cz + oz,
            rotY: sr(cx * 7 + cz * 11 + i) * Math.PI * 2,
            type: 'ac',
          });
        }
      } else if (typeRoll < 0.8) {
        if (placements.length < MAX_AC + MAX_TANKS + MAX_ANTENNAS) {
          placements.push({
            x: cx + (sr(cx * 19 + cz * 29) - 0.5) * 0.8,
            y: roofY,
            z: cz + (sr(cz * 31 + cx * 43) - 0.5) * 0.8,
            rotY: 0,
            type: 'tank',
          });
        }
      } else {
        if (placements.length < MAX_AC + MAX_TANKS + MAX_ANTENNAS) {
          placements.push({
            x: cx,
            y: roofY,
            z: cz,
            rotY: 0,
            type: 'antenna',
          });
        }
      }
    }
  }

  return placements;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GreebleLayerProps {
  blocks?:      CityBlock[];
  districts?:   District[];
  metresToUnit: number;
}

export function GreebleLayer({ blocks, districts, metresToUnit }: GreebleLayerProps) {
  const { dayFactor } = useTimeOfDay();

  if (!blocks || !districts || blocks.length === 0) return null;

  const placements = useMemo(
    () => generateGreebles(blocks, districts, metresToUnit),
    [blocks, districts, metresToUnit],
  );

  const acPlacements = useMemo(() => placements.filter(p => p.type === 'ac').slice(0, MAX_AC), [placements]);
  const tankPlacements = useMemo(() => placements.filter(p => p.type === 'tank').slice(0, MAX_TANKS), [placements]);
  const antennaPlacements = useMemo(() => placements.filter(p => p.type === 'antenna').slice(0, MAX_ANTENNAS), [placements]);

  // Geometries
  const acGeo = useMemo(() => new THREE.BoxGeometry(0.4, 0.25, 0.3), []);
  const tankGeo = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 0.6, 6), []);
  const antennaGeo = useMemo(() => new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4), []);

  // Night/day colour values for lerping
  const acColorNight      = useMemo(() => new THREE.Color('#0c0c18'), []);
  const acColorDay        = useMemo(() => new THREE.Color('#606068'), []);
  const tankColorNight    = useMemo(() => new THREE.Color('#0a0a15'), []);
  const tankColorDay      = useMemo(() => new THREE.Color('#555560'), []);
  const antennaColorNight = useMemo(() => new THREE.Color('#111122'), []);
  const antennaColorDay   = useMemo(() => new THREE.Color('#667070'), []);
  const antennaEmNight    = useMemo(() => new THREE.Color('#ff2200'), []);
  const antennaEmDay      = useMemo(() => new THREE.Color('#cc4422'), []);
  const tmpColor          = useMemo(() => new THREE.Color(), []);

  // Materials
  const acMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0c0c18',
    metalness: 0.7,
    roughness: 0.5,
  }), []);

  const tankMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#0a0a15',
    metalness: 0.8,
    roughness: 0.3,
  }), []);

  const antennaMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#111122',
    emissive: '#ff2200',
    emissiveIntensity: 0.3,
    metalness: 0.9,
    roughness: 0.1,
  }), []);

  // Refs
  const acRef = useRef<THREE.InstancedMesh>(null);
  const tankRef = useRef<THREE.InstancedMesh>(null);
  const antennaRef = useRef<THREE.InstancedMesh>(null);

  // Upload instance matrices
  useEffect(() => {
    if (acRef.current) {
      acPlacements.forEach((p, i) => {
        DUMMY.position.set(p.x, p.y + 0.125, p.z);
        DUMMY.rotation.set(0, p.rotY, 0);
        DUMMY.scale.setScalar(1);
        DUMMY.updateMatrix();
        acRef.current!.setMatrixAt(i, DUMMY.matrix);
      });
      acRef.current.count = acPlacements.length;
      acRef.current.instanceMatrix.needsUpdate = true;
      acRef.current.computeBoundingSphere();
    }

    if (tankRef.current) {
      tankPlacements.forEach((p, i) => {
        DUMMY.position.set(p.x, p.y + 0.3, p.z);
        DUMMY.rotation.set(0, 0, 0);
        DUMMY.scale.setScalar(1);
        DUMMY.updateMatrix();
        tankRef.current!.setMatrixAt(i, DUMMY.matrix);
      });
      tankRef.current.count = tankPlacements.length;
      tankRef.current.instanceMatrix.needsUpdate = true;
      tankRef.current.computeBoundingSphere();
    }

    if (antennaRef.current) {
      antennaPlacements.forEach((p, i) => {
        DUMMY.position.set(p.x, p.y + 0.75, p.z);
        DUMMY.rotation.set(0, 0, 0);
        DUMMY.scale.setScalar(1);
        DUMMY.updateMatrix();
        antennaRef.current!.setMatrixAt(i, DUMMY.matrix);
      });
      antennaRef.current.count = antennaPlacements.length;
      antennaRef.current.instanceMatrix.needsUpdate = true;
      antennaRef.current.computeBoundingSphere();
    }
  }, [acPlacements, tankPlacements, antennaPlacements]);

  // Day/night material lerping
  useFrame(() => {
    const f = dayFactor;

    tmpColor.copy(acColorNight).lerp(acColorDay, f);
    acMat.color.copy(tmpColor);

    tmpColor.copy(tankColorNight).lerp(tankColorDay, f);
    tankMat.color.copy(tmpColor);

    tmpColor.copy(antennaColorNight).lerp(antennaColorDay, f);
    antennaMat.color.copy(tmpColor);
    tmpColor.copy(antennaEmNight).lerp(antennaEmDay, f);
    antennaMat.emissive.copy(tmpColor);
    antennaMat.emissiveIntensity = THREE.MathUtils.lerp(0.3, 0.05, f);
  });

  // Cleanup
  useEffect(() => () => {
    acGeo.dispose(); tankGeo.dispose(); antennaGeo.dispose();
    acMat.dispose(); tankMat.dispose(); antennaMat.dispose();
  }, [acGeo, tankGeo, antennaGeo, acMat, tankMat, antennaMat]);

  return (
    <group name="greeble-layer">
      {acPlacements.length > 0 && (
        <instancedMesh ref={acRef} args={[acGeo, acMat, MAX_AC]} frustumCulled={false} />
      )}
      {tankPlacements.length > 0 && (
        <instancedMesh ref={tankRef} args={[tankGeo, tankMat, MAX_TANKS]} frustumCulled={false} />
      )}
      {antennaPlacements.length > 0 && (
        <instancedMesh ref={antennaRef} args={[antennaGeo, antennaMat, MAX_ANTENNAS]} frustumCulled={false} />
      )}
    </group>
  );
}
