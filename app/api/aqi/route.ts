// app/api/aqi/route.ts
// Server-side AQI data from Open-Meteo (CAMS — Copernicus Atmosphere Monitoring Service).
// No API key required. Free tier. Data updates hourly, cached here for 5 min.
// Covers: PM2.5, PM10, NO2, O3, SO2, CO, European AQI, US AQI.

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

const DISTRICTS = [
  { lat: 12.9342, lng: 77.6268, name: 'Koramangala'    },
  { lat: 12.9762, lng: 77.6033, name: 'MG Road'        },
  { lat: 12.9174, lng: 77.6226, name: 'Silk Board'     },
  { lat: 12.9591, lng: 77.6974, name: 'Marathahalli'   },
  { lat: 12.8458, lng: 77.6603, name: 'Electronic City'},
  { lat: 13.0250, lng: 77.5500, name: 'Yeshwanthpur'   },
  { lat: 12.9250, lng: 77.5938, name: 'Jayanagar'      },
  { lat: 12.9716, lng: 77.5946, name: 'City Centre'    },
  { lat: 12.9010, lng: 77.6855, name: 'Sarjapur'       },
  { lat: 13.0358, lng: 77.5972, name: 'Hebbal'         },
  { lat: 13.1007, lng: 77.5963, name: 'Yelahanka'      },
  { lat: 12.9784, lng: 77.6408, name: 'Indiranagar'    },
  { lat: 12.9166, lng: 77.6101, name: 'BTM Layout'     },
  { lat: 12.9254, lng: 77.5468, name: 'Banashankari'   },
];

// Map European AQI (0–100+) to a 1–5 index for compatibility
function euAqiToIndex(eaqi: number): number {
  if (eaqi <= 20) return 1;
  if (eaqi <= 40) return 2;
  if (eaqi <= 60) return 3;
  if (eaqi <= 80) return 4;
  return 5;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!rateLimit(ip, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const results = await Promise.all(
      DISTRICTS.map(d =>
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality` +
          `?latitude=${d.lat}&longitude=${d.lng}` +
          `&current=pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,european_aqi,us_aqi` +
          `&timezone=Asia%2FKolkata`,
          { next: { revalidate: 300 } },
        )
          .then(r => r.json())
          .then(j => {
            const c    = j.current ?? {};
            const eaqi = (c.european_aqi as number) ?? 60;
            return {
              lat:      d.lat,
              lng:      d.lng,
              name:     d.name,
              pm25:     (c.pm2_5            as number) ?? 30,
              pm10:     (c.pm10             as number) ?? 45,
              no2:      (c.nitrogen_dioxide as number) ?? 10,
              o3:       (c.ozone            as number) ?? 80,
              so2:      (c.sulphur_dioxide  as number) ?? 5,
              co:       (c.carbon_monoxide  as number) ?? 300,
              aqi:      eaqi,
              aqiIndex: euAqiToIndex(eaqi),
              usAqi:    (c.us_aqi           as number) ?? 0,
            };
          })
          .catch(() => ({
            lat: d.lat, lng: d.lng, name: d.name,
            pm25: 30, pm10: 45, no2: 10, o3: 80, so2: 5, co: 300,
            aqi: 60, aqiIndex: 3, usAqi: 0,
          })),
      ),
    );

    return NextResponse.json({ points: results, source: 'open-meteo-cams' });
  } catch (err) {
    return NextResponse.json({ error: String(err), points: [] }, { status: 502 });
  }
}
