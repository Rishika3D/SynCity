import { create } from 'zustand';

export type SimMode = 'chaos' | 'optimized';

interface SimulationState {
  mode          : SimMode;
  scrollProgress: number;
  sceneIndex    : number; // 0-4
  setMode       : (mode: SimMode) => void;
  setProgress   : (p: number) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  mode          : 'optimized',
  scrollProgress: 0,
  sceneIndex    : 0,
  setMode       : (mode) => set({ mode }),
  setProgress   : (p) => {
    const idx = p < 0.2 ? 0 : p < 0.4 ? 1 : p < 0.7 ? 2 : p < 0.85 ? 3 : 4;
    set({ scrollProgress: p, sceneIndex: idx });
  },
}));
