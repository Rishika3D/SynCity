uniform vec3  uColor;
uniform float uOpacity;

varying float vDepth;
varying float vLife;

void main() {
  // Soft circle
  vec2 uv  = gl_PointCoord - 0.5;
  float d  = length(uv);
  if (d > 0.5) discard;

  // Glow falloff
  float alpha = smoothstep(0.5, 0.0, d) * vDepth * uOpacity;
  alpha *= 0.7 + vLife * 0.3;

  // Core + halo colour
  vec3 col = mix(uColor * 1.8, uColor * 0.4, smoothstep(0.0, 0.5, d));

  gl_FragColor = vec4(col, alpha);
}
