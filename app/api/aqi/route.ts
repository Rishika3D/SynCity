// app/api/aqi/route.ts
// Server-side AQI data from Open-Meteo (CAMS — Copernicus Atmosphere Monitoring Service).
// Fetches 14 Bangalore district coordinates in parallel, cached 5 min.
// Swap source to OpenAQ v3 or WAQI once an API key is available.

import { NextResponse } from 'next/server';

const DISTRICTS = [
  { lat: 12.9342, lng: 77.6268 }, // Koramangala
  { lat: 12.9762, lng: 77.6033 }, // MG Road
  { lat: 12.9174, lng: 77.6226 }, // Silk Board
  { lat: 12.9591, lng: 77.6974 }, // Marathahalli
  { lat: 12.8458, lng: 77.6603 }, // Electronic City
  { lat: 13.0250, lng: 77.5500 }, // Yeshwanthpur
  { lat: 12.9250, lng: 77.5938 }, // Jayanagar
  { lat: 12.9716, lng: 77.5946 }, // City Centre
  { lat: 12.9010, lng: 77.6855 }, // Sarjapur
  { lat: 13.0358, lng: 77.5972 }, // Hebbal
  { lat: 13.1007, lng: 77.5963 }, // Yelahanka
  { lat: 12.9784, lng: 77.6408 }, // Indiranagar
  { lat: 12.9166, lng: 77.6101 }, // BTM Layout
  { lat: 12.9254, lng: 77.5468 }, // Banashankari
];

export async function GET() {
  try {
    const results = await Promise.all(
      DISTRICTS.map(d =>
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality` +
          `?latitude=${d.lat}&longitude=${d.lng}` +
          `&current=european_aqi,pm2_5&timezone=Asia%2FKolkata`,
          { next: { revalidate: 300 } },
        )
          .then(r => r.json())
          .then(j => ({
            lat:  d.lat,
            lng:  d.lng,
            pm25: (j.current?.pm2_5  as number) ?? 40,
            aqi:  (j.current?.european_aqi as number) ?? 80,
          }))
          .catch(() => ({ lat: d.lat, lng: d.lng, pm25: 40, aqi: 80 })),
      ),
    );

    return NextResponse.json({ points: results, source: 'open-meteo-cams' });
  } catch (err) {
    return NextResponse.json({ error: String(err), points: [] }, { status: 502 });
  }
}
