import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as LibreMap, type ExpressionSpecification, type FilterSpecification, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FAMILIES, type MapPosition, type ViewState, type Zone } from '../lib/types';
import { getJSON } from '../lib/data';
import type { FeatureCollection, Polygon } from 'geojson';
import { FT_PER_M, LOT_MIN_ZOOM, lotEdges, lotsInBounds, streetViewUrl, type LotFeature } from '../lib/lots';

interface Props {
  initial: ViewState;
  selected: Zone | null;
  milieu: string;
  zoneFilter: string;
  activityTypes: string[] | null;
  addressCoordinates: [number, number] | null;
  visible: boolean;
  opacity: number;
  focus: { coordinates: [number, number]; zoom: number; serial: number } | null;
  lotsVisible: boolean;
  selectedLot: LotFeature | null;
  onLotClick: (lot: string) => void;
  onPointClick?: (coordinates: [number, number]) => void;
  onSelect: (code: string) => void;
  onMove: (position: MapPosition) => void;
}

/** Label points along each side of the given lots, rotated with the side and kept upright. */
function edgeLabels(lots: LotFeature[], label: (e: ReturnType<typeof lotEdges>[number]) => string): FeatureCollection {
  return { type: 'FeatureCollection', features: lots.flatMap(lot => lotEdges(lot).map(e => {
    const lat = (e.from[1] + e.to[1]) / 2 * Math.PI / 180;
    let angle = -Math.atan2(e.to[1] - e.from[1], (e.to[0] - e.from[0]) * Math.cos(lat)) * 180 / Math.PI;
    if (angle > 90) angle -= 180; if (angle < -90) angle += 180; // keep text upright
    return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: e.mid }, properties: { angle, label: label(e) } };
  })) };
}

export default function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading Texas map…');
  const marker = useRef<maplibregl.Marker | null>(null);
  const lotRequest = useRef<AbortController | null>(null);
  const [lotStatus, setLotStatus] = useState('');
  const [satellite, setSatellite] = useState(() => { if (/(^|[#&?])map=satellite/.test(window.location.hash + window.location.search)) return true; try { return localStorage.getItem('atlas-basemap') === 'satellite'; } catch { return false; } });
  const refreshLotsRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let instance: LibreMap | null = null;
    async function boot() {
      try {
        const geometry = await getJSON<FeatureCollection<Polygon>>('/data/zones.geojson');
        let style: StyleSpecification;
        try {
          const response = await fetch('https://tiles.openfreemap.org/styles/positron', { signal: AbortSignal.timeout(12000) });
          if (!response.ok) throw new Error('Basemap unavailable');
          style = await response.json();
        } catch {
          style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ece5' } }] };
          if (active) setMessage('Basemap unavailable. Land-use areas remain visible.');
        }
        if (!active || !host.current) return;
        instance = new maplibregl.Map({ container: host.current, style,
          center: [props.initial.lng, props.initial.lat], zoom: props.initial.zoom, minZoom: 6, maxZoom: 19,
          attributionControl: false, maxBounds: [[-107.5, 25.2], [-92.8, 37.2]],
          canvasContextAttributes: { preserveDrawingBuffer: true } });
        map.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        instance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        instance.addControl(new maplibregl.AttributionControl({ compact: true,
          customAttribution: 'Parcels: <a href="https://geographic.texas.gov/" target="_blank">TxGIO StratMap</a> from county appraisal districts · Geocoding: Esri' }), 'bottom-right');
        instance.on('load', () => {
          if (!instance || !active) return;
          instance.addSource('zones', { type: 'geojson', data: geometry, tolerance: 0, generateId: false });
          const colors: (string | ExpressionSpecification)[] = [];
          Object.entries(FAMILIES).forEach(([key, value]) => colors.push(key, value.color));
          const color = ['match', ['get', 'family'], ...colors, '#c8c5bb'] as unknown as ExpressionSpecification;
          // Draw beneath street/place labels when the basemap provides symbols.
          const before = instance.getStyle().layers.find(l => l.type === 'symbol')?.id;
          // Satellite imagery sits under zoning and lots; toggled from the map.
          instance.addSource('satellite', { type: 'raster', tileSize: 256, maxzoom: 19,
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
          instance.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, before);
          instance.addLayer({ id: 'zoning-fill', type: 'fill', source: 'zones', paint: { 'fill-color': color, 'fill-opacity': 0.5 } }, before);
          instance.addLayer({ id: 'zoning-line', type: 'line', source: 'zones', paint: { 'line-color': '#5b655c', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 14, 1] } }, before);
          instance.addLayer({ id: 'zoning-quality', type: 'line', source: 'zones', filter: ['==', ['get', 'qualityIssue'], true], paint: { 'line-color': '#b65328', 'line-width': 2.4, 'line-dasharray': [2, 2] } });
          instance.addLayer({ id: 'selected-fill', type: 'fill', source: 'zones', filter: ['==', ['get', 'code'], ''], paint: { 'fill-color': '#285444', 'fill-opacity': 0.22 } });
          instance.addLayer({ id: 'selected-line', type: 'line', source: 'zones', filter: ['==', ['get', 'code'], ''], paint: { 'line-color': '#173e30', 'line-width': 3 } });
          // Borough and city outlines with names, so areas without a coloured layer are still visible.
          instance.addSource('territories', { type: 'geojson', data: '/data/territories.geojson' });
          instance.addLayer({ id: 'territory-line', type: 'line', source: 'territories', paint: { 'line-color': '#254b3c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.2], 'line-dasharray': [3, 2], 'line-opacity': 0.75 } });
          // Off-island cities (North Shore, Repentigny): a solid, bold border so each city reads at a glance.
          instance.addLayer({ id: 'territory-city-halo', type: 'line', source: 'territories', filter: ['==', ['get', 'offIsland'], true],
            paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 7], 'line-opacity': 0.8 } });
          instance.addLayer({ id: 'territory-city-line', type: 'line', source: 'territories', filter: ['==', ['get', 'offIsland'], true],
            paint: { 'line-color': '#c2410c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4] } });
          instance.addSource('territory-labels', { type: 'geojson', data: '/data/territory-labels.geojson' });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'territory-label', type: 'symbol', source: 'territory-labels', maxzoom: 14.5,
            layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 13, 14], 'text-font': ['Noto Sans Regular'], 'text-max-width': 8 },
            paint: { 'text-color': '#173e30', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
          // Tax parcels: yellow outlines fetched live for the current view at street zoom.
          const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
          instance.addSource('lots', { type: 'geojson', data: empty });
          instance.addSource('lot-selected', { type: 'geojson', data: empty });
          instance.addLayer({ id: 'lot-hit', type: 'fill', source: 'lots', paint: { 'fill-color': '#000', 'fill-opacity': 0 } });
          instance.addLayer({ id: 'lot-line', type: 'line', source: 'lots', paint: { 'line-color': '#f2c200', 'line-width': ['interpolate', ['linear'], ['zoom'], 15.5, 1, 18, 2.2] } });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-label', type: 'symbol', source: 'lots', minzoom: 17,
            layout: { 'text-field': ['get', 'LABEL'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
            paint: { 'text-color': '#5a4700', 'text-halo-color': '#fff8d6', 'text-halo-width': 1.4 } });
          instance.addLayer({ id: 'lot-selected-fill', type: 'fill', source: 'lot-selected', paint: { 'fill-color': '#f2c200', 'fill-opacity': 0.28 } });
          instance.addLayer({ id: 'lot-selected-line', type: 'line', source: 'lot-selected', paint: { 'line-color': '#f2c200', 'line-width': 4 } });
          // Side lengths of every lot in view (close zoom only), in small type; the selected lot's are larger.
          instance.addSource('lot-all-dims', { type: 'geojson', data: empty });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-all-dims', type: 'symbol', source: 'lot-all-dims', minzoom: 17.5,
            layout: { 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 17.5, 9, 19, 11], 'text-font': ['Noto Sans Regular'], 'text-rotate': ['get', 'angle'],
              'text-rotation-alignment': 'map', 'text-padding': 1 },
            paint: { 'text-color': '#6b5600', 'text-halo-color': '#fffbe6', 'text-halo-width': 1.4 } });
          // Side lengths of the selected lot, written along each side.
          instance.addSource('lot-dims', { type: 'geojson', data: empty });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-dims', type: 'symbol', source: 'lot-dims', minzoom: 15.5,
            layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-rotate': ['get', 'angle'],
              'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, -0.7] },
            paint: { 'text-color': '#1d3326', 'text-halo-color': '#fff8d6', 'text-halo-width': 2 } });
          instance.addLayer({ id: 'lot-hover', type: 'fill', source: 'lots', filter: ['==', ['get', 'NO_LOT'], ''], paint: { 'fill-color': '#f2c200', 'fill-opacity': 0.28 } });
          // Hovering a parcel highlights it and names it; one map-wide handler so it follows the pointer and clears off-parcel, off-map, on drag and zoom.
          const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'lot-tip', offset: 12 });
          let hovered = '';
          const clearHover = () => {
            if (!instance || !hovered) return;
            hovered = ''; instance.getCanvas().style.cursor = '';
            instance.setFilter('lot-hover', ['==', ['get', 'NO_LOT'], '']); tip.remove();
          };
          instance.on('mousemove', e => {
            if (!instance || !instance.getLayer('lot-hit')) return;
            const p = instance.queryRenderedFeatures(e.point, { layers: ['lot-hit'] })[0]?.properties;
            if (!p) { clearHover(); return; }
            const id = String(p.NO_LOT);
            instance.getCanvas().style.cursor = 'pointer';
            tip.setLngLat(e.lngLat);
            if (id === hovered) return;
            hovered = id;
            instance.setFilter('lot-hover', ['==', ['get', 'NO_LOT'], id]);
            tip.setHTML(`<b>Parcel ${String(p.LABEL || p.NO_LOT).replace(/[<>&]/g, '')}</b><br><small>Click for owner, value & sales</small>`).addTo(instance);
          });
          instance.getContainer().addEventListener('mouseleave', clearHover);
          instance.on('dragstart', clearHover);
          instance.on('zoomstart', clearHover);
          // A click at street zoom opens the parcel under the pointer (outlines shown or not).
          instance.on('click', e => {
            if (!instance || instance.getZoom() < 13) return;
            clearHover();
            callbacks.current.onPointClick?.([e.lngLat.lng, e.lngLat.lat]);
          });
          instance.on('moveend', () => refreshLots());
          // Right-click (long-press on touch) anywhere offers Street View at that spot.
          instance.on('contextmenu', e => {
            if (!instance) return;
            const url = streetViewUrl([e.lngLat.lng, e.lngLat.lat]);
            new maplibregl.Popup({ closeButton: true, className: 'sv-popup' }).setLngLat(e.lngLat)
              .setHTML(`<a href="${url}" target="_blank" rel="noreferrer">Open Street View here ↗</a>`).addTo(instance);
          });
          instance.on('click', 'zoning-fill', e => {
            const code = e.features?.[0]?.properties?.code;
            if (typeof code === 'string') callbacks.current.onSelect(code);
          });
          instance.on('mouseenter', 'zoning-fill', () => { if (instance) instance.getCanvas().style.cursor = 'pointer'; });
          instance.on('mouseleave', 'zoning-fill', () => { if (instance) instance.getCanvas().style.cursor = ''; });
          instance.on('moveend', () => {
            if (!instance) return;
            const c = instance.getCenter(); callbacks.current.onMove({ lng: c.lng, lat: c.lat, zoom: instance.getZoom() });
          });
          // Start with the credits folded behind the (i) button so they never cover the panels.
          host.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          refreshLots();
          setReady(true);
          setMessage(current => current.startsWith('Basemap') ? current : '');
        });
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to start map. Your browser needs WebGL support.');
      }
    }
    function refreshLots() {
      const m = instance;
      if (!m || !m.getSource('lots')) return;
      lotRequest.current?.abort();
      const source = m.getSource('lots') as maplibregl.GeoJSONSource;
      if (!callbacks.current.lotsVisible || m.getZoom() < LOT_MIN_ZOOM) {
        source.setData({ type: 'FeatureCollection', features: [] });
        (m.getSource('lot-all-dims') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
        setLotStatus(callbacks.current.lotsVisible ? (m.getZoom() >= 13 ? 'Click any spot to open its parcel, or zoom in to see outlines' : 'Zoom in to see tax parcels') : '');
        return;
      }
      const controller = new AbortController(); lotRequest.current = controller;
      const b = m.getBounds();
      setLotStatus('Loading tax parcels…');
      lotsInBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], controller.signal).then(data => {
        if (controller.signal.aborted) return;
        const lots = data.features.filter(f => f.geometry);
        source.setData({ ...data, features: lots } as FeatureCollection);
        (m.getSource('lot-all-dims') as maplibregl.GeoJSONSource | undefined)?.setData(edgeLabels(lots as LotFeature[], e => e.length >= 3 ? `${(e.length * FT_PER_M).toFixed(0)} ft` : ''));
        setLotStatus('');
      }).catch(() => { if (!controller.signal.aborted) setLotStatus('Cadastre lots unavailable'); });
    }
    refreshLotsRef.current = refreshLots;
    void boot();
    return () => { active = false; marker.current?.remove(); instance?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const parts: FilterSpecification[] = [];
    if (props.milieu) parts.push(['==', ['get', 'type'], props.milieu]);
    if (props.activityTypes !== null) parts.push(['in', ['get', 'type'], ['literal', props.activityTypes]]);
    if (props.zoneFilter) parts.push(['==', ['get', 'number'], props.zoneFilter]);
    const filter = (parts.length ? ['all', ...parts] : ['all']) as FilterSpecification;
    m.setFilter('zoning-fill', filter); m.setFilter('zoning-line', filter);
    m.setFilter('zoning-quality', ['all', ...parts, ['==', ['get', 'qualityIssue'], true]] as FilterSpecification);
    const selectedFilter = ['==', ['get', 'code'], props.selected?.code || ''] as FilterSpecification;
    m.setFilter('selected-fill', selectedFilter); m.setFilter('selected-line', selectedFilter);
    for (const id of ['zoning-fill', 'zoning-line', 'zoning-quality', 'selected-fill', 'selected-line']) m.setLayoutProperty(id, 'visibility', props.visible ? 'visible' : 'none');
    m.setPaintProperty('zoning-fill', 'fill-opacity', props.opacity);
  }, [ready, props.selected, props.milieu, props.zoneFilter, props.activityTypes, props.visible, props.opacity]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !props.focus) return;
    m.flyTo({ center: props.focus.coordinates, zoom: props.focus.zoom, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });

  }, [props.focus, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const id of ['lot-hit', 'lot-hover', 'lot-line', 'lot-label']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.lotsVisible ? 'visible' : 'none');
    refreshLotsRef.current();
  }, [props.lotsVisible, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource('lot-selected') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: props.selectedLot?.geometry ? [props.selectedLot as never] : [] });
    const dims = m.getSource('lot-dims') as maplibregl.GeoJSONSource | undefined;
    dims?.setData(edgeLabels(props.selectedLot ? [props.selectedLot] : [], e => `${(e.length * FT_PER_M).toFixed(1)} ft · ${e.length.toFixed(1)} m`));
  }, [props.selectedLot, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer('satellite')) return;
    m.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none');
    // Lot outlines read better a touch heavier over imagery.
    m.setPaintProperty('lot-line', 'line-width', ['interpolate', ['linear'], ['zoom'], 15.5, satellite ? 1.5 : 1, 18, satellite ? 2.8 : 2.2]);
    try { localStorage.setItem('atlas-basemap', satellite ? 'satellite' : 'map'); } catch { /* storage unavailable */ }
  }, [satellite, ready]);

  useEffect(() => {
    marker.current?.remove(); marker.current = null;
    if (ready && map.current && props.addressCoordinates) {
      marker.current = new maplibregl.Marker({ color: '#254b3c' }).setLngLat(props.addressCoordinates).addTo(map.current);
    }
  }, [props.addressCoordinates, ready]);

  return <div className="map-wrap"><div ref={host} className="map-canvas" aria-label="Interactive Texas parcel map" />
    {!ready && !message && <div className="map-message">Loading map…</div>}
    {message && <div className={`map-message ${message.startsWith('Basemap') ? 'subtle' : ''}`} role="status">{message}</div>}
    {ready && <div className="basemap-switch" role="group" aria-label="Basemap"><button className={satellite ? '' : 'on'} aria-pressed={!satellite} onClick={() => setSatellite(false)}>Map</button><button className={satellite ? 'on' : ''} aria-pressed={satellite} onClick={() => setSatellite(true)}>Satellite</button></div>}
    {lotStatus && <div className="lot-status" role="status">{lotStatus}</div>}
    <div className="map-caption"><span className="live-dot" /> MUNICIPAL OPEN DATA <span className="caption-divider">/</span> MONTRÉAL, QUÉBEC</div>
  </div>;
}
