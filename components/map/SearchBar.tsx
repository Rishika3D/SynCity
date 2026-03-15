// File: components/map/SearchBar.tsx
'use client';

/**
 * SearchBar — Mapbox Geocoding API autocomplete.
 * Renders as the centre slot of the top header.
 * On result selection, calls onSelect so the parent can fly the map there.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { GeocoderResult } from '@/types/map';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface SearchBarProps {
  onSelect: (result: GeocoderResult) => void;
}

interface MapboxFeature {
  id:        string;
  place_name:string;
  center:    [number, number];
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<GeocoderResult[]>([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [focused,  setFocused]  = useState(false);
  const debounce   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);

  // ── Geocode ───────────────────────────────────────────────────────────────
  const geocode = useCallback(async (q: string) => {
    if (!q.trim() || !TOKEN) return;
    setLoading(true);
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${TOKEN}` +
        `&country=IN` +
        `&proximity=77.5946,12.9716` +
        `&limit=5`;
      const res  = await fetch(url);
      const data = await res.json();
      const mapped: GeocoderResult[] = (data.features as MapboxFeature[]).map(f => ({
        id:        f.id,
        placeName: f.place_name,
        center:    f.center,
      }));
      setResults(mapped);
      setOpen(mapped.length > 0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced input handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.length >= 2) {
      debounce.current = setTimeout(() => geocode(val), 320);
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  const handleSelect = (r: GeocoderResult) => {
    setQuery(r.placeName.split(',')[0]); // show short name
    setOpen(false);
    onSelect(r);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full max-w-[340px]">
      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200"
        style={{
          background:    focused ? 'rgba(0,238,255,0.07)' : 'rgba(255,255,255,0.05)',
          border:        `1px solid ${focused ? 'rgba(0,238,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
          backdropFilter:'blur(16px)',
          boxShadow:     focused ? '0 0 18px rgba(0,238,255,0.12)' : 'none',
        }}
      >
        {loading
          ? <div className="w-3.5 h-3.5 border border-[#00EEFF]/60 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          : <span className="text-white/30 text-sm flex-shrink-0">⌕</span>
        }
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search Bangalore…"
          className="flex-1 bg-transparent outline-none min-w-0"
          style={{
            fontFamily: 'ui-monospace, "Space Mono", monospace',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.85)',
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...{ 'placeholder-color': 'rgba(255,255,255,0.25)' } as any}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="text-white/25 hover:text-white/60 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 rounded-lg overflow-hidden z-50"
          style={{
            background:    'rgba(9,9,11,0.96)',
            backdropFilter:'blur(24px)',
            border:        '1px solid rgba(0,238,255,0.14)',
            boxShadow:     '0 12px 40px rgba(0,0,0,0.8)',
          }}
        >
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-3 flex flex-col gap-0.5
                         hover:bg-[#00EEFF]/8 transition-colors duration-100"
              style={{ borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              <span className="font-mono text-[11px] text-white/80 leading-tight">
                {r.placeName.split(',')[0]}
              </span>
              <span className="font-mono text-[9px] text-white/30 leading-tight truncate">
                {r.placeName.split(',').slice(1).join(',').trim()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
