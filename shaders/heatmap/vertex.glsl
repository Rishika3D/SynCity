varying vec2 vUv;
varying float vElevation;

uniform float uTime;
uniform float uIntensity;

void main() {
  vUv = uv;

  // Pulsing wave elevation
  float wave = sin(position.x * 1.2 + uTime * 1.4) *
               cos(position.z * 1.2 + uTime * 1.1) * uIntensity;

  vec3 pos = position + normal * wave * 0.25;
  vElevation = wave;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
