// components/cloud/CloudScene.ts
/**
 * SynCity — Marseille-style flat street-map experience.
 *
 * Matches marseille.laphase5.com opening exactly:
 *  • Background: slate blue-grey (#1D2D3F) — NOT dark navy
 *  • Flat 2D-ish city map tilted in 3D perspective
 *  • Thin white lines = street network (arterials + secondary streets)
 *  • District outlines, lake areas, landmark pins
 *  • Camera hovers from upper-right, slowly orbiting
 *  • Scroll: camera descends into the city
 */

import * as THREE          from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ss    = (lo: number, hi: number, x: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
function mulberry32(s: number) {
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = z + Math.imul(z ^ (z >>> 7), 61 | z) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Road data: [x, z] waypoint arrays ─────────────────────────────────────
// Loosely inspired by Bangalore's road network.
// X = east (+) / west (-), Z = south (+) / north (-)

const ARTERIALS: [number, number][][] = [
  // E-W spine (MG Road)
  [[-22,0.5],[-15,0.8],[-8,0.4],[0,0],[8,-0.4],[16,-0.8],[22,-0.5]],
  // N-S spine (residency / hosur)
  [[-0.5,-22],[-0.3,-15],[0,-8],[0.3,0],[0.5,8],[0.8,15],[1,22]],
  // Outer Ring Road
  [[16,-2],[14,-9],[9,-15],[2,-19],[-6,-20],[-13,-17],[-18,-10],[-20,-2],
   [-18,7],[-13,14],[-5,18],[4,19],[11,16],[16,9],[16,-2]],
  // Inner connector (Intermediate Ring Road)
  [[9,-1],[8,-5],[5,-9],[0,-11],[-6,-10],[-9,-6],[-10,-1],[-8,5],
   [-4,8],[2,9],[7,7],[9,3],[9,-1]],
  // NW diagonal (Tumkur Road)
  [[0,0],[-4,3],[-9,8],[-14,14],[-20,20]],
  // NE diagonal (Old Airport Road)
  [[0,0],[5,-4],[11,-8],[17,-14]],
  // SW diagonal (Mysore Road)
  [[0,0],[-4,5],[-8,10],[-14,18]],
  // SE diagonal (Hosur extension)
  [[0,0],[4,4],[9,10],[14,18]],
];

// District internal street grids — [minX, minZ, maxX, maxZ, cols, rows]
const DISTRICT_GRIDS: [number,number,number,number,number,number][] = [
  [-9, -9,  0,  0, 4, 4],  // CBD west
  [ 0, -9,  9,  0, 3, 4],  // CBD east
  [-9,  0,  0,  9, 3, 3],  // Jayanagar
  [ 0,  0,  9,  9, 4, 3],  // Indiranagar
  [-14,-14, -8, -8, 3, 3], // Banashankari
  [ 8, -14, 14, -8, 3, 3], // Koramangala
  [-14,  8, -8, 14, 3, 3], // Yeshwantpur
  [ 8,   8, 14, 14, 3, 3], // Whitefield east
];

// District boundary outlines
const DISTRICT_OUTLINES: [number,number][][] = [
  [[-9,-9],[0,-9],[0,0],[-9,0],[-9,-9]],
  [[0,-9],[9,-9],[9,0],[0,0],[0,-9]],
  [[-9,0],[0,0],[0,9],[-9,9],[-9,0]],
  [[0,0],[9,0],[9,9],[0,9],[0,0]],
  [[-14,-14],[-8,-14],[-8,-8],[-14,-8],[-14,-14]],
  [[8,-14],[14,-14],[14,-8],[8,-8],[8,-14]],
  [[-14,8],[-8,8],[-8,14],[-14,14],[-14,8]],
  [[8,8],[14,8],[14,14],[8,14],[8,8]],
];

// Lake / water body outlines (rendered darker)
const LAKES: [number,number][][] = [
  // Ulsoor Lake (NE of center)
  [[3,-5],[8,-4],[9,-7],[7,-10],[3,-9],[2,-7],[3,-5]],
  // Lalbagh (SW of center)
  [[-5,3],[-1,3],[-1,7],[-4,8],[-6,6],[-5,3]],
  // Hebbal Lake (north)
  [[-3,14],[2,14],[3,17],[0,18],[-4,17],[-3,14]],
];

// Landmark pin positions [x, z]
const PINS: [number, number][] = [
  [0, -2],     // City centre / Cubbon Park
  [5, -8],     // Koramangala
  [-4, 4],     // Jayanagar
  [6, -6],     // Indiranagar
  [-2, 15],    // Hebbal / Airport corridor
  [10, 12],    // Whitefield
  [-10, -10],  // Banashankari
  [0, -16],    // Electronic City
];

// ═══════════════════════════════════════════════════════════════════════════════
export class CloudScene {
  private renderer  : THREE.WebGLRenderer;
  private scene     : THREE.Scene;
  private camera    : THREE.PerspectiveCamera;
  private composer  : EffectComposer | null = null;
  private bloomPass : UnrealBloomPass | null = null;

  private raf      = 0;
  private alive    = true;
  private elapsed  = 0;
  private progress = 0;

  constructor(canvas: HTMLCanvasElement) {
    // ── Renderer ──────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(0x1D2D3F, 1);
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // ── Scene ─────────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1D2D3F);
    // Subtle fog — makes distant streets fade into the background
    this.scene.fog = new THREE.FogExp2(0x1A2A3A, 0.020);

    // ── Camera ────────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 500);

    this.buildMap();
    this.initBloom();
    this.positionCamera(0);

    window.addEventListener('resize', this.onResize);
  }

  // ── Build city map ─────────────────────────────────────────────────────────
  private buildMap() {
    const rng = mulberry32(42);

    // ── Background ground plane (slightly darker than bg — land area) ─────────
    const geoGround = new THREE.PlaneGeometry(120, 120);
    const matGround = new THREE.MeshBasicMaterial({ color: 0x16222E });
    const ground = new THREE.Mesh(geoGround, matGround);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    this.scene.add(ground);

    // ── Lake fills (darker than land) ─────────────────────────────────────────
    LAKES.forEach(poly => {
      const shape = new THREE.Shape();
      shape.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], poly[i][1]);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({ color: 0x0D1820, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.05;
      this.scene.add(mesh);

      // Lake outline
      this.addLineLoop(poly, 0x3A6AA0, 0.70, 0.02);
    });

    // ── Arterial roads ────────────────────────────────────────────────────────
    ARTERIALS.forEach(pts => {
      this.addPolyLine(pts, 0xA0BDDD, 0.65, 0.01);
    });

    // ── District internal grids ───────────────────────────────────────────────
    DISTRICT_GRIDS.forEach(([x0, z0, x1, z1, cols, rows]) => {
      const pts: THREE.Vector3[] = [];
      for (let c = 0; c <= cols; c++) {
        const x = lerp(x0, x1, c / cols) + (rng() - 0.5) * 0.3;
        pts.push(new THREE.Vector3(x, 0.01, z0));
        pts.push(new THREE.Vector3(x, 0.01, z1));
      }
      for (let r = 0; r <= rows; r++) {
        const z = lerp(z0, z1, r / rows) + (rng() - 0.5) * 0.3;
        pts.push(new THREE.Vector3(x0, 0.01, z));
        pts.push(new THREE.Vector3(x1, 0.01, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x5A7A99, opacity: 0.45, transparent: true });
      this.scene.add(new THREE.LineSegments(geo, mat));
    });

    // ── District outlines ─────────────────────────────────────────────────────
    DISTRICT_OUTLINES.forEach(poly => {
      this.addLineLoop(poly, 0x6A9ABB, 0.55, 0.02);
    });

    // ── Outer city boundary ───────────────────────────────────────────────────
    // Drawn from the outer ring road already, add a gentle outer "admin boundary"
    const boundaryPts: [number,number][] = [];
    const N = 64, R_OUTER = 26;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const jitter = 1 + (mulberry32(i * 7)() - 0.5) * 0.18;
      boundaryPts.push([Math.cos(a) * R_OUTER * jitter, Math.sin(a) * R_OUTER * jitter]);
    }
    this.addLineLoop(boundaryPts, 0x4A7AAA, 0.40, 0.02);

    // ── Landmark pins ─────────────────────────────────────────────────────────
    PINS.forEach(([px, pz]) => {
      const pinH = 0.8;
      // Pin body (thin cylinder)
      const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, pinH, 6);
      const stemMat = new THREE.MeshBasicMaterial({ color: 0xDDE8F4 });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(px, pinH / 2, pz);
      this.scene.add(stem);
      // Pin head (sphere)
      const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xEEF4FF });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(px, pinH + 0.22, pz);
      this.scene.add(head);
    });

    // ── Centre glow (like Marseille's brighter city center) ───────────────────
    // A large very subtle radial glow disc at y=0
    const glowGeo = new THREE.CircleGeometry(18, 64);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x253D55,
      transparent: true,
      opacity: 0.45,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.08;
    this.scene.add(glow);
  }

  // ── Helper: polyline from [x,z] pairs ─────────────────────────────────────
  private addPolyLine(pts: [number,number][], color: number, opacity: number, y: number) {
    const v3 = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
    const geo = new THREE.BufferGeometry().setFromPoints(v3);
    const mat = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
    this.scene.add(new THREE.Line(geo, mat));
  }

  private addLineLoop(pts: [number,number][], color: number, opacity: number, y: number) {
    const v3 = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
    const geo = new THREE.BufferGeometry().setFromPoints(v3);
    const mat = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
    this.scene.add(new THREE.LineLoop(geo, mat));
  }

  // ── Bloom ─────────────────────────────────────────────────────────────────
  private initBloom() {
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        0.35, 1.0, 0.05,
      );
      this.composer.addPass(this.bloomPass);
    } catch { this.composer = null; }
  }

  // ── Camera positioning ────────────────────────────────────────────────────
  // Starts upper-right like Marseille (offset +x, high y), looking at city center.
  private positionCamera(t: number) {
    const autoAngle   = (this.elapsed || 0) * 0.012;  // very slow orbit
    const baseAngle   = Math.PI * 0.18;                // start upper-right (~32°)
    const scrollAngle = t * Math.PI * 0.40;            // 72° sweep over full scroll
    const angle       = baseAngle + autoAngle + scrollAngle;

    const camY = lerp(32, 8, ss(0, 1, t));   // descend from aerial to low
    const camR = lerp(44, 24, ss(0, 1, t));  // close in

    this.camera.position.set(
      Math.sin(angle) * camR,
      camY,
      Math.cos(angle) * camR,
    );
    const lookY = lerp(2, 0, ss(0, 1, t));
    this.camera.lookAt(0, lookY, 0);
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  start() { this.tick(); }

  private tick = () => {
    if (!this.alive) return;
    this.raf     = requestAnimationFrame(this.tick);
    this.elapsed = performance.now() / 1000;

    this.positionCamera(this.progress);

    if (this.composer) this.composer.render();
    else               this.renderer.render(this.scene, this.camera);
  };

  updateScene(t: number) {
    this.progress = clamp(t, 0, 1);
    if (this.bloomPass) {
      this.bloomPass.strength = lerp(0.30, 0.60, ss(0.1, 0.9, this.progress));
    }
  }

  private onResize = () => {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  };

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse(obj => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose());
      else mat?.dispose();
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
