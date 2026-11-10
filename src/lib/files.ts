import type { Unit } from './lots';

// Property files for the reporting module. Everything lives in this browser:
// files and settings in localStorage, attached documents as blobs in IndexedDB.

export interface LotSnapshot {
  lot: string;
  address: string;
  place: string;
  zone: string;
  zoneGrid?: string;
  zoningUrl?: string;
  rollUrl?: string;
  center: [number, number] | null;
  rings: [number, number][][];
  area: number | null;
  perimeter: number;
  sides: number[];
  unit: Unit | null;
  capturedAt: string;
}

export type FileStatus = 'Prospect' | 'Listing' | 'Buyer search' | 'Offer' | 'Accepted' | 'Closed' | 'Archived';
export const STATUSES: FileStatus[] = ['Prospect', 'Listing', 'Buyer search', 'Offer', 'Accepted', 'Closed', 'Archived'];

export type Answer = '' | 'yes' | 'no' | 'unknown';
export interface DocMeta { id: string; name: string; size: number; type: string; added: string; category: string }
export interface HistoryItem { at: string; text: string }

export interface PropertyFile {
  id: string;
  created: string;
  updated: string;
  status: FileStatus;
  side: 'listing' | 'buyer';
  client: string;
  snapshot: LotSnapshot;
  mandate: Record<string, string>;
  declaration: Record<string, { answer: Answer; details: string }>;
  checks: Record<string, boolean>;
  checkNotes?: Record<string, string>;
  agencyChecks: Record<string, boolean>;
  listing: Record<string, string>;
  review: { by: string; at: string; note: string } | null;
  notes: string;
  docs: DocMeta[];
  history: HistoryItem[];
  reports: number;
}

export interface Settings {
  broker: string;
  title: string;
  agency: string;
  licence: string;
  phone: string;
  email: string;
  logo: string; // data URL
  color: string;
  agencyChecklist: string[];
}

const FILES_KEY = 'mla-files-v1';
const SETTINGS_KEY = 'mla-settings-v1';

export const DEFAULT_SETTINGS: Settings = {
  broker: '', title: 'Texas licensed sales agent', agency: '', licence: '', phone: '', email: '', logo: '', color: '#1d3924',
  agencyChecklist: [
    'Information About Brokerage Services (IABS) given at first substantive contact',
    'Consumer Protection Notice displayed / provided',
    'Listing or buyer representation agreement signed and filed',
    'Seller’s Disclosure Notice received',
    'Lead-based paint addendum (pre-1978)',
    'MUD / PID notices and HOA addendum as applicable',
    'Property report attached to the file',
    'Listing entered in the MLS within the required time',
    'All offers presented promptly and logged',
    'Earnest money and option fee receipted by the title company',
    'Option period, financing and closing deadlines tracked',
    'Sponsoring broker review before contract',
    'Commission disbursement at closing',
    'File retained 4 years (TREC Rule 535.159)'
  ]
};

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const loadFiles = () => read<PropertyFile[]>(FILES_KEY, []);
export const saveFiles = (files: PropertyFile[]) => write(FILES_KEY, files);
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY, {}) });
export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const now = () => new Date().toISOString();

export function newFile(snapshot: LotSnapshot): PropertyFile {
  const t = now();
  return {
    id: uid(), created: t, updated: t, status: 'Prospect', side: 'listing', client: '', snapshot,
    mandate: {}, declaration: {}, checks: {}, agencyChecks: {}, listing: {}, review: null, notes: '', docs: [],
    history: [{ at: t, text: 'File opened from the atlas' }], reports: 0
  };
}

export function log(file: PropertyFile, text: string): PropertyFile {
  const t = now();
  return { ...file, updated: t, history: [{ at: t, text }, ...file.history].slice(0, 300) };
}

// ---- documents (IndexedDB) ----
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mla-docs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction('blobs', mode).objectStore('blobs'));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export const putDoc = (id: string, blob: Blob) => tx('readwrite', s => s.put(blob, id));
export const getDoc = (id: string) => tx<Blob | undefined>('readonly', s => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteDoc = (id: string) => tx('readwrite', s => s.delete(id));

// ---- web mercator helpers for the report's satellite image ----
const R = 6378137;
export const merc = ([lng, lat]: [number, number]): [number, number] =>
  [R * lng * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];

/** Esri World Imagery tiles framed on the lot, plus the lot outline as SVG points in the same frame. */
export function satelliteFrame(rings: [number, number][][], w = 720, h = 430) {
  const pts = rings.flat().map(merc);
  if (!pts.length) return null;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const world = 2 * Math.PI * R;
  const span = Math.max((x1 - x0) * 2.2, (y1 - y0) * 2.2 * w / h, 80);
  const z = Math.min(19, Math.floor(Math.log2(w * world / (span * 256))));
  const scale = 256 * 2 ** z / world;
  const px = (x: number) => (x + world / 2) * scale, py = (y: number) => (world / 2 - y) * scale;
  const left = px((x0 + x1) / 2) - w / 2, top = py((y0 + y1) / 2) - h / 2;
  const tiles: { url: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(left / 256); tx * 256 < left + w; tx++)
    for (let ty = Math.floor(top / 256); ty * 256 < top + h; ty++)
      tiles.push({ url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`, x: tx * 256 - left, y: ty * 256 - top });
  const paths = rings.map(r => r.map(merc).map(([x, y]) => `${(px(x) - left).toFixed(1)},${(py(y) - top).toFixed(1)}`).join(' '));
  return { tiles, paths, w, h };
}
