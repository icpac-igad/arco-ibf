'use client';

import { useEffect, useState } from 'react';
import { feature } from 'topojson-client';

/**
 * The admin-1 TopoJSON (`/icpac_adm1v3.json`), fetched and parsed ONCE per
 * page and shared by every map on it — the dashboard map, the five
 * lead-window maps, and the storyline region-name lookup.
 *
 * Exposes the raw topology (the focus-country outline meshes it) and the
 * parsed GeoJSON features (what every choropleth draws). A failed load is
 * evicted so the next mount retries.
 */
export type Adm1Topology = { topology: any; geojson: any };

let promise: Promise<Adm1Topology> | null = null;
let ready: Adm1Topology | null = null;

export function loadAdm1Topology(): Promise<Adm1Topology> {
  if (!promise) {
    promise = fetch('/icpac_adm1v3.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((topology) => {
        ready = { topology, geojson: feature(topology, topology.objects.icpac_adm1v3) };
        return ready;
      });
    promise.catch(() => { promise = null; });
  }
  return promise;
}

export function useAdm1Topology(): { topology: any; geojson: any; error: boolean } {
  const [value, setValue] = useState<Adm1Topology | null>(ready);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (value) return;
    let cancelled = false;
    loadAdm1Topology()
      .then((v) => { if (!cancelled) { setValue(v); setError(false); } })
      .catch((err) => {
        console.error('Failed to load Admin1 topojson', err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, [value]);
  return { topology: value?.topology ?? null, geojson: value?.geojson ?? null, error };
}
