// File: components/ui/WeatherCard.tsx
'use client';

/**
 * WeatherCard — fetches live weather from Open-Meteo API.
 * Displays temperature, humidity, and wind speed for Bangalore.
 * Auto-refreshes every 10 minutes.
 */

import { useEffect, useState } from 'react';
import type { WeatherData } from '@/types/map';

// ── Open-Meteo endpoint ───────────────────────────────────────────────────────

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=12.9716&longitude=77.5946' +
  '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code' +
  '&wind_speed_unit=kmh&timezone=Asia%2FKolkata';

// ── WMO weather code helpers ──────────────────────────────────────────────────

function wmoIcon(code: number): string {
  if (code === 0)           return '☀️';
  if (code <= 3)            return '⛅';
  if (code <= 48)           return '🌫️';
  if (code <= 57)           return '🌦️';
  if (code <= 67)           return '🌧️';
  if (code <= 77)           return '❄️';
  if (code <= 82)           return '🌦️';
  if (code <= 99)           return '⛈️';
  return '🌡️';
}

function wmoLabel(code: number): string {
  if (code === 0)           return 'Clear sky';
  if (code <= 3)            return 'Partly cloudy';
  if (code <= 48)           return 'Foggy';
  if (code <= 57)           return 'Light drizzle';
  if (code <= 67)           return 'Rain';
  if (code <= 77)           return 'Snow';
  if (code <= 82)           return 'Rain showers';
  if (code <= 99)           return 'Thunderstorm';
  return 'Unknown';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatChip({
  label, value, unit, color = '#00EEFF',
}: {
  label: string; value: number; unit: string; color?: string;
}) {
  return (
    <div
      className="flex-1 rounded-lg p-2.5"
      style={{ background: `${color}0a`, border: `1px solid ${color}1e` }}
    >
      <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-baseline gap-0.5">
        <span className="font-mono text-[17px] font-medium leading-none" style={{ color }}>
          {value}
        </span>
        <span className="font-mono text-[10px] leading-none" style={{ color, opacity: 0.5 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export default function WeatherCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchWeather() {
      try {
        const res  = await fetch(WEATHER_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('bad response');
        const json = await res.json();
        const cur  = json.current;
        if (mounted) {
          setWeather({
            temperature: Math.round(cur.temperature_2m * 10) / 10,
            humidity:    Math.round(cur.relative_humidity_2m),
            windSpeed:   Math.round(cur.wind_speed_10m),
            weatherCode: cur.weather_code,
          });
          setError(false);
        }
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchWeather();
    const id = setInterval(fetchWeather, 10 * 60 * 1000); // refresh every 10 min
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <div
      className="rounded-xl overflow-hidden flex-shrink-0"
      style={{
        background:    'rgba(9,9,11,0.88)',
        backdropFilter:'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border:        '1px solid rgba(0,238,255,0.12)',
        boxShadow:     '0 0 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full bg-[#00EEFF] animate-pulse"
            style={{ boxShadow: '0 0 5px #00EEFF' }}
          />
          <span className="font-mono text-[10px] text-white/55 tracking-[0.22em] uppercase">
            Weather
          </span>
        </div>
        <span className="font-mono text-[9px] text-white/22 tracking-wider">
          Live · Bangalore
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center gap-3 py-1">
            <div className="w-4 h-4 rounded-full border border-[#00EEFF]/40 border-t-transparent animate-spin" />
            <span className="font-mono text-[11px] text-white/30">Fetching data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2">
            <span className="text-[#FF7722]/70 text-xs">⚠</span>
            <span className="font-mono text-[11px] text-[#FF7722]/60">
              Weather service unavailable
            </span>
          </div>
        )}

        {weather && !loading && (
          <>
            {/* Main readout */}
            <div className="flex items-start gap-3 mb-4">
              <span className="text-[30px] leading-none mt-0.5">
                {wmoIcon(weather.weatherCode)}
              </span>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-[32px] font-light text-white/90 leading-none">
                    {weather.temperature}
                  </span>
                  <span className="font-mono text-sm text-white/35">°C</span>
                </div>
                <p className="font-mono text-[10px] text-white/35 mt-0.5">
                  {wmoLabel(weather.weatherCode)}
                </p>
              </div>
            </div>

            {/* Stat chips */}
            <div className="flex gap-2">
              <StatChip
                label="Humidity"
                value={weather.humidity}
                unit="%"
                color="#00EEFF"
              />
              <StatChip
                label="Wind"
                value={weather.windSpeed}
                unit="km/h"
                color="#00FF88"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
