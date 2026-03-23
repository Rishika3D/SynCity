uniform vec3  uColor;
uniform float uTime;
uniform float uStrength;

varying vec2 vUv;

void main() {
  vec2 center = vUv - 0.5;
  float dist  = length(center);

  // Outer glow halo
  float glow = exp(-dist * dist * 6.0) * uStrength;
  glow += exp(-dist * dist * 20.0) * uStrength * 0.6;

  // Animated pulse
  glow *= 0.85 + 0.15 * sin(uTime * 2.5);

  gl_FragColor = vec4(uColor, glow);
}
