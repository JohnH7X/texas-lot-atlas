import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { inLot } from './lots';

export interface Territory { code: string; name: string; type: 'borough' | 'city' }
export interface TerritoryLinks { zoning: string; zoningLabel: string; site: string; roll?: string; rollLabel?: string }
type Collection = FeatureCollection<Polygon | MultiPolygon, Territory>;

let shapes: Promise<Collection> | null = null;
let links: Promise<Record<string, TerritoryLinks>> | null = null;

/** Borough (arrondissement) or linked city that contains a point. */
export async function territoryAt(point: [number, number]): Promise<Territory | null> {
  shapes ??= fetch('/data/territories.geojson', { cache: 'no-cache' }).then(r => r.json());
  const data = await shapes;
  for (const f of data.features) {
    const polys: Position[][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (inLot(point, polys)) return f.properties;
  }
  return null;
}

export async function territoryLinks(code: string): Promise<TerritoryLinks | null> {
  links ??= fetch('/data/territory-links.json', { cache: 'no-cache' }).then(r => r.json()).catch(() => ({}));
  return (await links)[code] || null;
}
