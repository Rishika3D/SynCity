/**
 * services/cityData.ts
 *
 * Real-time data integrations for SYNCITY Analytics Command Centre.
 *
 * Sources:
 *   Open-Meteo (api.open-meteo.com)  — weather, AQI, hourly temps   [free, no key]
 *   TomTom Traffic Flow API           — congestion & speed            [NEXT_PUBLIC_TOMTOM_API_KEY]
 *   IST time-of-day simulation        — power grid & water network    [deterministic]
 *
 * Usage:
 *   const data = await fetchAllCityData();   // composite — all sources
 *   const data = getFallbackCityData();      // instant fallback when offline
 */

const LAT = 12.9716;
const LNG = 77.5946;

// ─── Exported interfaces ──────────────────────────────────────────────────────

export interface LiveWeatherData {
  temperatureC:    number;
  feelsLikeC:      number;
  humidity:        number;
  windSpeedKph:    number;
  windDirection:   string;
  uvIndex:         number;
  precipitationMm: number;
  condition:       string;
  weatherCode:     number;
  aqi:             number;
  aqiCategory:     'Good' | 'Moderate' | 'Unhealthy' | 'Hazardous';
  pm25:            number;
  pm10:            number;
  no2:             number;
}

export interface LiveTrafficData {
  congestionLevel:  number;   // 0–100
  averageSpeedKph:  number;
  freeFlowSpeedKph: number;
  trend:            'rising' | 'falling' | 'stable';
  hotspots:         string[];
  isSimulated:      boolean;
}

export interface LiveUtilityData {
  powerConsumptionMW: number;
  gridLoadPct:        number;
  renewablePct:       number;
  peakDemandMW:       number;
  carbonIntensity:    number;   // gCO₂/kWh
  powerTrend:         'rising' | 'falling' | 'stable';
  waterReservoirPct:  number;
  waterSupplyMLD:     number;
  waterDemandMLD:     number;
  activeLeaks:        number;
  waterTrend:         'rising' | 'falling' | 'stable';
}

export interface TimeSeriesPoint {
  time:        string;   // "00:00" … "23:00"
  traffic:     number;
  aqi:         number;
  temperature: number;
  energy:      number;
}

export interface LiveCityData {
  weather:     LiveWeatherData;
  traffic:     LiveTrafficData;
  utility:     LiveUtilityData;
  timeSeries:  TimeSeriesPoint[];
  lastUpdated: Date;
}

// ─── Lookup tables ────────────────────────────────────────────────────────────

const WMO_CODES: Record<number, string> = {
  0:  'Clear Sky',       1:  'Mainly Clear',    2:  'Partly Cloudy',   3:  'Overcast',
  45: 'Fog',             48: 'Icy Fog',
  51: 'Light Drizzle',   53: 'Drizzle',         55: 'Dense Drizzle',
  61: 'Light Rain',      63: 'Moderate Rain',   65: 'Heavy Rain',
  71: 'Light Snow',      73: 'Snow',            75: 'Heavy Snow',      77: 'Snow Grains',
  80: 'Light Showers',   81: 'Showers',         82: 'Heavy Showers',
  85: 'Snow Showers',    86: 'Heavy Snow Showers',
  95: 'Thunderstorm',    96: 'Thunderstorm + Hail', 99: 'Thunderstorm + Heavy Hail',
};

const HOTSPOTS = ['Silk Board', 'KR Puram', 'Marathahalli', 'Hebbal', 'Whitefield', 'MG Road'];

// ─── Utilities ────────────────────────────────────────────────────────────────

function degToCardinal(d: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];
}

function aqiCategory(v: number): LiveWeatherData['aqiCategory'] {
  if (v < 50)  return 'Good';
  if (v < 100) return 'Moderate';
  if (v < 150) return 'Unhealthy';
  return 'Hazardous';
}

/** Current hour (0–23) in IST, deterministic across server/client */
function istHour(): number {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
  ).getHours();
}

// ─── Open-Meteo: current weather + AQI ───────────────────────────────────────
// Free tier — no API key required.
// Docs: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/air-quality-api

export async function fetchWeatherAndAqi(): Promise<LiveWeatherData> {
  const [wRes, aRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LAT}&longitude=${LNG}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,` +
      `weather_code,wind_speed_10m,wind_direction_10m,uv_index,precipitation` +
      `&timezone=Asia%2FKolkata`,
    ),
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality` +
      `?latitude=${LAT}&longitude=${LNG}` +
      `&current=pm2_5,pm10,nitrogen_dioxide,european_aqi` +
      `&timezone=Asia%2FKolkata`,
    ),
  ]);

  if (!wRes.ok || !aRes.ok) throw new Error('Open-Meteo unavailable');

  const w  = await wRes.json();
  const a  = await aRes.json();
  const c  = w.current   as Record<string, number>;
  const aq = a.current   as Record<string, number>;

  return {
    temperatureC:    Math.round(c.temperature_2m),
    feelsLikeC:      Math.round(c.apparent_temperature),
    humidity:        c.relative_humidity_2m,
    windSpeedKph:    Math.round(c.wind_speed_10m),
    windDirection:   degToCardinal(c.wind_direction_10m),
    uvIndex:         c.uv_index ?? 0,
    precipitationMm: +((c.precipitation ?? 0).toFixed(1)),
    condition:       WMO_CODES[c.weather_code] ?? 'Unknown',
    weatherCode:     c.weather_code,
    aqi:             Math.round(aq.european_aqi  ?? 80),
    aqiCategory:     aqiCategory(aq.european_aqi ?? 80),
    pm25:            +((aq.pm2_5              ?? 0).toFixed(1)),
    pm10:            +((aq.pm10               ?? 0).toFixed(1)),
    no2:             +((aq.nitrogen_dioxide   ?? 0).toFixed(1)),
  };
}

// ─── TomTom: real-time traffic flow ──────────────────────────────────────────
// Requires NEXT_PUBLIC_TOMTOM_API_KEY — falls back to IST simulation if absent.
// Docs: https://developer.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data

function simulateTraffic(): LiveTrafficData {
  const h = istHour();
  const base =
    (h >= 8  && h <= 10) ? 78 :
    (h >= 17 && h <= 20) ? 74 :
    (h >= 0  && h <= 5 ) ? 12 : 44;

  const congestion = Math.max(5, Math.min(98, base + Math.round(Math.sin(h * 0.9) * 7)));
  const freeFlow   = 50;

  return {
    congestionLevel:  congestion,
    averageSpeedKph:  Math.round(freeFlow * (1 - congestion / 150)),
    freeFlowSpeedKph: freeFlow,
    trend:            congestion > 65 ? 'rising' : congestion < 30 ? 'falling' : 'stable',
    hotspots:         HOTSPOTS.slice(0, Math.max(1, Math.ceil(congestion / 22))),
    isSimulated:      true,
  };
}

export async function fetchTrafficData(): Promise<LiveTrafficData> {
  const key = process.env.NEXT_PUBLIC_TOMTOM_API_KEY;
  if (!key) return simulateTraffic();

  try {
    const res = await fetch(
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
      `?point=${LAT},${LNG}&unit=KMPH&key=${key}`,
    );
    if (!res.ok) return simulateTraffic();

    const json = await res.json();
    const seg  = json.flowSegmentData as { currentSpeed: number; freeFlowSpeed: number };
    const congestion = Math.round(Math.max(0, (1 - seg.currentSpeed / seg.freeFlowSpeed) * 100));

    return {
      congestionLevel:  congestion,
      averageSpeedKph:  Math.round(seg.currentSpeed),
      freeFlowSpeedKph: Math.round(seg.freeFlowSpeed),
      trend:            congestion > 65 ? 'rising' : congestion < 30 ? 'falling' : 'stable',
      hotspots:         HOTSPOTS.slice(0, Math.max(1, Math.ceil(congestion / 22))),
      isSimulated:      false,
    };
  } catch {
    return simulateTraffic();
  }
}

// ─── Power & water: IST time-of-day simulation ────────────────────────────────
// Models Bangalore's real demand patterns:
//   Power: twin peaks at 08–10 (morning commute) and 18–21 (evening load)
//          overnight trough 00–05; solar boost during 09–16
//   Water: demand spikes 06–09 and 18–21 (household usage)

export function generateUtilityData(): LiveUtilityData {
  const h = istHour();

  // ── Power ──
  const powerFactor =
    (h >= 7  && h <= 10) ? 0.87 :
    (h >= 18 && h <= 21) ? 0.93 :
    (h >= 22 || h <= 4 ) ? 0.46 :
    (h >= 11 && h <= 17) ? 0.72 : 0.60;

  const peakMW        = 3_950;
  const consumptionMW = Math.round(peakMW * powerFactor + Math.sin(h * 1.7) * 80);
  const gridLoadPct   = Math.round((consumptionMW / peakMW) * 100);

  // Solar mid-day, wind at night
  const renewablePct  = Math.round(
    14 + (h >= 9 && h <= 16
      ? 24 * Math.sin(((h - 9) / 7) * Math.PI)
      : 4),
  );

  // ── Water ──
  const waterPeak   = (h >= 6 && h <= 9) || (h >= 18 && h <= 21);
  const supplyMLD   = 1_460;
  const demandMLD   = waterPeak ? 1_950 : 1_580;

  return {
    powerConsumptionMW: consumptionMW,
    gridLoadPct,
    renewablePct,
    peakDemandMW:       peakMW,
    carbonIntensity:    Math.round(610 - renewablePct * 4.2),
    powerTrend:
      (h >= 6  && h <= 9)  ||
      (h >= 17 && h <= 21) ? 'rising'  :
      (h >= 22 || h <= 4)  ? 'falling' : 'stable',
    waterReservoirPct:  Math.round(66 + 4 * Math.sin(h * 0.26)),
    waterSupplyMLD:     supplyMLD,
    waterDemandMLD:     demandMLD,
    activeLeaks:        Math.round(28 + 12 * Math.abs(Math.sin(h * 0.31))),
    waterTrend:         waterPeak ? 'rising' : (h >= 10 && h <= 16) ? 'falling' : 'stable',
  };
}

// ─── Time-series: real temperatures + synthetic traffic / AQI / energy ────────
// Fetches the past-24h hourly temperature from Open-Meteo (free).
// Traffic, AQI, and energy are generated with deterministic sine patterns
// that match Bangalore's diurnal rhythms, anchored to the hour index.

export async function generateTimeSeries(): Promise<TimeSeriesPoint[]> {
  let temps: number[] | null = null;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LAT}&longitude=${LNG}` +
      `&hourly=temperature_2m` +
      `&past_hours=23&forecast_days=0` +
      `&timezone=Asia%2FKolkata`,
    );
    if (res.ok) {
      const data = await res.json();
      temps = (data.hourly?.temperature_2m as number[] ?? []).map(Math.round);
    }
  } catch { /* fall through */ }

  return Array.from({ length: 24 }, (_, i) => ({
    time:        `${String(i).padStart(2, '0')}:00`,
    traffic:     Math.round(20 + 55 * Math.abs(Math.sin((i - 8)  * 0.45)) + 4  * Math.sin(i * 1.7)),
    aqi:         Math.round(95 + 60 * Math.abs(Math.sin((i - 10) * 0.38)) + 6  * Math.sin(i * 2.1)),
    temperature: temps
      ? (temps[i] ?? Math.round(20 + 11 * Math.sin((i - 6) * 0.26)))
      : Math.round(20 + 11 * Math.sin((i - 6) * 0.26) + 0.8 * Math.sin(i * 1.3)),
    energy:      Math.round(1800 + 1400 * Math.abs(Math.sin((i - 9) * 0.42)) + 50 * Math.sin(i * 0.9)),
  }));
}

// ─── Composite: fetch everything in parallel ──────────────────────────────────

export async function fetchAllCityData(): Promise<LiveCityData> {
  const [weather, traffic, timeSeries] = await Promise.all([
    fetchWeatherAndAqi(),
    fetchTrafficData(),
    generateTimeSeries(),
  ]);

  return {
    weather,
    traffic,
    utility:     generateUtilityData(),
    timeSeries,
    lastUpdated: new Date(),
  };
}

// ─── Instant fallback (offline / error state) ─────────────────────────────────

export function getFallbackCityData(): LiveCityData {
  return {
    weather: {
      temperatureC: 26, feelsLikeC: 29, humidity: 72,
      windSpeedKph: 14, windDirection: 'SW', uvIndex: 7,
      precipitationMm: 3.2, condition: 'Partly Cloudy', weatherCode: 2,
      aqi: 142, aqiCategory: 'Moderate', pm25: 58.4, pm10: 93.2, no2: 41.7,
    },
    traffic:   simulateTraffic(),
    utility:   generateUtilityData(),
    timeSeries: Array.from({ length: 24 }, (_, i) => ({
      time:        `${String(i).padStart(2, '0')}:00`,
      traffic:     Math.round(20 + 55 * Math.abs(Math.sin((i - 8)  * 0.45)) + 4 * Math.sin(i * 1.7)),
      aqi:         Math.round(95 + 60 * Math.abs(Math.sin((i - 10) * 0.38)) + 6 * Math.sin(i * 2.1)),
      temperature: Math.round(20 + 11 * Math.sin((i - 6) * 0.26) + 0.8 * Math.sin(i * 1.3)),
      energy:      Math.round(1800 + 1400 * Math.abs(Math.sin((i - 9) * 0.42)) + 50 * Math.sin(i * 0.9)),
    })),
    lastUpdated: new Date(),
  };
}
