import type { ViewState, Zone } from './types';

export function zonesForType(zones: Zone[], milieu: string): Zone[] {
  return zones.filter(zone => !milieu || zone.type === milieu)
    .sort((a, b) => a.type.localeCompare(b.type, undefined, { numeric: true }) || a.number.localeCompare(b.number, undefined, { numeric: true }));
}
export function changeMilieu(view: ViewState, milieu: string, zones: Zone[]): ViewState {
  const selected = zones.find(z => z.code === view.zone);
  const compatible = !!selected && (!milieu || selected.type === milieu);
  return { ...view, milieu, zone: compatible ? view.zone : '', zoneFilter: '' };
}
export function selectDropdownZone(view: ViewState, code: string, zones: Zone[]): ViewState {
  if (!code) return { ...view, zone: '', zoneFilter: '' };
  const selected = zones.find(zone => zone.code === code && (!view.milieu || zone.type === view.milieu));
  if (!selected) return view;
  return { ...view, zone: selected.code, zoneFilter: selected.number, visible: true };
}
