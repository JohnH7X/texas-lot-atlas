import type { Metadata, ViewState, Zone } from './types';

export async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load map data (${response.status}). Please reload or try again.`);
  return response.json() as Promise<T>;
}

export async function loadAtlas() {
  const [zones, metadata] = await Promise.all([
    getJSON<Zone[]>('/data/zones-index.json'),
    getJSON<Metadata>('/data/metadata.json'),
  ]);
  return { zones, metadata };
}

export const DEFAULT_VIEW: ViewState = { lng: -99.3, lat: 31.2, zoom: 5.6, zone: '', milieu: '', zoneFilter: '', activity: '', visible: true };
export function readView(hash = window.location.hash): ViewState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const bounded = (key: string, fallback: number, low: number, high: number) => {
    const raw = p.get(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= low && value <= high ? value : fallback;
  };
  return { lng: bounded('lng', DEFAULT_VIEW.lng, -107.5, -92.8),
    lat: bounded('lat', DEFAULT_VIEW.lat, 25.2, 37.2),
    zoom: bounded('z', DEFAULT_VIEW.zoom, 6, 19),
    zone: (p.get('zone') || '').slice(0, 30), milieu: (p.get('milieu') || '').slice(0, 20),
    zoneFilter: (p.get('filter') || '').slice(0, 30), activity: (p.get('use') || '').slice(0, 50), visible: p.get('layer') !== 'off' };
}

export function encodeView(view: ViewState): string {
  const p = new URLSearchParams({ lng: view.lng.toFixed(6), lat: view.lat.toFixed(6), z: view.zoom.toFixed(2) });
  if (view.zone) p.set('zone', view.zone);
  if (view.milieu) p.set('milieu', view.milieu);
  if (view.zoneFilter) p.set('filter', view.zoneFilter);
  if (view.activity) p.set('use', view.activity);
  if (!view.visible) p.set('layer', 'off');
  return '#' + p.toString();
}
