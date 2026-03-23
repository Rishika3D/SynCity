varying vec2  vUv;
varying float vElevation;

uniform float uTime;
uniform float uOpacity;
uniform vec3  uColorA;  // cool (calm/low)
uniform vec3  uColorB;  // hot  (chaos/high)

void main() {
  // Animated UV distortion
  vec2 uv = vUv;
  uv.x += sin(uv.y * 8.0 + uTime * 0.6) * 0.012;
  uv.y += cos(uv.x * 8.0 + uTime * 0.5) * 0.012;

  float t = clamp((vElevation + 0.5) + sin(uv.x * 6.0 + uTime) * 0.18, 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, t);

  // Pulse rings
  float ring = fract((length(uv - 0.5) * 6.0) - uTime * 0.5);
  col += uColorB * ring * ring * 0.14;

  float edgeFade = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x)
                 * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.88, uv.y);

  gl_FragColor = vec4(col, uOpacity * edgeFade * 0.55);
}
