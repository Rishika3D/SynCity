uniform float uTime;
uniform float uMorph;       // 0 = cloud, 1 = city
uniform float uSize;
uniform vec3  uColor;

attribute vec3 aPositionCloud;
attribute vec3 aPositionCity;

varying float vDepth;
varying float vLife;

// Simplex-like hash noise
vec3 hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float snoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  return mix(
    mix(mix(fract(sin(n)              * 43758.5453),
            fract(sin(n +  1.0)      * 43758.5453), f.x),
        mix(fract(sin(n + 57.0)      * 43758.5453),
            fract(sin(n + 58.0)      * 43758.5453), f.x), f.y),
    mix(mix(fract(sin(n + 113.0)     * 43758.5453),
            fract(sin(n + 114.0)     * 43758.5453), f.x),
        mix(fract(sin(n + 170.0)     * 43758.5453),
            fract(sin(n + 171.0)     * 43758.5453), f.x), f.y),
    f.z);
}

void main() {
  // Noise-driven drift for cloud particles
  float t = uTime * 0.18;
  vec3 drift = vec3(
    snoise(aPositionCloud * 0.4 + vec3(t, 0.0, 0.0)),
    snoise(aPositionCloud * 0.4 + vec3(0.0, t, 0.0)),
    snoise(aPositionCloud * 0.4 + vec3(0.0, 0.0, t))
  ) * 0.8;

  // Ease-in-out morph
  float m = uMorph * uMorph * (3.0 - 2.0 * uMorph);
  vec3 pos = mix(aPositionCloud + drift * (1.0 - m), aPositionCity, m);

  // Depth fade
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  vDepth = 1.0 - clamp(-mvPos.z / 30.0, 0.0, 1.0);

  // Flicker life
  vLife = snoise(aPositionCloud + vec3(uTime * 0.4));

  // Dynamic size
  float sz = uSize * (1.0 + vLife * 0.5) * vDepth;
  gl_PointSize = sz * (300.0 / -mvPos.z);
  gl_Position  = projectionMatrix * mvPos;
}
