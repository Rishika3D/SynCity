'use client';
import dynamic           from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { useSimulationStore } from '@/store/useSimulationStore';
import Overlay  from '@/components/ui/Overlay';
import Controls from '@/components/ui/Controls';
import Loader   from '@/components/ui/Loader';

// Dynamic import — avoids SSR issues with WebGL
const Scene = dynamic(() => import('@/components/scene/Scene'), { ssr: false });

const SCROLL_HEIGHT = '600vh'; // 6× viewport = 5 scene segments

export default function ExperiencePage() {
  const setProgress = useSimulationStore(s => s.setProgress);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const rafRef      = useRef<number>(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onScroll = () => {
      const max = container.scrollHeight - container.clientHeight;
      const p   = max > 0 ? container.scrollTop / max : 0;
      setProgress(p);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [setProgress]);

  return (
    <main>
      <Loader />

      {/* Scroll container — fills viewport, overflows-y scrollable */}
      <div
        ref={scrollRef}
        style={{
          position: 'fixed',
          inset   : 0,
          overflowY: 'scroll',
          overflowX: 'hidden',
        }}
      >
        {/* Tall content drives scroll */}
        <div style={{ height: SCROLL_HEIGHT, position: 'relative' }}>

          {/* Sticky canvas — stays pinned while page scrolls beneath */}
          <div style={{
            position: 'sticky',
            top     : 0,
            height  : '100vh',
            width   : '100%',
          }}>
            <Scene />
          </div>

        </div>
      </div>

      {/* UI overlays — fixed above everything */}
      <Overlay />
      <Controls />
    </main>
  );
}
