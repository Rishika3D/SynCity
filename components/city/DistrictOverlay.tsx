'use client';

/**
 * components/city/DistrictOverlay.tsx
 *
 * Semi-transparent coloured polygon overlays showing district boundaries.
 * Each DistrictType gets a distinct tinted fill + an emissive boundary wire.
 *
 * Two draw calls per district type (fill + outline) = ~14 draw calls total.
 * Day/Night: brighter fill at night (neon glow), subtle at day.
 *
 * Polygons are in world-space XZ, lifted to OVERLAY_Y above terrain.
 */

import { useMemo, useEffect } from 'react';
import { useFrame }           from '@react-three/fiber';
import * as THREE             from 'three';
import type { District }      from '@/types/district';
import { DistrictType }       from '@/types/district';
import { useTimeOfDay }       from '@/contexts/TimeOfDayContext';

// ─── District colour table ────────────────────────────────────────────────────

const DISTRICT_COLORS: Record<DistrictType, { fill: string; edge: string }> = {
  [DistrictType.CBD]:         { fill: '#001a33', edge: '#00f3ff' },
  [DistrictType.TechHub]:     { fill: '#001a1a', edge: '#00ffcc' },
  [DistrictType.Residential]: { fill: '#1a1a00', edge: '#ffcc00' },
  [DistrictType.GreenLung]:   { fill: '#001a00', edge: '#00ff55' },
  [DistrictType.Industrial]:  { fill: '#1a0a00', edge: '#ff8800' },
  [DistrictType.Mixed]:       { fill: '#0d0a1a', edge: '#aa88ff' },
};

const OVERLAY_Y = 0.22;

// ─── Earcut-style triangulation via THREE.Shape ───────────────────────────────

function buildDistrictFill(polygon: [number, number][]): THREE.BufferGeometry | null {
  if (polygon.length < 3) return null;

  const vecs = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const shape = new THREE.Shape(vecs);
  const shapeGeo = new THREE.ShapeGeometry(shape, 1);

  // Remap from XY plane → XZ world plane at overlay elevation
  const pos = shapeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i), OVERLAY_Y, pos.getY(i));
  }
  pos.needsUpdate = true;
  shapeGeo.computeVertexNormals();
  return shapeGeo;
}

function buildDistrictEdge(polygon: [number, number][]): THREE.BufferGeometry {
  const pts = polygon.map(([x, z]) => new THREE.Vector3(x, OVERLAY_Y + 0.05, z));
  // Close the loop
  if (pts.length > 0) pts.push(pts[0].clone());
  return new THREE.BufferGeometry().setFromPoints(pts);
}

// ─── Per-district overlay record ─────────────────────────────────────────────

interface DistrictMeshes {
  fillGeo:  THREE.BufferGeometry | null;
  edgeGeo:  THREE.BufferGeometry;
  fillMat:  THREE.MeshBasicMaterial;
  edgeMat:  THREE.LineBasicMaterial;
  distType: DistrictType;
}

// ─── GLSL for fill — animated subtle noise + day/night ───────────────────────
// Using MeshBasicMaterial for simplicity; day/night via material opacity

// ─── Component ────────────────────────────────────────────────────────────────

interface DistrictOverlayProps {
  districts: District[];
  visible?:  boolean;
}

export function DistrictOverlay({ districts, visible = true }: DistrictOverlayProps) {
  const { dayFactor } = useTimeOfDay();

  const meshData = useMemo<DistrictMeshes[]>(() => {
    return districts.map(d => {
      const colors = DISTRICT_COLORS[d.profile.type] ?? DISTRICT_COLORS[DistrictType.Mixed];
      const fillGeo = buildDistrictFill(d.polygon);
      const edgeGeo = buildDistrictEdge(d.polygon);

      const fillMat = new THREE.MeshBasicMaterial({
        color:       colors.fill,
        transparent: true,
        opacity:     0.18,
        depthWrite:  false,
        side:        THREE.DoubleSide,
      });

      const edgeMat = new THREE.LineBasicMaterial({
        color:       colors.edge,
        transparent: true,
        opacity:     0.55,
        depthWrite:  false,
        linewidth:   1,  // Note: linewidth > 1 requires WebGL2 LINE extension
      });

      return { fillGeo, edgeGeo, fillMat, edgeMat, distType: d.profile.type };
    });
  }, [districts]);

  // Day/night opacity adaptation
  useFrame(() => {
    for (const d of meshData) {
      // Night: visible district tints. Day: very subtle.
      d.fillMat.opacity  = THREE.MathUtils.lerp(0.18, 0.06, dayFactor);
      d.edgeMat.opacity  = THREE.MathUtils.lerp(0.55, 0.20, dayFactor);
    }
  });

  // Cleanup
  useEffect(() => () => {
    for (const d of meshData) {
      d.fillGeo?.dispose();
      d.edgeGeo.dispose();
      d.fillMat.dispose();
      d.edgeMat.dispose();
    }
  }, [meshData]);

  if (!visible) return null;

  return (
    <group name="district-overlay">
      {meshData.map((d, i) => (
        <group key={i}>
          {d.fillGeo && (
            <mesh
              geometry={d.fillGeo}
              material={d.fillMat}
              renderOrder={1}
              frustumCulled={false}
            />
          )}
          <line
            geometry={d.edgeGeo}
            material={d.edgeMat}
            renderOrder={2}
          />
        </group>
      ))}
    </group>
  );
}
