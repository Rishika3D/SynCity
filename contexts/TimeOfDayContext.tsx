'use client';

/**
 * contexts/TimeOfDayContext.tsx
 *
 * Time-of-day system that drives automatic day/night mode switching.
 * Reads the user's local time and computes a smooth `dayFactor` value:
 *
 *   dayFactor = 0.0  → pure night (dark mode, glowing windows, neon)
 *   dayFactor = 1.0  → pure day   (bright sky, natural sunlight)
 *   0 < dayFactor < 1 → dawn / dusk transition
 *
 * Schedule (user's local time):
 *   05:30 – 06:30  →  dawn  (smooth 0→1)
 *   06:30 – 17:30  →  day   (1.0)
 *   17:30 – 18:30  →  dusk  (smooth 1→0)
 *   18:30 – 05:30  →  night (0.0)
 *
 * Updates every 60 seconds so dawn/dusk transitions animate in real-time.
 *
 * Usage:
 *   <TimeOfDayProvider>
 *     <CityScene ... />
 *   </TimeOfDayProvider>
 *
 *   const { dayFactor, isDaytime, hour } = useTimeOfDay();
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TimeOfDayState {
  /** 0 = full night, 1 = full day, smooth transition at dawn/dusk */
  dayFactor: number;
  /** true when dayFactor > 0.5 */
  isDaytime: boolean;
  /** Current hour (0-23) with fractional minutes */
  hour: number;
}

// ─── Schedule constants ──────────────────────────────────────────────────────

const DAWN_START = 5.5;   // 05:30
const DAWN_END   = 6.5;   // 06:30
const DUSK_START = 17.5;  // 17:30
const DUSK_END   = 18.5;  // 18:30

// ─── Smooth step ────────────────────────────────────────────────────────────

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Compute dayFactor from hour ────────────────────────────────────────────

function computeDayFactor(hour: number): number {
  if (hour < DAWN_START || hour >= DUSK_END) return 0;
  if (hour >= DAWN_END && hour < DUSK_START) return 1;
  if (hour >= DAWN_START && hour < DAWN_END) {
    return smoothstep(DAWN_START, DAWN_END, hour);
  }
  // dusk
  return 1 - smoothstep(DUSK_START, DUSK_END, hour);
}

function getCurrentHour(): number {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60;
}

// ─── Context ────────────────────────────────────────────────────────────────

const TimeOfDayContext = createContext<TimeOfDayState>({
  dayFactor: 0,
  isDaytime: false,
  hour: 0,
});

export function useTimeOfDay(): TimeOfDayState {
  return useContext(TimeOfDayContext);
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function TimeOfDayProvider({ children }: { children: ReactNode }) {
  const [hour, setHour] = useState<number>(getCurrentHour);

  // Update every 60s
  useEffect(() => {
    const id = setInterval(() => {
      setHour(getCurrentHour());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<TimeOfDayState>(() => {
    const dayFactor = computeDayFactor(hour);
    return {
      dayFactor,
      isDaytime: dayFactor > 0.5,
      hour,
    };
  }, [hour]);

  return (
    <TimeOfDayContext.Provider value={value}>
      {children}
    </TimeOfDayContext.Provider>
  );
}
