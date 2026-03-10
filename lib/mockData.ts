/**
 * lib/mockData.ts
 *
 * SynCity — Bangalore Digital Twin
 * Structured mock data for the command-centre analytics dashboard.
 *
 * All values are realistic for Bengaluru (2024 figures).
 * Replace individual leaf nodes with real API responses when available.
 */

// ─── Core interfaces ──────────────────────────────────────────────────────────

export interface TrafficData {
  congestionLevel:  number;   // 0–100 index
  averageSpeedKph:  number;
  vehiclesPerHour:  number;
  incidentCount:    number;
  hotspots:         string[];
  trend:            'rising' | 'falling' | 'stable';
}

export interface EnergyData {
  consumptionMW:    number;
  renewablePct:     number;   // 0–100
  gridLoadPct:      number;   // 0–100
  peakDemandMW:     number;
  carbonIntensity:  number;   // gCO₂/kWh
  trend:            'rising' | 'falling' | 'stable';
}

export interface WaterData {
  reservoirLevelPct: number;  // 0–100
  supplyMLD:         number;  // Million Litres per Day
  demandMLD:         number;
  qualityScore:      number;  // 0–100
  activeLeaks:       number;
  trend:             'rising' | 'falling' | 'stable';
}

export interface PollutionData {
  aqi:         number;   // Air Quality Index (0–500)
  pm25:        number;   // µg/m³
  pm10:        number;   // µg/m³
  no2:         number;   // µg/m³
  co2Ppm:      number;
  category:    'Good' | 'Moderate' | 'Unhealthy' | 'Hazardous';
  trend:       'rising' | 'falling' | 'stable';
}

export interface CityMetrics {
  timestamp:  string;
  population: {
    total:      number;
    density:    number;   // per km²
    growthRate: number;   // annual %
    floating:   number;   // daily commuters
  };
  traffic:    TrafficData;
  energy:     EnergyData;
  water:      WaterData;
  pollution:  PollutionData;
}

// ─── Time-series data (24-hour rolling window) ────────────────────────────────

export interface TimeSeriesPoint {
  time:        string;   // "00:00", "01:00" …
  traffic:     number;
  aqi:         number;
  temperature: number;
  energy:      number;
}

// ─── District interface ───────────────────────────────────────────────────────

export type DistrictType = 'commercial' | 'residential' | 'industrial' | 'tech' | 'mixed';

export interface DistrictData {
  id:              string;
  name:            string;
  lat:             number;
  lng:             number;
  population:      number;
  areaKm2:         number;
  aqi:             number;
  trafficDensity:  number;   // 0–100
  energyUsageMW:   number;
  incidentCount:   number;
  type:            DistrictType;
  growthIndex:     number;   // 0–100
  safetyScore:     number;   // 0–100
  infrastructureScore: number; // 0–100
}

// ─── Weather interfaces ───────────────────────────────────────────────────────

export interface ForecastHour {
  time:       string;
  condition:  string;
  tempC:      number;
  humidity:   number;
  chanceRain: number;
}

export interface WeatherAlert {
  type:        string;
  severity:   'low' | 'medium' | 'high' | 'critical';
  description: string;
  activeUntil: string;
}

export interface WeatherExtremes {
  temperature: {
    currentC: number;
    highC:    number;
    lowC:     number;
    feelsC:   number;
  };
  humidity:        number;   // %
  windSpeedKph:    number;
  windDirection:   string;
  visibilityKm:    number;
  uvIndex:         number;
  rainfallMm:      number;
  condition:       string;
  forecast:        ForecastHour[];
  alerts:          WeatherAlert[];
}

// ─── System status ────────────────────────────────────────────────────────────

export interface SystemStatus {
  id:        string;
  name:      string;
  status:    'online' | 'degraded' | 'offline';
  uptime:    number;   // %
  lastPing:  string;
}

// ─── Complete dashboard payload ───────────────────────────────────────────────

export interface DashboardData {
  city:       CityMetrics;
  districts:  DistrictData[];
  weather:    WeatherExtremes;
  timeSeries: TimeSeriesPoint[];
  systems:    SystemStatus[];
}

// ─── Bangalore mock data ──────────────────────────────────────────────────────

export const BANGALORE_DATA: DashboardData = {

  city: {
    timestamp: new Date().toISOString(),
    population: {
      total:      13_600_000,
      density:    4_378,
      growthRate: 3.2,
      floating:   2_100_000,
    },
    traffic: {
      congestionLevel: 72,
      averageSpeedKph: 18.4,
      vehiclesPerHour: 124_500,
      incidentCount:   14,
      hotspots:        ['Silk Board', 'KR Puram', 'Marathahalli', 'Hebbal'],
      trend:           'rising',
    },
    energy: {
      consumptionMW:   3_247,
      renewablePct:    28,
      gridLoadPct:     81,
      peakDemandMW:    3_800,
      carbonIntensity: 612,
      trend:           'stable',
    },
    water: {
      reservoirLevelPct: 68,
      supplyMLD:         1_460,
      demandMLD:         1_900,
      qualityScore:      84,
      activeLeaks:       37,
      trend:             'falling',
    },
    pollution: {
      aqi:      142,
      pm25:     58.4,
      pm10:     93.2,
      no2:      41.7,
      co2Ppm:   438,
      category: 'Moderate',
      trend:    'rising',
    },
  },

  districts: [
    {
      id: 'koramangala', name: 'Koramangala',
      lat: 12.9272, lng: 77.6172, population: 320_000, areaKm2: 8.2,
      aqi: 128, trafficDensity: 82, energyUsageMW: 187, incidentCount: 5,
      type: 'mixed', growthIndex: 88, safetyScore: 76, infrastructureScore: 81,
    },
    {
      id: 'indiranagar', name: 'Indiranagar',
      lat: 12.9784, lng: 77.6408, population: 215_000, areaKm2: 5.7,
      aqi: 115, trafficDensity: 75, energyUsageMW: 143, incidentCount: 3,
      type: 'commercial', growthIndex: 82, safetyScore: 81, infrastructureScore: 85,
    },
    {
      id: 'whitefield', name: 'Whitefield',
      lat: 12.9698, lng: 77.7499, population: 410_000, areaKm2: 22.4,
      aqi: 138, trafficDensity: 88, energyUsageMW: 312, incidentCount: 8,
      type: 'tech', growthIndex: 94, safetyScore: 73, infrastructureScore: 78,
    },
    {
      id: 'electronic-city', name: 'Electronic City',
      lat: 12.8452, lng: 77.6602, population: 290_000, areaKm2: 18.7,
      aqi: 151, trafficDensity: 71, energyUsageMW: 428, incidentCount: 4,
      type: 'industrial', growthIndex: 90, safetyScore: 79, infrastructureScore: 83,
    },
    {
      id: 'mg-road', name: 'MG Road',
      lat: 12.9757, lng: 77.6097, population: 98_000, areaKm2: 3.1,
      aqi: 161, trafficDensity: 95, energyUsageMW: 98, incidentCount: 11,
      type: 'commercial', growthIndex: 71, safetyScore: 68, infrastructureScore: 89,
    },
    {
      id: 'jayanagar', name: 'Jayanagar',
      lat: 12.9299, lng: 77.5828, population: 340_000, areaKm2: 11.3,
      aqi: 108, trafficDensity: 58, energyUsageMW: 142, incidentCount: 2,
      type: 'residential', growthIndex: 62, safetyScore: 88, infrastructureScore: 79,
    },
    {
      id: 'hebbal', name: 'Hebbal',
      lat: 13.0353, lng: 77.5972, population: 185_000, areaKm2: 9.8,
      aqi: 144, trafficDensity: 91, energyUsageMW: 167, incidentCount: 9,
      type: 'mixed', growthIndex: 85, safetyScore: 72, infrastructureScore: 76,
    },
  ],

  weather: {
    temperature: { currentC: 26.4, highC: 31.2, lowC: 19.8, feelsC: 29.1 },
    humidity:       72,
    windSpeedKph:   14,
    windDirection:  'SW',
    visibilityKm:   8.4,
    uvIndex:        7,
    rainfallMm:     3.2,
    condition:      'Partly Cloudy',
    forecast: [
      { time: '15:00', condition: 'Cloudy',         tempC: 28, humidity: 75, chanceRain: 20 },
      { time: '18:00', condition: 'Thunderstorm',   tempC: 24, humidity: 88, chanceRain: 80 },
      { time: '21:00', condition: 'Light Rain',     tempC: 22, humidity: 91, chanceRain: 60 },
      { time: '00:00', condition: 'Clear',          tempC: 20, humidity: 82, chanceRain: 10 },
      { time: '06:00', condition: 'Partly Cloudy',  tempC: 21, humidity: 78, chanceRain: 15 },
    ],
    alerts: [
      {
        type:        'Heavy Rain Warning',
        severity:    'medium',
        description: 'Isolated heavy rainfall expected in south Bengaluru between 18:00–22:00',
        activeUntil: '22:00 IST',
      },
    ],
  },

  timeSeries: Array.from({ length: 24 }, (_, i) => ({
    time:        `${String(i).padStart(2, '0')}:00`,
    // Deterministic small noise via extra sine harmonics (avoids SSR/client hydration mismatch)
    traffic:     Math.round(20 + 55 * Math.abs(Math.sin((i - 8) * 0.45)) + 4  * Math.sin(i * 1.7)),
    aqi:         Math.round(95 + 60 * Math.abs(Math.sin((i - 10) * 0.38)) + 6  * Math.sin(i * 2.1)),
    temperature: Math.round(20 + 11 * Math.sin((i - 6) * 0.26)            + 0.8 * Math.sin(i * 1.3)),
    energy:      Math.round(1800 + 1400 * Math.abs(Math.sin((i - 9) * 0.42)) + 50  * Math.sin(i * 0.9)),
  })),

  systems: [
    { id: 'traffic-sensors',   name: 'Traffic Sensor Grid',  status: 'online',   uptime: 99.7, lastPing: '2s ago'  },
    { id: 'air-quality',       name: 'Air Quality Network',  status: 'online',   uptime: 98.9, lastPing: '5s ago'  },
    { id: 'water-grid',        name: 'Water Grid Monitor',   status: 'degraded', uptime: 94.1, lastPing: '12s ago' },
    { id: 'power-grid',        name: 'Power Grid SCADA',     status: 'online',   uptime: 99.9, lastPing: '1s ago'  },
    { id: 'cctv-network',      name: 'CCTV Network',         status: 'online',   uptime: 97.3, lastPing: '3s ago'  },
    { id: 'emergency-services',name: 'Emergency Services',   status: 'online',   uptime: 100,  lastPing: '1s ago'  },
  ],
};
