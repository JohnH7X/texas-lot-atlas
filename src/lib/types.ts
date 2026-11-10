export interface Zone {
  code: string;
  number: string;
  type: string;
  family: string;
  qualityIssue: boolean;
  density?: number;
  city?: string;
  grid?: string;
  center: [number, number];
  bounds: [number, number, number, number];
}

export interface Metadata {
  checkedDate: string;
  zoningDate: string;
  addressDate: string;
  zoneCount: number;
  addressCount: number;
  milieuCount: number;
  addressShards: string[];
  unitCount?: number;
  sharedCounties?: string[];
  extraCities?: { code: string; name: string; zones: number; addresses: number; units: number; lots: number }[];
  lotBuckets?: string[];
  unitsWithValues?: number;
  roleYear?: string;
  rollDate?: string;
  unitsDate?: string;
  geometryIssues: { zone: string; reason: string }[];
  zoningSource: string;
  addressSource: string;
  transformations: string;
}

export type AddressRow = [string, string, string, number, number, string[], number];
export interface SearchResult {
  id: string;
  kind: 'address' | 'zone';
  title: string;
  subtitle: string;
  coordinates: [number, number];
  zoneCodes: string[];
}

export interface MapPosition { lng: number; lat: number; zoom: number }
export interface ViewState extends MapPosition { zone: string; milieu: string; zoneFilter: string; activity: string; visible: boolean }

export const FAMILIES: Record<string, { label: string; color: string }> = {
  // NYC zoning districts, coloured by district group.
  ZH: { label: 'Zoning · Residential (R)', color: '#f2d98f' },
  ZC: { label: 'Zoning · Commercial (C)', color: '#de9fc2' },
  ZMX: { label: 'Zoning · Mixed (M/R, BPC)', color: '#eab37f' },
  ZI: { label: 'Zoning · Manufacturing (M)', color: '#a9b4c4' },
  ZCON: { label: 'Zoning · Park', color: '#8db497' },
  ZX: { label: 'Zoning · Other', color: '#c9c3b6' },
};
