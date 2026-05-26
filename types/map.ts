// File: types/map.ts
// Shared type definitions for the Explore City map interface

/** Toggleable data-layer identifiers */
export type LayerId =
  | 'temperature'   // Urban heat heatmap
  | 'pollution'     // Air-quality heatmap
  | 'sensors'       // IoT sensor markers
  | 'traffic'       // Traffic flow lines
  | 'weather';      // Live weather-radar raster tiles (RainViewer)

/** Map of which layers are currently visible */
export type LayerState = Record<LayerId, boolean>;

/** Mapbox visual style options */
export type MapStyle = 'dark' | 'satellite' | 'navigation';

export const MAPBOX_STYLES: Record<MapStyle, string> = {
  dark:        'mapbox://styles/mapbox/dark-v11',
  satellite:   'mapbox://styles/mapbox/satellite-streets-v12',
  navigation:  'mapbox://styles/mapbox/navigation-night-v1',
};

/** Geocoded place returned by Mapbox Geocoding API */
export interface GeocoderResult {
  id:        string;
  placeName: string;
  center:    [number, number]; // [lng, lat]
}

/** Request passed to CityMap to draw a driving route */
export interface DirectionsRequest {
  origin:      [number, number];
  destination: [number, number];
}

/** Live weather data from Open-Meteo */
export interface WeatherData {
  temperature: number;   // °C
  humidity:    number;   // %
  windSpeed:   number;   // km/h
  weatherCode: number;   // WMO code
}

/** IoT sensor node planted across the city */
export interface SensorLocation {
  id:     string;
  name:   string;
  lat:    number;
  lng:    number;
  type:   'traffic' | 'air' | 'smart' | 'water';
  value:  number;
  status: 'online' | 'offline' | 'warning';
}

/** A live city metric shown in the stats panel */
export interface CityMetric {
  label:  string;
  value:  number | string;
  unit?:  string;
  trend?: 'up' | 'down' | 'stable';
  color:  string;
}

/** Alert item in the activity feed */
export interface AlertItem {
  id:      number;
  type:    'info' | 'warning' | 'critical';
  message: string;
  time:    string;
}
