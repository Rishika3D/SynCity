// app/api/waqi/route.ts
// Real ground-station AQI from WAQI (World Air Quality Index).
// Aggregates 10 CPCB (India's Central Pollution Control Board) stations in Bangalore.
// Also fetches detailed per-pollutant data from Silk Board — the most-monitored station.
// Cached 5 min. Requires WAQI_API_KEY in .env.local.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

const KEY    = process.env.WAQI_API_KEY;
const BOUNDS = '12.7,77.4,13.2,77.9';          // Bangalore bounding box
const DETAIL = 'geo:12.9173;77.6228';           // Silk Board CPCB station

interface RawStation {
  lat: number;
  lon: number;
  aqi: string | number;
  station: { name: string };
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(ip, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!KEY) {
    return NextResponse.json({ error: 'Missing WAQI_API_KEY', stations: [] }, { status: 500 });
  }

  try {
    const [boundsRes, detailRes] = await Promise.all([
      fetch(`https://api.waqi.info/map/bounds/?token=${KEY}&latlng=${BOUNDS}`,
        { next: { revalidate: 300 } }),
      fetch(`https://api.waqi.info/feed/${DETAIL}/?token=${KEY}`,
        { next: { revalidate: 300 } }),
    ]);

    const [boundsJson, detailJson] = await Promise.all([
      boundsRes.json(),
      detailRes.json(),
    ]);

    // 10 real CPCB ground stations
    const stations = ((boundsJson.data ?? []) as RawStation[])
      .map(s => ({
        lat:  s.lat,
        lng:  s.lon,
        name: s.station.name,
        aqi:  typeof s.aqi === 'number' ? s.aqi : parseInt(String(s.aqi), 10) || 0,
      }))
      .filter(s => s.aqi > 0);

    const avgAqi = stations.length
      ? Math.round(stations.reduce((sum, s) => sum + s.aqi, 0) / stations.length)
      : 75;

    const maxStation = stations.reduce(
      (a, b) => (a.aqi > b.aqi ? a : b),
      { aqi: 0, name: '', lat: 0, lng: 0 },
    );

    // Per-pollutant individual AQI sub-indices from Silk Board
    const dData = detailJson.data;
    const iaqi  = dData?.iaqi ?? {};
    const detail = {
      stationName: dData?.city?.name ?? 'Silk Board',
      dominentpol: dData?.dominentpol ?? 'pm25',
      timestamp:   dData?.time?.s    ?? '',
      aqi:  typeof dData?.aqi === 'number' ? dData.aqi : 0,
      pm25: (iaqi.pm25?.v as number) ?? 0,
      pm10: (iaqi.pm10?.v as number) ?? 0,
      no2:  (iaqi.no2?.v  as number) ?? 0,
      o3:   (iaqi.o3?.v   as number) ?? 0,
      so2:  (iaqi.so2?.v  as number) ?? 0,
      co:   (iaqi.co?.v   as number) ?? 0,
    };

    return NextResponse.json({
      stations,
      detail,
      avgAqi,
      maxAqi:     maxStation.aqi,
      maxStation: maxStation.name,
      source:     'waqi-cpcb',
    });
  } catch (err) {
    return NextResponse.json({ error: String(err), stations: [], source: 'waqi-cpcb' }, { status: 502 });
  }
}
