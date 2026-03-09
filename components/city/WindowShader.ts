/**
 * components/city/WindowShader.ts
 *
 * GLSL vertex + fragment shaders for the building window lighting system.
 * Day/Night adaptive via uDayFactor uniform:
 *
 *   Night (uDayFactor=0): dark walls, bright lit windows, neon accents, heavy bloom
 *   Day   (uDayFactor=1): light concrete walls, few windows lit, natural lighting
 *
 * Features:
 *   - Column grid: 4 bays per face (UV-based)
 *   - Row grid: automatic floor counting via world-space Y / floorHeight
 *   - Per-window hash: deterministic lit/unlit with slow organic flicker
 *   - Horizontal spandrel bands between floors
 *   - Fake ambient occlusion at building base
 *   - Wetness uniform for rain weather effect (Phase 4)
 *   - Emissive output well above 1.0 to trigger Bloom post-processing
 *
 * CRITICAL: Do NOT manually declare `attribute mat4 instanceMatrix`.
 * Three.js auto-injects this for InstancedMesh.
 */

import * as THREE from 'three';

// ─── Vertex Shader ────────────────────────────────────────────────────────────

export const WINDOW_VERT = /* glsl */ `
  // Three.js auto-provides: instanceMatrix, projectionMatrix, modelViewMatrix
  // instanceColor attribute is auto-declared when mesh.instanceColor is set

  varying vec2  vUv;
  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
  varying float vWorldY;
  varying vec3  vInstanceColor;

  void main() {
    // Pass instance colour to fragment shader
    #ifdef USE_INSTANCING_COLOR
      vInstanceColor = instanceColor;
    #else
      vInstanceColor = vec3(1.0);
    #endif

    // Apply instance transform
    vec4 worldPos4 = instanceMatrix * vec4(position, 1.0);
    vWorldPos   = worldPos4.xyz;
    vWorldY     = worldPos4.y;
    vUv         = uv;

    // Transform normal by instance rotation (ignore scale for now)
    mat3 normalMat = mat3(instanceMatrix);
    vWorldNormal = normalize(normalMat * normal);

    gl_Position = projectionMatrix * modelViewMatrix * worldPos4;
  }
`;

// ─── Fragment Shader ──────────────────────────────────────────────────────────

export const WINDOW_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFloorHeight;
  uniform float uWindowLitRatio;
  uniform float uEmissiveBoost;
  uniform vec3  uWallColor;
  uniform vec3  uWindowColor;
  uniform vec3  uAccentColor;
  uniform float uAoHeight;
  uniform float uWetness;
  uniform float uDayFactor;        // 0 = night, 1 = day

  // Day-mode palette
  uniform vec3  uWallColorDay;
  uniform vec3  uWindowColorDay;
  uniform vec3  uAccentColorDay;

  varying vec2  vUv;
  varying vec3  vWorldPos;
  varying vec3  vWorldNormal;
  varying float vWorldY;
  varying vec3  vInstanceColor;

  // ── Deterministic hash functions ────────────────────────────────────────────

  float hash21(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
  }

  float hash11(float p) {
    return fract(sin(p * 127.1) * 43758.5453);
  }

  void main() {
    // ── Interpolate palettes ─────────────────────────────────────────────
    vec3 wallCol    = mix(uWallColor,   uWallColorDay,   uDayFactor);
    vec3 windowCol  = mix(uWindowColor, uWindowColorDay, uDayFactor);
    vec3 accentCol  = mix(uAccentColor, uAccentColorDay, uDayFactor);

    // ── Detect face orientation ─────────────────────────────────────────
    vec3 n = normalize(vWorldNormal);
    float isRoof   = step(0.8, n.y);
    float isBottom = step(0.8, -n.y);
    float isSide   = 1.0 - isRoof - isBottom;

    // ── Floor & column grid ─────────────────────────────────────────────
    float floorIdx  = floor(vWorldY / uFloorHeight);
    float floorFrac = fract(vWorldY / uFloorHeight);

    float colCount = 4.0;
    float colFrac  = fract(vUv.x * colCount);
    float colIdx   = floor(vUv.x * colCount);

    // Window region
    float windowH = smoothstep(0.12, 0.18, floorFrac) * (1.0 - smoothstep(0.78, 0.84, floorFrac));
    float windowW = smoothstep(0.10, 0.16, colFrac) * (1.0 - smoothstep(0.80, 0.86, colFrac));
    float windowMask = windowH * windowW * isSide;

    // ── Per-window lit/unlit hash ───────────────────────────────────────
    float windowHash = hash21(vec2(colIdx * 73.1 + floorIdx * 137.3, floorIdx * 311.7 + colIdx * 43.3));

    // Slow organic flicker
    float flicker = 0.5 + 0.5 * sin(uTime * 0.15 + windowHash * 6.28318);
    float flickerMask = smoothstep(0.3, 0.5, flicker);

    // Window lit ratio: fewer windows lit during day
    float effectiveLitRatio = mix(uWindowLitRatio, uWindowLitRatio * 0.18, uDayFactor);
    float isLit = step(windowHash, effectiveLitRatio) * flickerMask;

    // ── Spandrel bands ──────────────────────────────────────────────────
    float spandrelMask = smoothstep(0.84, 0.88, floorFrac) + (1.0 - smoothstep(0.10, 0.14, floorFrac));
    float spandrelStr  = mix(0.15, 0.06, uDayFactor);
    spandrelMask *= isSide * spandrelStr;

    // ── Vertical corner accents ─────────────────────────────────────────
    float edgeDist = min(vUv.x, 1.0 - vUv.x);
    float cornerStr = mix(0.12, 0.04, uDayFactor);
    float cornerAccent = (1.0 - smoothstep(0.0, 0.04, edgeDist)) * isSide * cornerStr;

    // ── Fake ambient occlusion at base ──────────────────────────────────
    float aoStr = mix(0.65, 0.35, uDayFactor);
    float ao = 1.0 - (1.0 - smoothstep(0.0, uAoHeight, vWorldY)) * aoStr;

    // ── Roof treatment ──────────────────────────────────────────────────
    float roofGrid = 0.0;
    if (isRoof > 0.5) {
      float rgx = fract(vWorldPos.x * 0.5);
      float rgz = fract(vWorldPos.z * 0.5);
      roofGrid = (step(0.95, rgx) + step(0.95, rgz)) * 0.08;
    }

    // ── Directional shading ─────────────────────────────────────────────
    vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
    float NdotL = max(dot(n, lightDir), 0.0);
    // Day: stronger directional shading. Night: more ambient
    float ambientStr = mix(0.3, 0.45, uDayFactor);
    float diffuseStr = mix(0.7, 0.55, uDayFactor);
    float diffuse = ambientStr + diffuseStr * NdotL;

    // ── Compose final colour ────────────────────────────────────────────
    vec3 baseCol = wallCol * vInstanceColor.rgb;
    vec3 col = baseCol * diffuse * ao;

    // Emissive boost: strong at night, subtle during day
    float effectiveBoost = mix(uEmissiveBoost, 0.8, uDayFactor);
    vec3 windowEmissive = windowCol * isLit * windowMask * effectiveBoost;
    col += windowEmissive;

    // Accents
    col += accentCol * spandrelMask * ao;
    col += accentCol * cornerAccent * ao;

    // Roof grid
    vec3 roofGridCol = mix(vec3(0.05, 0.12, 0.15), vec3(0.15, 0.18, 0.20), uDayFactor);
    col += roofGridCol * roofGrid;

    // ── Wetness effect (Phase 4) ────────────────────────────────────────
    float wetDarken = 1.0 - uWetness * 0.25;
    float wetSpecular = uWetness * pow(max(dot(reflect(-lightDir, n), normalize(vec3(0.0, 1.0, -1.0))), 0.0), 16.0) * 0.5;
    col *= wetDarken;
    col += vec3(wetSpecular);

    // Bottom face — pure dark
    col = mix(col, vec3(0.01, 0.01, 0.02), isBottom);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Material factory ─────────────────────────────────────────────────────────

export interface WindowShaderUniforms {
  uTime:           { value: number };
  uFloorHeight:    { value: number };
  uWindowLitRatio: { value: number };
  uEmissiveBoost:  { value: number };
  uWallColor:      { value: THREE.Color };
  uWindowColor:    { value: THREE.Color };
  uAccentColor:    { value: THREE.Color };
  uAoHeight:       { value: number };
  uWetness:        { value: number };
  uDayFactor:      { value: number };
  uWallColorDay:   { value: THREE.Color };
  uWindowColorDay: { value: THREE.Color };
  uAccentColorDay: { value: THREE.Color };
}

/**
 * Create a ShaderMaterial for building shafts with the window lighting system.
 * Supports instanceColor for per-building tinting.
 * Includes day/night interpolation via uDayFactor uniform.
 */
export function createWindowMaterial(overrides?: Partial<{
  wallColor:      string;
  windowColor:    string;
  accentColor:    string;
  floorHeight:    number;
  windowLitRatio: number;
  emissiveBoost:  number;
  aoHeight:       number;
  wallColorDay:   string;
  windowColorDay: string;
  accentColorDay: string;
}>): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader:   WINDOW_VERT,
    fragmentShader: WINDOW_FRAG,
    uniforms: {
      uTime:           { value: 0 },
      uFloorHeight:    { value: overrides?.floorHeight    ?? 1.8 },
      uWindowLitRatio: { value: overrides?.windowLitRatio ?? 0.72 },
      uEmissiveBoost:  { value: overrides?.emissiveBoost  ?? 5.5 },
      uWallColor:      { value: new THREE.Color(overrides?.wallColor   ?? '#0a0a14') },
      uWindowColor:    { value: new THREE.Color(overrides?.windowColor ?? '#e8dcc8') },
      uAccentColor:    { value: new THREE.Color(overrides?.accentColor ?? '#00f3ff') },
      uAoHeight:       { value: overrides?.aoHeight       ?? 5.0 },
      uWetness:        { value: 0 },
      uDayFactor:      { value: 0 },
      // Day palette
      uWallColorDay:   { value: new THREE.Color(overrides?.wallColorDay   ?? '#7a7e88') },
      uWindowColorDay: { value: new THREE.Color(overrides?.windowColorDay ?? '#ffffff') },
      uAccentColorDay: { value: new THREE.Color(overrides?.accentColorDay ?? '#8899aa') },
    } as WindowShaderUniforms,
    side:        THREE.FrontSide,
    depthWrite:  true,
    transparent: false,
  });

  return mat;
}
