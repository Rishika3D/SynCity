'use client';

/**
 * app/explore/CityView.tsx
 *
 * Client wrapper that:
 *   1. Lifts LayerVisibility state (shared between CityScene and LayerControls HUD)
 *   2. Provides TimeOfDayContext in the outer React tree so both DOM components
 *      (LayerControls) and R3F Canvas components can call useTimeOfDay().
 *      R3F v8 automatically bridges context from the outer tree into the Canvas
 *      reconciler, so no duplicate provider is needed inside the Canvas.
 *   3. Provides WeatherContext in the outer tree for the same reason.
 *   4. Renders GoogleMapPanel as a floating PiP when layers.googleMap is true.
 *
 * Layout: full-screen CityScene with LayerControls (right) and
 *         optional GoogleMapPanel (bottom-left) floating on top.
 */

import { useState }                          from 'react';
import { CityScene, DEFAULT_LAYERS }         from '@/components/CityScene';
import type { LayerVisibility }              from '@/components/CityScene';
import { WeatherProvider }                   from '@/contexts/WeatherContext';
import { TimeOfDayProvider }                 from '@/contexts/TimeOfDayContext';
import { LayerControls }                     from '@/components/ui/LayerControls';
import { GoogleMapPanel }                    from '@/components/city/GoogleMapPanel';
import type { CityData }                     from '@/types/osm';

export function CityView({ data }: { data: CityData }) {
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);

  return (
    <TimeOfDayProvider>
      <WeatherProvider>
        {/* Full-screen 3-D city scene */}
        <CityScene data={data} layers={layers} />

        {/* HUD overlay — reads WeatherContext and TimeOfDayContext from outer tree */}
        <LayerControls layers={layers} onChange={setLayers} />

        {/* Google Maps PiP — shown when googleMap layer is toggled on */}
        {layers.googleMap && (
          <GoogleMapPanel
            onClose={() => setLayers(prev => ({ ...prev, googleMap: false }))}
          />
        )}
      </WeatherProvider>
    </TimeOfDayProvider>
  );
}
