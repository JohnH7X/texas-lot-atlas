import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { getJSON } from './data';
import { inLot } from './lots';
import type { SearchResult, Zone } from './types';

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
}

export function zoneResults(query: string, zones: Zone[]): SearchResult[] {
  const q = normalize(query);
  return zones.filter(z => normalize(z.code) === q || z.number === q || normalize(z.number) === q || (q.length >= 3 && normalize(z.code).startsWith(q)))
    .slice(0, 12).map(z => ({ id: 'zone-' + z.code, kind: 'zone', title: z.city ? `${z.number} (${z.city})` : z.code,
      subtitle: z.city ? `${z.city} zoning zone` : `${z.type} · Intensification ${z.number}`, coordinates: z.center, zoneCodes: [z.code] }));
}

// Esri World geocoder (no key for search without storing results), limited to the state.
const GEOCODER = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
export const STATE = { name: 'Texas', code: 'TX', extent: '-106.7,25.8,-93.5,36.6' };
let zoneShapes: Promise<FeatureCollection<Polygon | MultiPolygon, { code: string }>> | null = null;

/** NYC zoning district codes at a point (only NYC publishes city-wide zoning). */
async function zonesAt(point: [number, number], zones: Zone[]): Promise<string[]> {
  const near = zones.filter(z => point[0] >= z.bounds[0] && point[0] <= z.bounds[2] && point[1] >= z.bounds[1] && point[1] <= z.bounds[3]);
  if (!near.length) return [];
  zoneShapes ??= getJSON('/data/zones.geojson');
  const codes = new Set(near.map(z => z.code));
  return (await zoneShapes).features.filter(f => codes.has(f.properties.code) && inLot(point, f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
    .map(f => f.properties.code);
}

export async function searchAtlas(query: string, zones: Zone[], _shards: string[], signal?: AbortSignal): Promise<{ results: SearchResult[]; truncated: boolean }> {
  checkCancelled(signal);
  const q = query.trim();
  if (q.length < 3) return { results: [], truncated: false };
  const zr = zoneResults(q, zones);
  if (/^[A-Za-z]+\d*[-A-Za-z0-9./]*$/.test(q) && zr.length) return { results: zr, truncated: zr.length >= 12 };
  const params = new URLSearchParams({ SingleLine: q, outSR: '4326', maxLocations: '8', outFields: 'Addr_type,RegionAbbr', sourceCountry: 'USA', searchExtent: STATE.extent,
    category: 'Address,Street Address,Point Address,Subaddress,Postal', f: 'json' });
  const response = await fetch(`${GEOCODER}?${params}`, { signal });
  if (!response.ok) throw new Error('The address service did not respond. Try again.');
  const data = await response.json();
  checkCancelled(signal);
  const seen = new Set<string>();
  const hits: SearchResult[] = [];
  for (const c of data.candidates || []) {
    const k = String(c.address).replace(/\s+/g, '');
    if (c.score < 80 || seen.has(k) || (c.attributes?.RegionAbbr && c.attributes.RegionAbbr !== STATE.code)) continue;
    seen.add(k);
    const point: [number, number] = [c.location.x, c.location.y];
    const codes = await zonesAt(point, zones).catch(() => []);
    const [street, ...rest] = String(c.address).split(', ');
    hits.push({ id: 'address-' + c.address, kind: 'address', title: street, subtitle: rest.join(', ') + (codes.length ? ' · ' + zones.find(z => z.code === codes[0])?.number : ''),
      coordinates: point, zoneCodes: codes });
  }
  return { results: [...hits, ...zr].slice(0, 20), truncated: false };
}
