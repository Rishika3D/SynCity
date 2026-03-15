// File: types/map.ts
// Shared type definitions for the Explore City map interface

/** Toggleable data-layer identifiers */
export type LayerId = 'temperature' | 'pollution' | 'sensors' | 'traffic';

/** Map of which layers are currently visible */
export type LayerState = Record<LayerId, boolean>;

/** Live weather data from Open-Meteo */
export interface WeatherData {
  temperature: number;   // °C
  humidity: number;      // %
  windSpeed: number;     // km/h
  weatherCode: number;   // WMO code
}

/** IoT sensor node planted across the city */
export interface SensorLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'traffic' | 'air' | 'smart' | 'water';
  value: number;
  status: 'online' | 'offline' | 'warning';
}

/** A live city metric shown in the stats panel */
export interface CityMetric {
  label: string;
  value: number | string;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  color: string;
}

/** Alert item in the activity feed */
export interface AlertItem {
  id: number;
  type: 'info' | 'warning' | 'critical';
  message: string;
  time: string;
}
