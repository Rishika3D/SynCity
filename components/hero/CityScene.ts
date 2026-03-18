// components/hero/CityScene.ts
/**
 * SynCity — Premium cinematic cloud-to-city WebGL journey.
 *
 * Scene progression  (updateScene t: 0 → 1)
 * ──────────────────────────────────────────
 *  0.00 – 0.18  Scene 1 — Above clouds     : volumetric cloud field, SYNCITY text
 *  0.18 – 0.46  Scene 2 — Cloud flythrough : camera descends, fog thickens → breaks
 *  0.46 – 0.60  Scene 3 — City reveal      : atmosphere clears, neon city materialises
 *  0.60 – 0.85  Scene 4 — Story mode       : 4 rotating city data aspects
 *  0.85 – 1.00  Scene 5 — Enter city       : descent to street level, CTA
 *
 * Premium features
 * ──────────────────
 *  • Multi-sine wave terrain deformation (elegant, not noisy)
 *  • World-space grid overlay fades in during city phase
 *  • makeTower() factory: dark metallic body + 4 neon corner strips
 *    + horizontal accent rings + spire on core towers
 *  • 15 buildings across 3 tiers: core (cyan) / mid (violet) / outer (amber)
 *  • UnrealBloom: strength 1.20, threshold 0.42, radius 0.70
 *  • ACES tone mapping, exposure 1.0
 */

import * as THREE          from 'three';
import { EffectComposer }  from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ss    = (lo: number, hi: number, x: number) => {
  const t = clamp((x - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = z + Math.imul(z ^ (z >>> 7), 61 | z) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Fog palette ───────────────────────────────────────────────────────────────
const FOG_CLOUD = new THREE.Color(0xB8CCDE);   // soft blue-white  (cloud phase)
const FOG_CITY  = new THREE.Color(0x05080F);   // deep night navy  (city phase)

// ── City layout ───────────────────────────────────────────────────────────────
const CITY_CENTER = new THREE.Vector3(0, 0, -20);

// Neon hue per tier
const TIER_HEX = [0x00eeff, 0x9933ff, 0xff7722] as const;

// [localX, localZ, width, depth, height, tier]
// tier 0 = core (cyan), tier 1 = mid (violet), tier 2 = outer (amber)
const TOWERS: [number, number, number, number, number, number][] = [
  // ─ Core — h 28–34 ────────────────────────────────────────────────────────
  [  0.0,   0.0, 1.80, 1.80, 34, 0],   // 0  landmark centrepiece
  [  5.5,   2.5, 1.40, 1.40, 28, 0],   // 1
  [ -4.5,  -2.0, 1.50, 1.50, 30, 0],   // 2
  // ─ Mid — h 14–20 ─────────────────────────────────────────────────────────
  [ 10.5,   0.5, 1.10, 0.90, 20, 1],   // 3
  [-10.0,   2.0, 1.00, 1.10, 18, 1],   // 4
  [  1.0,  11.0, 1.20, 0.90, 17, 1],   // 5
  [  0.5, -10.5, 1.10, 1.00, 16, 1],   // 6
  [  7.5,   8.0, 0.90, 0.90, 14, 1],   // 7
  // ─ Outer — h 6–9 ─────────────────────────────────────────────────────────
  [ 15.0,   3.5, 0.80, 0.70,  9, 2],   //  8
  [-15.0,  -2.5, 0.70, 0.90,  8, 2],   //  9
  [  3.5,  15.0, 0.90, 0.70,  8, 2],   // 10
  [ -3.0, -15.0, 0.70, 0.80,  7, 2],   // 11
  [ 12.5, -11.0, 0.70, 0.70,  7, 2],   // 12
  [-12.0,  11.5, 0.80, 0.70,  6, 2],   // 13
  [ 19.0,   1.5, 0.60, 0.60,  6, 2],   // 14
];

// Data-connection pairs (tower indices)
const CONNS: [number, number][] = [
  [0,1],[0,2],[1,2],
  [0,3],[0,4],[0,5],[0,6],
  [1,3],[1,7],[2,4],[2,5],
  [3,8],[4,9],[5,10],[6,11],[7,12],
  [0,7],[1,5],[2,6],
];

// Camera keyframes — above clouds → cloud break → city reveal → street
const CAM_KF = [
  { t: 0.00, px:   0, py: 130, pz:  35, tx:  0, ty: 22, tz: -18 },
  { t: 0.22, px:   0, py:  85, pz:  38, tx:  0, ty: 12, tz: -20 },
  { t: 0.44, px:   0, py:  35, pz:  30, tx:  0, ty: -2, tz: -20 },
  { t: 0.56, px:   0, py:  90, pz: 105, tx:  0, ty:  0, tz: -20 },
  { t: 0.70, px:  42, py:  60, pz:  70, tx:  0, ty:  8, tz: -20 },
  { t: 0.85, px: -12, py:  25, pz:  30, tx:  0, ty:  0, tz: -20 },
  { t: 1.00, px:   0, py:   6, pz:   6, tx:  0, ty:  4, tz: -20 },
] as const;

// ── Terrain shaders ───────────────────────────────────────────────────────────
// Vertex: elegant multi-frequency sine wave deformation (no FBM, no noise deps)
// Fragment: metallic PBR-like surface with world-space grid overlay
const TERRAIN_VERT = /* glsl */`
  precision highp float;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Three overlapping sine frequencies — smooth wave deformation
    float h = sin(pos.x * 0.072 + uTime * 0.030) * cos(pos.y * 0.058 + uTime * 0.024) * 0.90
            + sin(pos.x * 0.148 + uTime * 0.055 + 1.20) * sin(pos.y * 0.122 + 0.80) * 0.38
            + cos((pos.x + pos.y) * 0.198 + uTime * 0.042) * 0.18;

    float edge = smoothstep(0.0, 0.08, uv.y) * (1.0 - smoothstep(0.88, 1.0, uv.y));
    pos.z += h * edge;

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const TERRAIN_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  uniform vec3  uCamPos;
  uniform vec3  uCyanPos;
  uniform vec3  uVioletPos;
  uniform vec3  uAmberPos;
  uniform float uCyanI;
  uniform float uVioletI;
  uniform float uAmberI;
  uniform float uFog;
  uniform vec3  uFogColor;
  uniform float uCityPhase;

  void main() {
    // Analytical normals from screen-space derivatives (WebGL 2 built-in)
    vec3 N = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 R = reflect(-V, N);

    // Dark metallic base colour
    vec3 col = vec3(0.014, 0.017, 0.025);

    // Fresnel rim glow
    float fr = pow(1.0 - max(dot(N, V), 0.0), 3.5);
    col += vec3(0.014, 0.028, 0.055) * fr;

    // Cyan key light — diffuse + specular
    { vec3  L   = normalize(uCyanPos - vWorldPos);
      float d   = length(uCyanPos - vWorldPos);
      float att = 1.0 / (1.0 + d * d * 0.0035);
      col += vec3(0.00, 0.55, 0.75) * max(dot(N, L), 0.0) * att * uCyanI * 0.50;
      col += vec3(0.00, 0.80, 1.00) * pow(max(dot(R, L), 0.0), 90.0) * att * uCyanI * 0.90; }

    // Violet fill
    { vec3  L   = normalize(uVioletPos - vWorldPos);
      float d   = length(uVioletPos - vWorldPos);
      float att = 1.0 / (1.0 + d * d * 0.0055);
      col += vec3(0.38, 0.10, 0.70) * max(dot(N, L), 0.0) * att * uVioletI * 0.42; }

    // Amber rim
    { vec3  L   = normalize(uAmberPos - vWorldPos);
      float d   = length(uAmberPos - vWorldPos);
      float att = 1.0 / (1.0 + d * d * 0.0065);
      col += vec3(0.80, 0.40, 0.00) * max(dot(N, L), 0.0) * att * uAmberI * 0.38; }

    // World-space grid overlay — fades in with city phase
    vec2  gCoord = vWorldPos.xz * 0.12;
    vec2  gFract = abs(fract(gCoord) - 0.5);
    float grid   = 1.0 - smoothstep(0.44, 0.50, min(gFract.x, gFract.y));
    col += vec3(0.00, 0.48, 0.68) * grid * 0.055 * uCityPhase;

    // Exponential fog
    float fd  = max(0.0, -vWorldPos.z + 8.0);
    float fog = 1.0 - exp(-fd * uFog);
    col = mix(col, uFogColor, fog);
    col *= smoothstep(0.0, 0.04, vUv.y);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── Tower data ────────────────────────────────────────────────────────────────
interface TowerData {
  group   : THREE.Group;
  bodyMat : THREE.MeshStandardMaterial;
  neonMats: { mat: THREE.MeshStandardMaterial; baseEI: number }[];
  tier    : number;
}

// ═════════════════════════════════════════════════════════════════════════════
export class CityScene {
  private renderer   : THREE.WebGLRenderer;
  private scene      : THREE.Scene;
  private camera     : THREE.PerspectiveCamera;
  private composer   : EffectComposer | null = null;
  private bloomPass  : UnrealBloomPass | null = null;

  private terrainMat !: THREE.ShaderMaterial;
  private stars      !: THREE.Points;
  private cloudSprites: { sprite: THREE.Sprite; baseOp: number; drift: number }[] = [];

  private towers    : TowerData[] = [];
  private connLines : THREE.Line[] = [];
  private connMats  : THREE.LineDashedMaterial[] = [];

  private sensorPoints!: THREE.Points;
  private sensorMat   !: THREE.PointsMaterial;
  private trafficPoints!: THREE.Points;
  private trafficMat  !: THREE.PointsMaterial;
  private trafficPos  !: Float32Array;
  private trafficCars : { curve: THREE.CatmullRomCurve3; t: number; speed: number }[] = [];

  private heatmapMat !: THREE.MeshBasicMaterial;
  private pulseRings  : { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  private glowSprites : THREE.Sprite[] = [];

  private ambient    !: THREE.AmbientLight;
  private cyanLight  !: THREE.PointLight;
  private violetLight!: THREE.PointLight;
  private amberLight !: THREE.PointLight;

  private baseCamPos = new THREE.Vector3(0, 130, 35);
  private baseLookAt = new THREE.Vector3(0, 22, -18);

  private progress = 0;
  private raf      = 0;
  private alive    = true;
  private elapsed  = 0;
  private lastTime = performance.now() / 1000;

  // ── Constructor ─────────────────────────────────────────────────────────────
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setClearColor(FOG_CLOUD, 1);
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene            = new THREE.Scene();
    this.scene.background = FOG_CLOUD.clone();
    this.scene.fog        = new THREE.FogExp2(FOG_CLOUD.getHex(), 0.016);

    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.8, 800);
    this.camera.position.copy(this.baseCamPos);
    this.camera.lookAt(this.baseLookAt);

    this.buildTerrain();
    this.buildStars();
    this.buildClouds();
    this.buildCityTowers();
    this.buildConnections();
    this.buildSensors();
    this.buildTrafficPaths();
    this.buildHeatmap();
    this.buildPulseRings();
    this.buildGlowSprites();
    this.buildCityLights();
    this.initBloom();

    window.addEventListener('resize', this.onResize);
  }

  // ── Terrain ─────────────────────────────────────────────────────────────────
  private buildTerrain() {
    const geo = new THREE.PlaneGeometry(360, 240, 120, 80);
    this.terrainMat = new THREE.ShaderMaterial({
      vertexShader  : TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        uTime      : { value: 0 },
        uCamPos    : { value: new THREE.Vector3() },
        uCyanPos   : { value: new THREE.Vector3(  0, 38, -20) },
        uVioletPos : { value: new THREE.Vector3( -8, 28, -15) },
        uAmberPos  : { value: new THREE.Vector3( 12, 14, -25) },
        uCyanI     : { value: 0 },
        uVioletI   : { value: 0 },
        uAmberI    : { value: 0 },
        uFog       : { value: 0.016 },
        uFogColor  : { value: new THREE.Vector3(FOG_CLOUD.r, FOG_CLOUD.g, FOG_CLOUD.b) },
        uCityPhase : { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -1, -20);
    this.scene.add(mesh);
  }

  // ── Stars ────────────────────────────────────────────────────────────────────
  private buildStars() {
    const N = 1400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(1 - Math.random());
      const r  = 220 + Math.random() * 100;
      pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
      pos[i*3+1] = r * Math.cos(ph) + 12;
      pos[i*3+2] = r * Math.sin(ph) * Math.sin(th) - 20;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xbbd4ff, size: 0.28, sizeAttenuation: true,
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.scene.add(this.stars);
  }

  // ── Cloud field ──────────────────────────────────────────────────────────────
  private buildClouds() {
    const sz = 256;
    const cv = Object.assign(document.createElement('canvas'), { width: sz, height: sz });
    const cx = cv.getContext('2d')!;
    [[0.50,0.52,0.44],[0.28,0.44,0.30],[0.72,0.46,0.28],
     [0.50,0.30,0.24],[0.18,0.62,0.20],[0.80,0.62,0.18],
     [0.35,0.70,0.16],[0.65,0.28,0.18]].forEach(([x,y,r]) => {
      const g = cx.createRadialGradient(x*sz, y*sz, 0, x*sz, y*sz, r*sz);
      g.addColorStop(0,    'rgba(255,255,255,0.50)');
      g.addColorStop(0.42, 'rgba(235,245,255,0.18)');
      g.addColorStop(1,    'rgba(0,0,0,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, sz, sz);
    });
    const tex = new THREE.CanvasTexture(cv);
    const rng = mulberry32(17);

    for (let i = 0; i < 80; i++) {
      const angle  = (i / 80) * Math.PI * 2 + rng() * 0.9;
      const radius = 14 + rng() * 130;
      const yBase  = 42 + rng() * 38;
      const scale  = 48 + rng() * 90;
      const baseOp = 0.18 + rng() * 0.52;
      const bright = 0.80 + rng() * 0.20;

      const mat = new THREE.SpriteMaterial({
        map  : tex,
        color: new THREE.Color(bright, bright + 0.03, bright + 0.07),
        transparent: true, opacity: baseOp, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(Math.cos(angle) * radius, yBase, -10 + Math.sin(angle) * radius);
      sprite.scale.set(scale, scale * 0.36, 1);
      this.scene.add(sprite);
      this.cloudSprites.push({ sprite, baseOp, drift: rng() * Math.PI * 2 });
    }
  }

  // ── Tower factory ────────────────────────────────────────────────────────────
  private makeTower(
    lx: number, lz: number, w: number, d: number, h: number, tier: number,
  ): TowerData {
    const group = new THREE.Group();
    group.position.set(CITY_CENTER.x + lx, -1, CITY_CENTER.z + lz);

    const neonHex = TIER_HEX[tier];
    const neonCol = new THREE.Color(neonHex);
    const neonMats: TowerData['neonMats'] = [];

    const mkNeonMat = (baseEI: number) => {
      const mat = new THREE.MeshStandardMaterial({
        color            : neonHex,
        emissive         : neonCol.clone(),
        emissiveIntensity: baseEI,
        roughness        : 0.30,
        metalness        : 0.55,
      });
      neonMats.push({ mat, baseEI });
      return mat;
    };

    // ── Body ────────────────────────────────────────────────────────────────
    const bodyMat = new THREE.MeshStandardMaterial({
      color            : 0x07090F,
      metalness        : 0.92,
      roughness        : 0.16,
      emissive         : new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
    body.position.y = h / 2;
    group.add(body);

    // ── 4 vertical neon corner strips ────────────────────────────────────────
    const sw = 0.055, sd = 0.055;
    const corners: [number, number][] = [
      [ w/2 - sw/2,  d/2 - sd/2],
      [-w/2 + sw/2,  d/2 - sd/2],
      [ w/2 - sw/2, -d/2 + sd/2],
      [-w/2 + sw/2, -d/2 + sd/2],
    ];
    corners.forEach(([cx, cz]) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sw, h + 0.06, sd), mkNeonMat(3.0));
      strip.position.set(cx, h / 2, cz);
      group.add(strip);
    });

    // ── Horizontal accent rings at 1/4, 1/2, 3/4 height ─────────────────────
    [0.25, 0.50, 0.75].forEach(frac => {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.065, d + 0.14), mkNeonMat(1.8));
      ring.position.y = frac * h;
      group.add(ring);
    });

    // ── Spire on core towers (tier 0) ────────────────────────────────────────
    if (tier === 0) {
      const sh    = h * 0.32;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.07, sh, 5), mkNeonMat(4.0));
      spire.position.y = h + sh / 2;
      group.add(spire);
    }

    this.scene.add(group);
    return { group, bodyMat, neonMats, tier };
  }

  // ── City towers ──────────────────────────────────────────────────────────────
  private buildCityTowers() {
    TOWERS.forEach(([lx, lz, w, d, h, tier]) => {
      this.towers.push(this.makeTower(lx, lz, w, d, h, tier));
    });
  }

  // ── Data connections ─────────────────────────────────────────────────────────
  private buildConnections() {
    const tops = TOWERS.map(([lx, lz,,, h]) =>
      new THREE.Vector3(CITY_CENTER.x + lx, h - 1, CITY_CENTER.z + lz));

    CONNS.forEach(([ai, bi], idx) => {
      const mid = tops[ai].clone().lerp(tops[bi], 0.5);
      mid.y += 1.5;
      const curve = new THREE.QuadraticBezierCurve3(tops[ai].clone(), mid, tops[bi].clone());
      const geo   = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
      const mat   = new THREE.LineDashedMaterial({
        color    : idx % 3 === 0 ? 0x00eeff : idx % 3 === 1 ? 0x9933ff : 0xff7722,
        dashSize : 2.0, gapSize: 2.4,
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.scene.add(line);
      this.connLines.push(line);
      this.connMats.push(mat);
    });
  }

  // ── Sensor nodes ─────────────────────────────────────────────────────────────
  private buildSensors() {
    const N = TOWERS.length;
    const pos = new Float32Array(N * 3);
    TOWERS.forEach(([lx, lz,,, h], i) => {
      pos[i*3]   = CITY_CENTER.x + lx;
      pos[i*3+1] = h - 1 + 0.8;
      pos[i*3+2] = CITY_CENTER.z + lz;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sensorMat = new THREE.PointsMaterial({
      color: 0x00eeff, size: 0.30, sizeAttenuation: true,
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.sensorPoints = new THREE.Points(geo, this.sensorMat);
    this.scene.add(this.sensorPoints);
  }

  // ── Traffic paths ─────────────────────────────────────────────────────────────
  private buildTrafficPaths() {
    const paths = [
      [[-30,-0.9,-20],[-15,-0.9,-18],[0,-0.9,-20],[15,-0.9,-21],[30,-0.9,-20]],
      [[0,-0.9,-8],[4,-0.9,-14],[0,-0.9,-20],[-4,-0.9,-26],[0,-0.9,-32]],
      [[-22,-0.9,-12],[-11,-0.9,-16],[0,-0.9,-20],[11,-0.9,-24],[22,-0.9,-28]],
      [[-20,-0.9,-28],[-10,-0.9,-24],[0,-0.9,-20],[10,-0.9,-16],[20,-0.9,-12]],
      [[22,-0.9,-12],[20,-0.9,-20],[22,-0.9,-28],[18,-0.9,-32]],
      [[-22,-0.9,-28],[-20,-0.9,-20],[-22,-0.9,-12],[-18,-0.9,-9]],
    ];
    paths.forEach(raw => {
      const curve = new THREE.CatmullRomCurve3(raw.map(p => new THREE.Vector3(p[0], p[1], p[2])));
      for (let c = 0; c < 3; c++)
        this.trafficCars.push({ curve, t: c / 3, speed: 0.040 + Math.random() * 0.025 });
    });
    const N = this.trafficCars.length;
    this.trafficPos = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trafficPos, 3));
    this.trafficMat = new THREE.PointsMaterial({
      color: 0xff9944, size: 0.20, sizeAttenuation: true,
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.trafficPoints = new THREE.Points(geo, this.trafficMat);
    this.scene.add(this.trafficPoints);
  }

  // ── Heatmap ───────────────────────────────────────────────────────────────────
  private buildHeatmap() {
    const sz = 256;
    const cv = Object.assign(document.createElement('canvas'), { width: sz, height: sz });
    const cx = cv.getContext('2d')!;
    [{x:0.50,y:0.50,r:0.30,c:'#ff3300'},{x:0.28,y:0.34,r:0.20,c:'#ff6600'},
     {x:0.72,y:0.66,r:0.18,c:'#ffaa00'},{x:0.62,y:0.28,r:0.16,c:'#ff8800'},
     {x:0.24,y:0.72,r:0.14,c:'#ff4400'}].forEach(({ x,y,r,c }) => {
      const g = cx.createRadialGradient(x*sz, y*sz, 0, x*sz, y*sz, r*sz);
      g.addColorStop(0, c + 'bb'); g.addColorStop(1, c + '00');
      cx.fillStyle = g; cx.fillRect(0, 0, sz, sz);
    });
    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.1, -20);
    this.scene.add(mesh);
    this.heatmapMat = mat;
  }

  // ── Pulse rings ───────────────────────────────────────────────────────────────
  private buildPulseRings() {
    [new THREE.Vector3(0,-0.7,-20), new THREE.Vector3(10,-0.7,-15),
     new THREE.Vector3(-10,-0.7,-25), new THREE.Vector3(15,-0.7,-22)].forEach((pos, i) => {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff2222, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 2.0, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos);
      this.scene.add(ring);
      this.pulseRings.push({ mesh: ring, mat, phase: (i / 4) * Math.PI * 2 });
    });
  }

  // ── Glow sprites ──────────────────────────────────────────────────────────────
  private buildGlowSprites() {
    const sz = 128;
    const cv = Object.assign(document.createElement('canvas'), { width: sz, height: sz });
    const cx = cv.getContext('2d')!;
    const g  = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0,    'rgba(255,255,255,0.65)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.16)');
    g.addColorStop(1,    'rgba(255,255,255,0.00)');
    cx.fillStyle = g; cx.fillRect(0, 0, sz, sz);
    const tex = new THREE.CanvasTexture(cv);

    [{ pos: new THREE.Vector3( 0,22,-20), color: 0x001428, size: 55 },
     { pos: new THREE.Vector3(10,14,-15), color: 0x1a0040, size: 40 },
     { pos: new THREE.Vector3(-10,16,-25), color: 0x281800, size: 42 }].forEach(({ pos,color,size }) => {
      const mat = new THREE.SpriteMaterial({
        map: tex, color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos); s.scale.set(size, size, 1);
      this.scene.add(s);
      this.glowSprites.push(s);
    });
  }

  // ── City lights ───────────────────────────────────────────────────────────────
  private buildCityLights() {
    this.ambient = new THREE.AmbientLight(0xD0E8FF, 1.40);
    this.scene.add(this.ambient);

    this.cyanLight   = new THREE.PointLight(0x00eeff, 0, 90);
    this.cyanLight.position.set(0, 38, -20);
    this.scene.add(this.cyanLight);

    this.violetLight = new THREE.PointLight(0x8844ff, 0, 70);
    this.violetLight.position.set(-8, 28, -15);
    this.scene.add(this.violetLight);

    this.amberLight  = new THREE.PointLight(0xff7722, 0, 80);
    this.amberLight.position.set(12, 14, -25);
    this.scene.add(this.amberLight);
  }

  // ── Bloom ─────────────────────────────────────────────────────────────────────
  private initBloom() {
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        0,      // strength (starts at 0, ramped in updateScene)
        0.70,   // radius
        0.90,   // threshold (starts high, ramps down)
      );
      this.composer.addPass(this.bloomPass);
    } catch {
      this.composer = null;
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────────
  start() { this.tick(); }

  private tick = () => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.tick);

    const now   = performance.now() / 1000;
    const delta = Math.min(now - this.lastTime, 0.05);
    this.lastTime = now;
    this.elapsed  = now;

    const p = this.progress;

    // ── Terrain time ────────────────────────────────────────────────────────
    this.terrainMat.uniforms.uTime.value    = this.elapsed;
    this.terrainMat.uniforms.uCamPos.value.copy(this.camera.position);
    this.terrainMat.uniforms.uCyanI.value   = this.cyanLight.intensity;
    this.terrainMat.uniforms.uVioletI.value = this.violetLight.intensity;
    this.terrainMat.uniforms.uAmberI.value  = this.amberLight.intensity;

    // ── Stars slow drift ────────────────────────────────────────────────────
    this.stars.rotation.y = this.elapsed * 0.0004;

    // ── Cloud drift ─────────────────────────────────────────────────────────
    this.cloudSprites.forEach(({ sprite, drift }) => {
      sprite.position.x += Math.sin(this.elapsed * 0.018 + drift) * 0.008;
    });

    // ── Building emissive flicker (city reveal, before story mode) ──────────
    if (p > 0.44 && p < 0.60) {
      const revealMult = ss(0.44, 0.60, p);
      this.towers.forEach(({ bodyMat }, i) => {
        bodyMat.emissiveIntensity =
          revealMult * 0.18 * (0.55 + 0.45 * Math.sin(this.elapsed * (1.1 + (i % 7) * 0.25) + i));
      });
    }

    // ── S4 story mode — runs every frame so pulsing is smooth ───────────────
    if (p >= 0.60 && p <= 0.85) {
      const s4t  = clamp((p - 0.60) / 0.25, 0, 1);
      const mode = Math.min(Math.floor(s4t * 4), 3);
      const neonMult = ss(0.46, 0.64, p);
      this.applyStoryMode(mode, neonMult);
    }

    // ── Dashed connection flow ──────────────────────────────────────────────
    if (p > 0.62) this.connMats.forEach(m => { m.dashOffset -= 0.06 * delta; });

    // ── Traffic ─────────────────────────────────────────────────────────────
    if (p > 0.70) {
      this.trafficCars.forEach((car, i) => {
        car.t = (car.t + car.speed * delta) % 1.0;
        const pt = car.curve.getPoint(car.t);
        this.trafficPos[i*3] = pt.x; this.trafficPos[i*3+1] = pt.y; this.trafficPos[i*3+2] = pt.z;
      });
      (this.trafficPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── Sensor pulse ────────────────────────────────────────────────────────
    if (p > 0.64)
      this.sensorMat.opacity = ss(0.64, 0.76, p) * (0.44 + 0.44 * Math.sin(this.elapsed * 3.0));

    // ── Pulse rings expand ──────────────────────────────────────────────────
    if (p > 0.80) {
      this.pulseRings.forEach(({ mesh, mat, phase }) => {
        const cyc = (this.elapsed * 0.50 + phase) % 1.0;
        mesh.scale.set(1 + cyc * 6, 1 + cyc * 6, 1);
        mat.opacity = (1 - cyc) * ss(0.80, 0.86, p) * 0.60;
      });
    }

    // ── Cinematic camera drift ──────────────────────────────────────────────
    const drift = new THREE.Vector3(
      Math.sin(this.elapsed * 0.017) * 0.55,
      Math.sin(this.elapsed * 0.013) * 0.14,
      Math.sin(this.elapsed * 0.015) * 0.22,
    );
    this.camera.position.copy(this.baseCamPos).add(drift);
    this.camera.lookAt(
      this.baseLookAt.x + Math.sin(this.elapsed * 0.013) * 0.35,
      this.baseLookAt.y,
      this.baseLookAt.z,
    );

    if (this.composer) this.composer.render();
    else               this.renderer.render(this.scene, this.camera);
  };

  // ── updateScene — called by GSAP ScrollTrigger ────────────────────────────
  updateScene(t: number) {
    this.progress = clamp(t, 0, 1);
    const p = this.progress;

    // ── Fog + background ────────────────────────────────────────────────────
    const fogColor = new THREE.Color();
    let   fogDensity: number;

    if (p < 0.42) {
      fogDensity = lerp(0.014, 0.080, ss(0.0, 0.42, p));
      fogColor.copy(FOG_CLOUD);
    } else if (p < 0.54) {
      const u = ss(0.42, 0.54, p);
      fogDensity = lerp(0.080, 0.006, u);
      fogColor.lerpColors(FOG_CLOUD, FOG_CITY, u);
    } else {
      fogDensity = lerp(0.006, 0.003, ss(0.54, 1.0, p));
      fogColor.copy(FOG_CITY);
    }

    (this.scene.fog as THREE.FogExp2).density = fogDensity;
    (this.scene.fog as THREE.FogExp2).color.copy(fogColor);
    (this.scene.background as THREE.Color).copy(fogColor);

    // Sync terrain fog + city phase
    this.terrainMat.uniforms.uFog.value = fogDensity;
    this.terrainMat.uniforms.uFogColor.value.set(fogColor.r, fogColor.g, fogColor.b);
    this.terrainMat.uniforms.uCityPhase.value = ss(0.46, 0.68, p);

    // ── Cloud sprites ───────────────────────────────────────────────────────
    const cloudOp = 1.0 - ss(0.26, 0.56, p);
    this.cloudSprites.forEach(({ sprite, baseOp }) => {
      (sprite.material as THREE.SpriteMaterial).opacity = baseOp * cloudOp;
    });

    // ── Camera keyframe interpolation ───────────────────────────────────────
    let i = 0;
    while (i < CAM_KF.length - 2 && CAM_KF[i + 1].t <= p) i++;
    const k0 = CAM_KF[i], k1 = CAM_KF[i + 1];
    const u  = clamp((p - k0.t) / (k1.t - k0.t), 0, 1);
    const eu = u < 0.5 ? 2 * u * u : -1 + (4 - 2 * u) * u;
    this.baseCamPos.set(
      lerp(k0.px, k1.px, eu), lerp(k0.py, k1.py, eu), lerp(k0.pz, k1.pz, eu),
    );
    this.baseLookAt.set(
      lerp(k0.tx, k1.tx, eu), lerp(k0.ty, k1.ty, eu), lerp(k0.tz, k1.tz, eu),
    );

    // ── Ambient light ───────────────────────────────────────────────────────
    if (p < 0.44) {
      this.ambient.intensity = lerp(1.40, 1.00, ss(0.26, 0.44, p));
      this.ambient.color.set(0xD0E8FF);
    } else if (p < 0.56) {
      const u2 = ss(0.44, 0.56, p);
      this.ambient.intensity = lerp(1.00, 0.30, u2);
      this.ambient.color.lerpColors(new THREE.Color(0xD0E8FF), new THREE.Color(0x050a12), u2);
    } else {
      this.ambient.intensity = lerp(0.30, 1.10, ss(0.56, 1.0, p));
      this.ambient.color.set(0x050a12);
    }

    // ── City lights fire with fog break ─────────────────────────────────────
    this.cyanLight.intensity   = lerp(0, 8, ss(0.43, 0.68, p));
    this.violetLight.intensity = lerp(0, 5, ss(0.48, 0.74, p));
    this.amberLight.intensity  = lerp(0, 4, ss(0.54, 0.82, p));

    // ── Stars ───────────────────────────────────────────────────────────────
    (this.stars.material as THREE.PointsMaterial).opacity = ss(0.48, 0.64, p) * 0.60;

    // ── Neon tower glow fade-in ─────────────────────────────────────────────
    const neonMult = ss(0.46, 0.66, p);
    this.towers.forEach(({ neonMats }) => {
      neonMats.forEach(({ mat, baseEI }) => {
        mat.emissiveIntensity = baseEI * neonMult;
      });
    });

    // ── Data connections ────────────────────────────────────────────────────
    this.connMats.forEach((m, idx) => {
      m.opacity = ss(0.65 + idx * 0.010, 0.84 + idx * 0.006, p) * 0.85;
    });

    // ── Traffic ─────────────────────────────────────────────────────────────
    this.trafficMat.opacity = ss(0.70, 0.84, p) * 0.92;

    // ── Glow sprites ────────────────────────────────────────────────────────
    const glowOp = ss(0.66, 0.86, p) * 0.20;
    this.glowSprites.forEach(s => {
      (s.material as THREE.SpriteMaterial).opacity = glowOp;
    });

    // ── Heatmap (climate mode ≈ 0.67 – 0.74) ───────────────────────────────
    this.heatmapMat.opacity = ss(0.67, 0.70, p) * (1 - ss(0.72, 0.76, p)) * 0.55;

    // ── Bloom ───────────────────────────────────────────────────────────────
    if (this.bloomPass) {
      this.bloomPass.strength  = lerp(0.0, 1.20, ss(0.46, 0.72, p));
      this.bloomPass.threshold = lerp(0.90, 0.42, ss(0.46, 0.85, p));
      this.bloomPass.radius    = 0.70;
    }
  }

  // ── Story mode colours ────────────────────────────────────────────────────
  private applyStoryMode(mode: number, neonMult: number) {
    this.towers.forEach(({ bodyMat, neonMats, tier }, i) => {
      switch (mode) {

        case 0: // Urban Infrastructure — electric blue-white
          bodyMat.emissive.set(0x0033bb);
          bodyMat.emissiveIntensity =
            0.32 + 0.20 * Math.sin(this.elapsed * (0.9 + (i % 6) * 0.18) + i * 0.9);
          neonMats.forEach(({ mat, baseEI }) => {
            mat.emissiveIntensity = baseEI * neonMult * (1.0 + 0.35 * Math.sin(this.elapsed * 1.2 + i));
          });
          break;

        case 1: // Climate Monitoring — warm thermal
          bodyMat.emissive.setHSL(0.07 - tier * 0.01, 0.95, 0.18);
          bodyMat.emissiveIntensity = 0.38 + 0.18 * Math.sin(this.elapsed * 1.4 + i * 0.7);
          neonMats.forEach(({ mat, baseEI }) => {
            mat.emissiveIntensity = baseEI * neonMult * 0.6;
          });
          break;

        case 2: // Traffic Intelligence — dark city, amber streets
          bodyMat.emissive.set(0x000306);
          bodyMat.emissiveIntensity = 0.04;
          neonMats.forEach(({ mat, baseEI }) => {
            mat.emissiveIntensity = baseEI * neonMult * 0.4;
          });
          break;

        case 3: // Emergency Systems — outer ring pulses red
          if (tier === 2) {
            bodyMat.emissive.set(0xFF1111);
            bodyMat.emissiveIntensity =
              0.38 + 0.38 * Math.abs(Math.sin(this.elapsed * 2.5 + i * 0.6));
            neonMats.forEach(({ mat }) => {
              mat.emissive.set(0xFF3300);
              mat.emissiveIntensity = 3.0 * Math.abs(Math.sin(this.elapsed * 2.5 + i * 0.6));
            });
          } else {
            bodyMat.emissive.set(0x000306);
            bodyMat.emissiveIntensity = 0.04;
            neonMats.forEach(({ mat, baseEI }) => {
              mat.emissiveIntensity = baseEI * neonMult * 0.25;
            });
          }
          break;
      }
    });
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  private onResize = () => {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  };

  // ── Cleanup ───────────────────────────────────────────────────────────────
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
