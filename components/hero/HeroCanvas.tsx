'use client';

import { HeroScene } from '@/three/scenes/HeroScene';
import { HeroOverlay } from '@/components/hero/HeroOverlay';
import { useMouseParallax } from '@/hooks/useMouseParallax';

export default function HeroCanvas() {
  const mouse = useMouseParallax();

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0B0C10]">
      <div className="absolute inset-0">
        <HeroScene mouse={mouse} />
      </div>
      <HeroOverlay />
    </div>
  );
}
