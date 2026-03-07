// Shared material property presets — spread onto JSX material elements
// or pass to MeshTransmissionMaterial / MeshPhysicalMaterial constructors.

export const GLASS_PROPS = {
  transmission: 1,
  roughness: 0.04,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  ior: 1.5,
  thickness: 0.5,
  chromaticAberration: 0.04,
  anisotropy: 0.1,
} as const;

export const CHROME_PROPS = {
  metalness: 0.92,
  roughness: 0.18,
  envMapIntensity: 1.6,
} as const;

// Glass tint palette for city buildings
export const GLASS_TINTS = [
  '#A8D8FF',
  '#C8E8FF',
  '#B0D0FF',
  '#D0E8FF',
  '#A0C8E8',
  '#B8D8F8',
  '#C0D8F0',
  '#C8E0FF',
  '#B0D4F8',
  '#9EC8E8',
] as const;
