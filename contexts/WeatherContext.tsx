'use client';

/**
 * contexts/WeatherContext.tsx
 *
 * Weather state for the SynCity digital twin.
 *
 * WeatherMode enum:
 *   Clear   — no effects (default)
 *   Drizzle — light rain, minimal fog
 *   Rain    — heavy rain, thicker fog, wet buildings
 *   Haze    — dense ground fog, no rain
 *
 * Exposes:
 *   weather        — current WeatherMode
 *   setWeather     — switch modes
 *   wetness        — float 0–1, drives window shader uWetness
 *   fogDensity     — float 0–1 target, drives FogExp2
 *   rainIntensity  — float 0–1, drives rain particle system
 *
 * Usage:
 *   <WeatherProvider>
 *     <CityScene ... />
 *   </WeatherProvider>
 *
 *   const { weather, setWeather, wetness, rainIntensity } = useWeather();
 */

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export enum WeatherMode {
  Clear   = 'clear',
  Drizzle = 'drizzle',
  Rain    = 'rain',
  Haze    = 'haze',
}

export interface WeatherState {
  weather:       WeatherMode;
  setWeather:    Dispatch<SetStateAction<WeatherMode>>;
  /** 0 = dry, 1 = fully wet — drives building window shader uWetness */
  wetness:       number;
  /** 0 = no fog, 1 = max fog — passed to FogExp2 density */
  fogDensity:    number;
  /** 0 = no rain, 1 = heavy rain — drives particle count */
  rainIntensity: number;
}

// ─── Weather parameter profiles ──────────────────────────────────────────────

const WEATHER_PROFILES: Record<WeatherMode, {
  wetness:       number;
  fogDensity:    number;
  rainIntensity: number;
}> = {
  [WeatherMode.Clear]:   { wetness: 0.0, fogDensity: 0.0, rainIntensity: 0.0 },
  [WeatherMode.Drizzle]: { wetness: 0.5, fogDensity: 0.2, rainIntensity: 0.3 },
  [WeatherMode.Rain]:    { wetness: 1.0, fogDensity: 0.5, rainIntensity: 1.0 },
  [WeatherMode.Haze]:    { wetness: 0.1, fogDensity: 0.9, rainIntensity: 0.0 },
};

// ─── Context ─────────────────────────────────────────────────────────────────

const WeatherContext = createContext<WeatherState>({
  weather:       WeatherMode.Clear,
  setWeather:    () => {},
  wetness:       0,
  fogDensity:    0,
  rainIntensity: 0,
});

export function useWeather(): WeatherState {
  return useContext(WeatherContext);
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function WeatherProvider({ children }: { children: ReactNode }) {
  const [weather, setWeather] = useState<WeatherMode>(WeatherMode.Clear);

  const value = useMemo<WeatherState>(() => {
    const profile = WEATHER_PROFILES[weather];
    return {
      weather,
      setWeather,
      ...profile,
    };
  }, [weather]);

  return (
    <WeatherContext.Provider value={value}>
      {children}
    </WeatherContext.Provider>
  );
}
