/** Linear interpolation */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Clamp value between min and max */
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/** Map a value from one range to another */
export const mapRange = (
  v: number,
  inMin: number, inMax: number,
  outMin: number, outMax: number,
): number => {
  const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
  return lerp(outMin, outMax, t);
};

/** Smooth step easing */
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Random number in range */
export const randRange = (min: number, max: number) =>
  Math.random() * (max - min) + min;
