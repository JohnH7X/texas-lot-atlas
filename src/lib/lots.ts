import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

// TxGIO StratMap Land Parcels (county appraisal district data compiled by the Texas Geographic Information Office).
// The service only answers "identify", so parcels are fetched with identify calls and cached by id.
export const LOT_SERVICE = 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/identify';
export const LOT_MIN_ZOOM = 16.5;

/** NO_LOT is the layer's record id; LABEL is the appraisal district property ID shown on the map. */
export type ParcelProps = { NO_LOT: string; LABEL: string; [field: string]: string | number | null };
export type LotFeature = Feature<Geometry | null, ParcelProps>;

export function normalizeLot(_input: string): string {
  return '';
}

const cache = new Map<string, LotFeature>();
type Ring = [number, number][];
const signedArea = (r: Ring) => r.reduce((t, [x1, y1], i) => { const [x2, y2] = r[(i + 1) % r.length]; return t + (x2 - x1) * (y2 + y1); }, 0);
/** Esri rings → GeoJSON: clockwise rings are outer boundaries, counter-clockwise ones holes of the previous outer ring. */
function toGeometry(rings: Ring[] | undefined): Geometry | null {
  if (!rings?.length) return null;
  const polys: Ring[][] = [];
  for (const r of rings) {
    if (signedArea(r) > 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r);
  }
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

async function identify(geometry: string, geometryType: string, extent: number[], signal?: AbortSignal): Promise<FeatureCollection<Geometry | null, ParcelProps>> {
  const params = new URLSearchParams({ geometry, geometryType, sr: '4326', layers: 'all:0', tolerance: geometryType === 'esriGeometryPoint' ? '1' : '0',
    mapExtent: extent.join(','), imageDisplay: '1000,1000,96', returnGeometry: 'true', f: 'json' });
  const response = await fetch(`${LOT_SERVICE}?${params}`, { signal });
  if (!response.ok) throw new Error('Parcel service unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Parcel service error');
  const features: LotFeature[] = (data.results || []).map((r: { attributes: Record<string, string>; geometry?: { rings?: Ring[] } }) => {
    const props: ParcelProps = { NO_LOT: '', LABEL: '' };
    for (const [k, v] of Object.entries(r.attributes)) props[k] = v === 'Null' || v === '' ? null : v;
    props.NO_LOT = String(props.objectid ?? props.OBJECTID ?? '');
    props.LABEL = String(props.PROP_ID || props.GEO_ID || '');
    const f: LotFeature = { type: 'Feature', geometry: toGeometry(r.geometry?.rings), properties: props };
    if (props.NO_LOT) cache.set(props.NO_LOT, f);
    return f;
  });
  return { type: 'FeatureCollection', features };
}

export function lotsInBounds(bounds: [number, number, number, number], signal?: AbortSignal) {
  return identify(bounds.join(','), 'esriGeometryEnvelope', bounds, signal);
}

export async function findLot(input: string): Promise<LotFeature | null> {
  return cache.get(input) || null;
}

export function lotCenter(feature: LotFeature): [number, number] | null {
  const g = feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  const rings: Position[] = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap(p => p[0]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function polygons(feature: LotFeature): Position[][][] {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inLot(point: Position, polys: Position[][][]): boolean {
  return polys.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(h => inRing(point, h)));
}

/** Approximate area of the lot drawing in m² (spherical excess on small polygons). */
export function lotArea(feature: LotFeature): number | null {
  const polys = polygons(feature);
  if (!polys.length) return null;
  const R = 6378137, rad = Math.PI / 180;
  const ringArea = (ring: Position[]) => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      sum += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
    }
    return Math.abs(sum * R * R / 2);
  };
  return polys.reduce((total, [outer, ...holes]) => total + ringArea(outer) - holes.reduce((h, r) => h + ringArea(r), 0), 0);
}

export const SQFT_PER_M2 = 10.7639;

/** Opens Google Street View at the nearest panorama to a point. */
export function streetViewUrl([lng, lat]: [number, number]): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** One parcel's tax-roll record as a unit (Florida DOR NAL file fields). */
export interface Unit {
  id: string; label: string; center: [number, number]; use: string | null; category: string | null;
  floors: number | null; dwellings: number | null; builtYear: number | null; landArea: number | null; floorArea: number | null;
  marketDate: string | null; landValue: number | null; buildingValue: number | null; totalValue: number | null; previousValue: number | null;
  frontage: number | null;
  owner?: string | null; ownerMail?: string | null; marketValue?: number | null; propClass?: string | null; school?: string | null;
  county?: string | null; muni?: string | null; swis?: string | null; sbl?: string | null; bbl?: string | null; agDistrict?: string | null;
  utilities?: string | null; bedrooms?: number | null; baths?: number | null;
  zoning?: string | null; overlays?: string | null; special?: string | null; far?: string | null; landmark?: string | null; histDistrict?: string | null;
  depth?: number | null;
  taxableValue?: number | null; homestead?: boolean; legal?: string | null; sales?: { price: number; date: string; qualified: boolean }[];
  effYear?: number | null; buildings?: number | null; appraisalDistrict?: string | null; infra?: Infra | null; deeds?: Deed[] | null;
}

const num = (v: unknown) => typeof v === 'number' && v > 0 ? v : typeof v === 'string' && Number(v) > 0 ? Number(v) : null;
const str = (v: unknown) => typeof v === 'string' && v.trim() && v.trim() !== ',' ? v.trim() : null;
const title = (v: string | null) => v ? v.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : v;
// Texas Comptroller property category codes (the "state land use" on appraisal rolls).
const SPTB: Record<string, string> = { A: 'Single-family residence', B: 'Multifamily residence', C: 'Vacant lot', D: 'Qualified open-space (ag) land', E: 'Rural land, non-ag, with improvements',
  F: 'Commercial / industrial real property', G: 'Oil, gas & minerals', J: 'Utilities', L: 'Business personal property', M: 'Mobile home', O: 'Residential inventory', S: 'Special inventory', X: 'Exempt' };

export function useLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return SPTB[c[0]] ? `${SPTB[c[0]]} (${c})` : c;
}

export interface Deed { date: string; kind: string | null; ref: string | null }
export interface Infra { water: string[]; sewer: string[]; electric: string[]; districts: { name: string; type: string }[]; mud: boolean }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
async function arc(url: string, [x, y]: [number, number], outFields: string) {
  const q = new URLSearchParams({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json' });
  const d = await (await fetch(`${url}/query?${q}`)).json();
  return (d.features || []).map((f: { attributes: Record<string, unknown> }) => f.attributes) as Record<string, unknown>[];
}
const WATER_CCN = 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/PUCT_Water_CCN_Service_Areas/FeatureServer/0';
const SEWER_CCN = 'https://services3.arcgis.com/65cjxRz7QPkb5HMT/arcgis/rest/services/PUC_CCN_SEWER_TSMS/FeatureServer/1';
const ELECTRIC = 'https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_Electric_Retail_Service_Territories/FeatureServer/0';
const DISTRICTS = 'https://gisweb.tceq.texas.gov/arcgis/rest/services/Public/WaterDistricts/MapServer/0';
const DTYPE: Record<string, string> = { MUD: 'Municipal utility district', WCID: 'Water control & improvement district', FWSD: 'Fresh water supply district', SUD: 'Special utility district',
  RA: 'River authority', UD: 'Utility district', LID: 'Levee improvement district', DD: 'Drainage district', MMD: 'Municipal management district', GCD: 'Groundwater district', OTH: 'Other district', WSC: 'Water supply corporation' };
/** Water & sewer service areas (PUCT CCNs), water districts (TCEQ) and electric provider (HIFLD/EIA) at a point. */
export async function infrastructureAt(c: [number, number]): Promise<Infra> {
  const names = (rows: Record<string, unknown>[], k: string) => [...new Set(rows.map(r => String(r[k] || '').trim()).filter(Boolean))];
  const [w, s, e, d] = await Promise.all([arc(WATER_CCN, c, 'UTILITY,CCN_NO'), arc(SEWER_CCN, c, 'UTILITY,CCN_NO'), arc(ELECTRIC, c, 'NAME,TYPE'), arc(DISTRICTS, c, 'NAME,TYPE')]
    .map(p => p.catch(() => [] as Record<string, unknown>[])));
  const districts = d.map(r => ({ name: String(r.NAME || ''), type: DTYPE[String(r.TYPE)] || String(r.TYPE || '') })).filter(x => x.name);
  return { water: names(w, 'UTILITY').map(title) as string[], sewer: names(s, 'UTILITY').map(title) as string[], electric: names(e, 'NAME').map(title) as string[], districts,
    mud: d.some(r => ['MUD', 'WCID', 'FWSD', 'UD', 'LID', 'MMD'].includes(String(r.TYPE))) };
}

/** Last recorded deed, from appraisal-district data published as open GIS (Tarrant, Denton). */
export const DEED_COUNTIES: Record<string, string> = { 'Tarrant County': 'appraisal roll as published by the City of Fort Worth (Fort Worth area)', 'Denton County': 'Denton Central Appraisal District roll' };
export async function deedsAt(county: string | null | undefined, c: [number, number]): Promise<Deed[] | null> {
  if (county === 'Tarrant County') {
    const r = (await arc('https://services5.arcgis.com/3ddLCBXe1bRt7mzj/arcgis/rest/services/Parcels_Public_Vview/FeatureServer/0', c, 'DEED_DATE,DEED_BOOK,DEED_PAGE'))[0];
    const m = String(r?.DEED_DATE || '').match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!r || !m || m[3] === '1900') return null;
    const ref = r.DEED_BOOK && r.DEED_PAGE ? `Vol. ${r.DEED_BOOK} / pg. ${r.DEED_PAGE}` : r.DEED_BOOK ? `Instr. ${r.DEED_BOOK}` : null;
    return [{ date: fmt(new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]))), kind: null, ref }];
  }
  if (county === 'Denton County') {
    const rows = await arc('https://services1.arcgis.com/qr14biwnHA6Vis6l/arcgis/rest/services/Denton_CAD_Parcels/FeatureServer/0', c, 'deedDt,instrumentNum,deedType');
    return rows.filter(r => typeof r.deedDt === 'number').map(r => ({ date: fmt(new Date(r.deedDt as number)), kind: DEED[String(r.deedType)] || String(r.deedType || '') || null,
      ref: r.instrumentNum ? `Instr. ${r.instrumentNum}` : null })).slice(0, 1);
  }
  return null;
}
const DEED: Record<string, string> = { WD: 'Warranty deed', WDV: 'Warranty deed w/ vendor’s lien', SWD: 'Special warranty deed', SW: 'Special warranty deed', SWV: 'Special warranty deed w/ vendor’s lien', GN: 'General warranty deed', GNV: 'General warranty deed w/ vendor’s lien', QC: 'Quitclaim deed', QCD: 'Quitclaim deed' };

/** The parcel's appraisal record as a unit (one per parcel in StratMap). */
export async function unitsInLot(feature: LotFeature): Promise<Unit[]> {
  const p = feature.properties;
  if (!p || (p.OWNER_NAME == null && p.MKT_VALUE == null)) return [];
  const land = num(p.LAND_VALUE), imp = num(p.IMP_VALUE), market = num(p.MKT_VALUE);
  const mail = str(p.MAIL_ADDR)?.replace(/\s+,/g, ',') || [str(p.MAIL_LINE1), str(p.MAIL_LINE2), [str(p.MAIL_CITY), str(p.MAIL_STAT)].filter(Boolean).join(', '), str(p.MAIL_ZIP)].filter(Boolean).join(' ');
  const care = str(p.NAME_CARE) && str(p.NAME_CARE) !== str(p.OWNER_NAME) ? `c/o ${str(p.NAME_CARE)}` : null;
  const acres = num(p.LEGAL_AREA) && /AC/i.test(String(p.LGL_AREA_UNIT || 'AC')) ? num(p.LEGAL_AREA) : num(p.GIS_AREA);
  const situs = str(p.SITUS_ADDR)?.replace(/\s+,/g, ',').replace(/,\s*,/g, ',') || null;
  return [{
    id: String(p.PROP_ID || p.NO_LOT), label: situs || p.LABEL, center: lotCenter(feature) || [0, 0],
    use: useLabel(str(p.STAT_LAND_USE)) || str(p.LOC_LAND_USE), category: str(p.LOC_LAND_USE), floors: null, dwellings: null,
    builtYear: num(p.YEAR_BUILT) && num(p.YEAR_BUILT)! > 1700 ? num(p.YEAR_BUILT) : null,
    landArea: acres ? acres * 4046.8564 : null, floorArea: null,
    marketDate: p.TAX_YEAR ? `${p.TAX_YEAR} appraisal` : null, landValue: land, buildingValue: imp, totalValue: market, previousValue: null, frontage: null,
    marketValue: market, owner: [str(p.OWNER_NAME), care].filter(Boolean).join(' ') || null, ownerMail: mail || null,
    county: p.COUNTY ? `${title(String(p.COUNTY))} County` : null, muni: str(p.SITUS_CITY), sbl: str(p.PROP_ID), legal: str(p.LEGAL_DESC),
    appraisalDistrict: str(p.SOURCE) ? title(String(p.SOURCE)) : null
  }];
}

export async function unitsByLotNumber(_lot: string): Promise<Unit[] | null> {
  return null;
}

export async function lotAtPoint([lng, lat]: [number, number], signal?: AbortSignal, address = ''): Promise<LotFeature | null> {
  const around = async (r: number) => (await identify([lng - r, lat - r * 0.9, lng + r, lat + r * 0.9].join(','), 'esriGeometryEnvelope', [lng - r, lat - r, lng + r, lat + r], signal)).features.filter(f => f.geometry);
  let near = await around(0.0004);
  if (!near.length) near = await around(0.0012); // large rural or commercial lots
  const number = address.match(/^\s*(\d+)/)?.[1] || '';
  const matches = (f: LotFeature) => !!number && String(f.properties.SITUS_ADDR || f.properties.SITUS_NUM || '').trim().startsWith(number + ' ');
  const inside = near.filter(f => inLot([lng, lat], polygons(f)));
  if (inside.length && (!number || inside.some(matches))) return inside.find(matches) || inside[0];
  // Geocoded points often sit on the street: prefer the parcel with the same house number nearby, else the nearest edge.
  const kx = Math.cos(lat * Math.PI / 180);
  const edge = (f: LotFeature) => Math.min(...polygons(f).flatMap(poly => poly[0].slice(1).map((b, i) => {
    const a = poly[0][i], dx = (b[0] - a[0]) * kx, dy = b[1] - a[1], px = (lng - a[0]) * kx, py = lat - a[1];
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    return (px - t * dx) ** 2 + (py - t * dy) ** 2;
  })));
  return near.sort((x, y) => Number(matches(y)) - Number(matches(x)) || edge(x) - edge(y))[0] || null;
}

export interface LotEdge { from: [number, number]; to: [number, number]; mid: [number, number]; length: number }
const R_EARTH = 6371008.8;
function dist([x1, y1]: Position, [x2, y2]: Position): number {
  const rad = Math.PI / 180, lat = (y1 + y2) / 2 * rad;
  const dx = (x2 - x1) * rad * Math.cos(lat), dy = (y2 - y1) * rad;
  return Math.sqrt(dx * dx + dy * dy) * R_EARTH;
}
function bearing([x1, y1]: Position, [x2, y2]: Position): number {
  const lat = (y1 + y2) / 2 * Math.PI / 180;
  return Math.atan2(y2 - y1, (x2 - x1) * Math.cos(lat)) * 180 / Math.PI;
}

/**
 * Side lengths of the lot's outer boundary, in metres, as drawn in the cadastre.
 * Consecutive segments that run in nearly the same direction (within 8°) are merged into one side,
 * so a straight lot line drawn with extra vertices reads as a single measurement.
 */
export function lotEdges(feature: LotFeature): LotEdge[] {
  const polys = polygons(feature);
  if (!polys.length) return [];
  // Largest outer ring only (the lot itself, not detached pieces).
  const ring = polys.map(p => p[0]).sort((a, b) => b.length - a.length)[0];
  const pts = ring.slice(0, -1);
  if (pts.length < 3) return [];
  const sides: Position[][] = [];
  let current: Position[] = [pts[0]];
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length];
    if (current.length >= 2) {
      const a = bearing(current[0], current[current.length - 1]), b = bearing(current[current.length - 1], p);
      const diff = Math.abs(((a - b + 540) % 360) - 180);
      if (diff > 8) { sides.push(current); current = [current[current.length - 1]]; }
    }
    current.push(p);
  }
  sides.push(current);
  // The last side may continue straight into the first one.
  if (sides.length > 1) {
    const first = sides[0], last = sides[sides.length - 1];
    const a = bearing(last[0], last[last.length - 1]), b = bearing(first[0], first[first.length - 1]);
    if (Math.abs(((a - b + 540) % 360) - 180) <= 8) { sides[0] = [...last, ...first.slice(1)]; sides.pop(); }
  }
  return sides.map(s => {
    let length = 0;
    for (let i = 1; i < s.length; i++) length += dist(s[i - 1], s[i]);
    const a = s[0] as [number, number], b = s[s.length - 1] as [number, number];
    return { from: a, to: b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number], length };
  }).filter(e => e.length >= 0.5);
}
export const FT_PER_M = 3.28084;
