'use client';

import { useState, useEffect, useCallback } from 'react';

export interface MousePosition {
  x: number; // -1 to 1, left to right
  y: number; // -1 to 1, bottom to top
}

/**
 * Tracks normalised mouse position for parallax and interactive effects.
 */
export function useMouseParallax(): MousePosition {
  const [mouse, setMouse] = useState<MousePosition>({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMouse({
      x: (e.clientX / window.innerWidth) * 2 - 1,
      y: -(e.clientY / window.innerHeight) * 2 + 1,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return mouse;
}
