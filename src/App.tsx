import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, FolderOpen, Info, Layers, MapPin, RotateCcw, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import MapView from './components/MapView';
import LotPanel from './components/LotPanel';
import Reports from './components/Reports';
import type { LotSnapshot } from './lib/files';
import { changeMilieu, selectDropdownZone, zonesForType } from './lib/zoning';
import { DEFAULT_VIEW, encodeView, loadAtlas, readView } from './lib/data';
import { searchAtlas } from './lib/search';
import { territoryAt } from './lib/territory';
import { useDrag } from './lib/useDrag';
import { findLot, lotAtPoint, lotCenter, normalizeLot, streetViewUrl, type LotFeature } from './lib/lots';
import { FAMILIES, type Metadata, type SearchResult, type ViewState, type Zone } from './lib/types';

const numberFormat = new Intl.NumberFormat('en-US');
const ZONING_GUIDE = 'https://www.nyc.gov/site/planning/zoning/districts-tools.page';

export default function App() {
  const [initial] = useState(readView);
  const [view, setView] = useState<ViewState>(initial);
  const [zones, setZones] = useState<Zone[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [focus, setFocus] = useState<{ coordinates: [number, number]; zoom: number; serial: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [addressCoordinates, setAddressCoordinates] = useState<[number, number] | null>(null);
  const [opacity, setOpacity] = useState(0.45);
  const [about, setAbout] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [shareMessage, setShareMessage] = useState('');
  const [lotsVisible, setLotsVisible] = useState(true);
  const [lastLot, setLastLot] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportLot, setReportLot] = useState<LotSnapshot | null>(null);
  const [selectedLot, setSelectedLot] = useState<LotFeature | null>(null);
  const [lotState, setLotState] = useState<'idle' | 'loading' | 'notfound' | 'nogeometry' | 'error' | 'invalid'>('idle');
  const [cityLinks, setCityLinks] = useState<Record<string, { zoning: string }>>({});
  const detailDrag = useDrag('detail');
  const railDrag = useDrag('rail');
  const lotSearchId = useRef(0);
  const searchId = useRef(0);
  const [scope, setScope] = useState('');
  const zoneCity = (z: Zone) => z.city || 'New York City';
  const zonedCities = new Set(zones.map(zoneCity));
  const scopes = [...new Set([...zonedCities, ...(scope ? [scope] : [])])].sort((a, b) => a.localeCompare(b));
  const scopeHasZoning = !scope || zonedCities.has(scope);
  const cityScope = !!scope;
  const scopedZones = scope ? zones.filter(z => zoneCity(z) === scope) : zones;
  const selected = zones.find(z => z.code === view.zone) || null;
  const types = [...new Set(scopedZones.map(z => z.type))].sort((a, b) => a.localeCompare(b));
  const scopeTypes = scope ? (scopeHasZoning ? types : []) : null;
  const dropdownZones = zonesForType(scopedZones, view.milieu);
  const dropdownValue = dropdownZones.some(z => z.code === view.zone) ? view.zone : '';
  const visibleCount = scopedZones.filter(z => (!view.milieu || z.type === view.milieu) && (!view.zoneFilter || z.number === view.zoneFilter)).length;

  useEffect(() => {
    void loadAtlas().then(data => { setZones(data.zones); setMetadata(data.metadata); }).catch(e => setError(e.message));
    void fetch('/data/territory-links.json', { cache: 'no-cache' }).then(r => r.json()).then((links: Record<string, { zoning: string }>) => fetch('/data/territories.geojson').then(r => r.json()).then(t => {
      const byName: Record<string, { zoning: string }> = {};
      for (const f of t.features) if (links[f.properties.code]) byName[f.properties.name] = links[f.properties.code];
      setCityLinks(byName);
    })).catch(() => undefined);
    const onHash = () => {
      const next = readView(); setView(next);
      setFocus({ coordinates: [next.lng, next.lat], zoom: next.zoom, serial: Date.now() });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!metadata) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search + encodeView(view));
  }, [view, metadata]);

  useEffect(() => {
    const current = ++searchId.current;
    if (!metadata || query.trim().length < 2) { setResults([]); setSearchState('idle'); return; }
    const controller = new AbortController();
    setSearchState('loading');
    const timer = window.setTimeout(() => {
      void searchAtlas(query, zones, metadata.addressShards, controller.signal).then(found => {
        if (current !== searchId.current) return;
        setResults(found.results); setTruncated(found.truncated); setSearchState('done');
      }).catch(e => { if (!controller.signal.aborted && current === searchId.current) { setSearchError(e.message); setSearchState('error'); } });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, metadata, zones]);

  async function scopeAt(point: [number, number], clearZone = false) {
    const t = await territoryAt(point).catch(() => null);
    setScope(!t ? '' : t.type === 'borough' ? 'New York City' : t.name);
    if (clearZone) setView(current => ({ ...current, milieu: '', zoneFilter: '', zone: '' }));
  }
  function clearLot() { setSelectedLot(null); setLotState('idle'); }

  async function choose(result: SearchResult) {
    setView(current => ({ ...current, zone: result.zoneCodes.length === 1 ? result.zoneCodes[0] : '', milieu: '', zoneFilter: '', visible: true }));
    void scopeAt(result.coordinates);
    setSelectedAddress(result.kind === 'address' ? result.title : '');
    setAddressCoordinates(result.kind === 'address' ? result.coordinates : null);
    setFocus({ coordinates: result.coordinates, zoom: result.kind === 'address' ? 17.5 : 14, serial: Date.now() });
    setQuery(''); setResults([]); setSearchState('idle');
    if (window.innerWidth < 760) setRailOpen(false);
    if (result.kind !== 'address') return;
    // An address opens the tax parcel it sits on, with its assessment record.
    const id = ++lotSearchId.current;
    setLotState('loading'); setLotsVisible(true);
    try {
      const lot = await lotAtPoint(result.coordinates, undefined, result.title);
      if (id !== lotSearchId.current) return;
      setSelectedLot(lot); setLastLot(''); setLotState(lot ? 'idle' : 'notfound');
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  async function lotAt(coordinates: [number, number]) {
    const id = ++lotSearchId.current;
    setLotState('loading'); setLotsVisible(true);
    try {
      const lot = await lotAtPoint(coordinates);
      if (id !== lotSearchId.current) return;
      if (!lot) { setLotState('notfound'); return; }
      setSelectedLot(lot); setSelectedAddress(''); setAddressCoordinates(null); setLastLot(''); setLotState('idle');
      const center = lotCenter(lot);
      if (center) { void scopeAt(center, true); setFocus({ coordinates: center, zoom: 18, serial: Date.now() }); }
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  async function searchLot(input: string) {
    const id = ++lotSearchId.current;
    if (!normalizeLot(input)) { setLotState('invalid'); return; }
    setLastLot(normalizeLot(input));
    setLotState('loading');
    try {
      const lot = await findLot(input);
      if (id !== lotSearchId.current) return;
      if (!lot) { setSelectedLot(null); setLotState('notfound'); return; }
      setSelectedLot(lot); setSelectedAddress(''); setAddressCoordinates(null);
      const center = lotCenter(lot);
      if (center) void scopeAt(center, true);
      if (!center) { setLotState('nogeometry'); return; }
      setLotState('idle'); setLotsVisible(true); setQuery(''); setResults([]);
      setFocus({ coordinates: center, zoom: 18.6, serial: Date.now() });
      if (window.innerWidth < 760) setRailOpen(false);
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  function reset() {
    setView({ ...DEFAULT_VIEW }); setScope(''); setSelectedAddress(''); setQuery(''); setAddressCoordinates(null); clearLot();
    setFocus({ coordinates: [DEFAULT_VIEW.lng, DEFAULT_VIEW.lat], zoom: DEFAULT_VIEW.zoom, serial: Date.now() });
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShareMessage('Link copied'); }
    catch { setShareMessage('Copy the URL from your browser address bar'); }
    window.setTimeout(() => setShareMessage(''), 3500);
  }
  function chooseMilieu(milieu: string) { setView(current => changeMilieu(current, milieu, zones)); }
  function chooseZone(code: string) {
    setView(current => selectDropdownZone(current, code, zones));
    const match = dropdownZones.find(zone => zone.code === code);
    if (match) {
      setFocus({ coordinates: match.center, zoom: 13.5, serial: Date.now() });
      if (window.innerWidth < 760) setRailOpen(false);
    }
  }
  const lotLike = /^[\d\s]+$/.test(query.trim()) && !!normalizeLot(query);
  function zoneSummary(z: Zone) {
    return <span className="zone-summary"><i style={{ background: FAMILIES[z.family]?.color }}/>{z.city ? `District ${z.number} · ${z.type.split(' · ')[1] || FAMILIES[z.family]?.label.replace('Zoning · ', '')}` : z.code}</span>;
  }
  function zoneText(z: Zone) {
    return z.city ? `District ${z.number} · ${z.type.split(' · ')[1] || FAMILIES[z.family]?.label.replace('Zoning · ', '')} (${z.city})` : z.code;
  }
  function zoneBody(z: Zone) {
    return z.city ? <>
      <p className="zone-note">NYC base zoning district. R = residential, C = commercial, M = manufacturing; the number sets bulk (FAR, height). Overlays and special districts are on the parcel card.</p>
      <a className="primary-link" href="https://zola.planning.nyc.gov/" target="_blank" rel="noreferrer">Open ZoLa (NYC zoning map) <ArrowUpRight size={15}/></a>
      <a className="secondary-link" href={ZONING_GUIDE} target="_blank" rel="noreferrer">What {z.number} allows <ArrowUpRight size={14}/></a>
      {z.grid && <a className="secondary-link" href={z.grid} target="_blank" rel="noreferrer">NYC Zoning Resolution <ArrowUpRight size={14}/></a>}
    </> : null;
  }
  const lotPoint = addressCoordinates;

  return <div className="atlas-app">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); reset(); }} aria-label="Texas Lot Atlas home">
        <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 29 15 7l12 3 8 17-14 8L5 29Z" stroke="currentColor" strokeWidth="1.5"/><path d="m11 26 7-13 7 2 5 10-9 5-10-4Z" stroke="currentColor" strokeWidth="1.5"/><path d="m17 24 4-6 4 5-4 3-4-2Z" fill="currentColor"/></svg>
        <span className="wordmark">TEXAS <span>LOT ATLAS</span></span>
      </a>
      <div className="topbar-middle"><span className="edition">INDEPENDENT MAP EXPLORER</span><span className="pill">Texas, USA</span></div>
      <nav className="header-actions"><button className="quiet-button" onClick={() => { setReportLot(null); setReportsOpen(true); }}><FolderOpen size={16}/> Property files</button><button className="quiet-button about-button" onClick={() => setAbout(true)}><Info size={16}/> About the data</button><button className="share-button" onClick={share}>{shareMessage === 'Link copied' ? <Check size={16}/> : <Copy size={16}/>}<span>{shareMessage || 'Share view'}</span></button></nav>
    </header>
    <main className="workspace">
      {metadata && <MapView initial={initial} selected={selected} milieu={view.milieu} zoneFilter={view.zoneFilter} activityTypes={scopeTypes} visible={view.visible} opacity={opacity} focus={focus} addressCoordinates={addressCoordinates}
        lotsVisible={lotsVisible} selectedLot={selectedLot} onLotClick={lot => void searchLot(lot)} onPointClick={c => void lotAt(c)}
        onSelect={code => { setView(current => ({ ...current, zone: code })); const z = zones.find(x => x.code === code); if (z && scope && zoneCity(z) !== scope) setScope(zoneCity(z)); }}
        onMove={position => setView(current => ({ ...current, ...position }))}/>}
      {error && <div className="fatal-error" role="alert">{error}<button onClick={() => window.location.reload()}>Reload map</button></div>}
      <button className="rail-toggle" onClick={() => setRailOpen(!railOpen)} aria-label={railOpen ? 'Close explorer' : 'Open explorer'}>{railOpen ? <ChevronLeft size={18}/> : <SlidersHorizontal size={18}/>}</button>
      <aside className={`explorer-rail compact ${railOpen ? '' : 'collapsed'}`} aria-label="Map explorer" style={railOpen ? railDrag.style : undefined}>
        <div className="rail-heading drag-handle" {...railDrag.handle}><span className="grip" aria-hidden="true"/><div className="eyebrow">TEXAS · PARCELS, OWNERS & APPRAISED VALUES</div></div>
        <section className="search-section">
          <form className="search-input" onSubmit={e => { e.preventDefault(); if (lotLike) void searchLot(query); else if (results[0]) void choose(results[0]); }}><Search size={18}/><input id="atlas-search" value={query} onChange={e => { setQuery(e.target.value); setLotState('idle'); }} placeholder="Address, city or ZIP" autoComplete="off" aria-label="Search a New York address"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15}/></button>}</form>
          {lotLike && <button className="result lot-result" onClick={() => void searchLot(query)}><span className="lot-dot"/><span><strong>Parcel {normalizeLot(query)}</strong><small>Open this parcel (SWIS + SBL key)</small></span><ChevronRight size={14}/></button>}
          {searchState === 'loading' && !lotLike && <div className="search-feedback" role="status"><span className="spinner"/> Searching addresses…</div>}
          {searchState === 'error' && <div className="search-feedback error" role="alert">{searchError}</div>}
          {searchState === 'done' && results.length === 0 && !lotLike && <div className="search-feedback">No matching Texas address. Try number, street and city, e.g. 1100 Congress Ave Austin.</div>}
          {searchState === 'done' && results.length > 0 && <div className="search-results">{results.map(r => <button key={r.id} className="result" onClick={() => void choose(r)}><MapPin size={16}/><span><strong>{r.title}</strong><small>{r.subtitle}</small></span><ChevronRight size={14}/></button>)}{truncated && <div className="result-heading"><span>Refine your search</span></div>}</div>}
          {lotState === 'loading' && <div className="search-feedback" role="status"><span className="spinner"/> Opening parcel…</div>}
          {lotState === 'notfound' && <div className="search-feedback">{lastLot ? `No parcel ${lastLot}.` : 'No tax parcel found at this point.'}</div>}
          {lotState === 'nogeometry' && <div className="search-feedback">Parcel {selectedLot?.properties.LABEL} has no outline.</div>}
          {lotState === 'error' && <div className="search-feedback error" role="alert">The Texas parcel service did not respond. Try again.</div>}
          {!query && !selectedLot && <p className="search-hint">Search an address, or zoom in and click any yellow parcel.</p>}
        </section>
        <details className="filters" open={filtersOpen} onToggle={e => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
          <summary><Layers size={16}/> Layers & filters<span className="filters-state">{scope}{view.milieu ? ' · filtered' : ''}</span><ChevronDown size={14}/></summary>
          <div className="filters-body">
            <div className="toggle-row"><span>Tax parcels (yellow)</span><button className={`toggle ${lotsVisible ? 'on' : ''}`} role="switch" aria-checked={lotsVisible} aria-label="Show tax parcels" onClick={() => setLotsVisible(v => !v)}><span/></button></div>
            <div className="toggle-row"><span>Zoning (local, not statewide)</span><button className={`toggle ${view.visible ? 'on' : ''}`} role="switch" aria-checked={view.visible} aria-label="Show zoning layer" onClick={() => setView(current => ({ ...current, visible: !current.visible }))}><span/></button></div>
            <div className="opacity-row"><span>Opacity</span><input aria-label="Zoning overlay opacity" type="range" min="0.1" max="0.85" step="0.05" value={opacity} onChange={e => setOpacity(Number(e.target.value))}/><span>{Math.round(opacity * 100)}%</span></div>
            <div className="field-row"><label className="field-label" htmlFor="scope-filter">ZONING AREA</label><div className="select-wrap"><select id="scope-filter" value={scope} onChange={e => { setScope(e.target.value); setView(current => ({ ...current, milieu: '', zoneFilter: '', zone: '' })); }}><option value="">All areas</option>{scopes.map(c => <option key={c} value={c}>{zonedCities.has(c) ? `${c} — zoning districts` : `${c} — no open zoning data`}</option>)}</select><ChevronDown size={14}/></div></div>
            {!scopeHasZoning && <p className="context-warning">Zoning is set by each city (Houston has none) and is not published statewide. Select a parcel for a link to its local zoning map.</p>}
            {scopeHasZoning && <>
              <div className="field-row"><label className="field-label" htmlFor="milieu-filter">DISTRICT GROUP</label><div className="select-wrap"><select id="milieu-filter" value={view.milieu} onChange={e => chooseMilieu(e.target.value)}><option value="">All</option>{types.map(type => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14}/></div></div>
              <div className="field-row"><label className="field-label" htmlFor="zone-filter">DISTRICT</label><div className="select-wrap"><select id="zone-filter" value={dropdownValue} onChange={e => chooseZone(e.target.value)} disabled={!zones.length}><option value="">{`All ${dropdownZones.length}`}</option>{view.milieu ? dropdownZones.map(z => <option key={z.code} value={z.code}>{z.number}</option>) : types.map(type => <optgroup key={type} label={type}>{dropdownZones.filter(z => z.type === type).map(z => <option key={z.code} value={z.code}>{z.city ? z.number : z.code}</option>)}</optgroup>)}</select><ChevronDown size={14}/></div></div>
            </>}
            <div className="filter-footer"><span><strong>{numberFormat.format(visibleCount)}</strong> {view.visible ? 'areas shown' : 'layer hidden'}</span><button className="text-button" onClick={() => { setScope(''); setView(current => ({ ...current, milieu: '', zoneFilter: '', zone: '' })); }}><RotateCcw size={12}/> Reset</button></div>
            <div className="legend-grid">{Object.entries(FAMILIES).filter(([code]) => !scope || code.startsWith('Z')).map(([code, item]) => <div className="legend-item" key={code}><i style={{ background: item.color }}/><small>{item.label.replace('Zoning · ', '')}</small></div>)}</div>
            <div className="legend-key"><span className="lot-key"/> Parcel <span className="city-key"/> County / borough <span className="selected-key"/> Selected</div>
            <div className="rail-data"><span className="live-dot"/><span>OPEN DATA</span><strong>{metadata?.unitsDate || 'Loading…'}</strong></div>
          </div>
        </details>
      </aside>
      {selectedLot?.geometry && lotState !== 'nogeometry'
        ? <LotPanel lot={selectedLot} address={selectedAddress} preferPoint={lotPoint} zoneLine={selected ? zoneSummary(selected) : undefined} zoneDetails={selected ? zoneBody(selected) : undefined} zoneText={selected ? zoneText(selected) : undefined} zoneGrid={selected?.grid} onReport={snap => { setReportLot(snap); setReportsOpen(true); }} onClose={() => { clearLot(); setSelectedAddress(''); setAddressCoordinates(null); }}/>
        : selected ? <section className="detail-card" aria-label="Selected zoning area" style={detailDrag.style}><header className="detail-head drag-handle" {...detailDrag.handle}><span className="grip" aria-hidden="true"/><div><div className="eyebrow">ZONING DISTRICT · NEW YORK CITY</div><h2>{`District ${selected.number}`}</h2><p className="detail-address">{zoneSummary(selected)}</p></div><button className="icon-button" onClick={() => chooseZone('')} aria-label="Close area details"><X size={18}/></button></header>{zoneBody(selected)}</section>
        : <div className="map-instruction"><MapPin size={17}/><span>Click a lot or area to explore it</span></div>}
      <button className="extent-button" onClick={reset}><RotateCcw size={14}/> Texas overview</button>
      <div className="disclaimer"><a className="maker-logo" href="https://garabedian.ai" target="_blank" rel="noreferrer" title="Made by Garabedian AI"><img src="/garabedian-ai-logo.svg" alt="Garabedian AI"/></a><ShieldAlert size={15}/><span><strong>Screening map only.</strong> Parcel outlines are county tax maps, not surveys. Values are the latest appraisal roll shared with the state. Verify with the county appraisal district.</span><button onClick={() => setAbout(true)}>Data notes <ArrowUpRight size={12}/></button></div>
    </main>
    {reportsOpen && <Reports pending={reportLot} onClose={() => setReportsOpen(false)} onShowLot={snap => { setReportsOpen(false); if (snap.center) setFocus({ coordinates: snap.center, zoom: 18, serial: Date.now() }); }}/>}
    {about && <div className="modal-backdrop" onClick={() => setAbout(false)}><section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAbout(false)} aria-label="Close data notes"><X size={20}/></button><div className="eyebrow">PROVENANCE & LIMITATIONS</div><h2 id="about-title">The data behind the map.</h2><p>This independent atlas uses Texas public data. It is not an official State or appraisal district application and implies no endorsement.</p>
      <div className="source-stat-grid"><div><strong>254</strong><span>Counties</span></div><div><strong>Live</strong><span>Parcel lookups</span></div><div><strong>0</strong><span>Sale prices (non-disclosure)</span></div></div>
      <h3>Parcels, owners and values</h3><p>Parcels come live from StratMap Land Parcels, which the Texas Geographic Information Office compiles from every county appraisal district: owner and mailing address, appraisal district property ID, legal description, acreage, and land, improvement and market value where the district shares them. Some large districts (Harris and Dallas among them) do not share values in this layer; use the district’s own property search.</p>
      <h3>No sale prices</h3><p>Texas is a non-disclosure state: sale prices are not recorded publicly. Use MLS data for comparables.</p>
      <h3>Zoning</h3><p>Zoning is set by each city (Houston has none; it uses deed restrictions). It is not published statewide. Each parcel links to a search for its local zoning map.</p>
      <div className="source-links"><a href="https://geographic.texas.gov/" target="_blank" rel="noreferrer">TxGIO StratMap parcels <ArrowUpRight size={14}/></a><a href="https://comptroller.texas.gov/taxes/property-tax/" target="_blank" rel="noreferrer">Texas property tax <ArrowUpRight size={14}/></a></div>
      <p className="modal-footer">Attribution: Texas Geographic Information Office, county appraisal districts. Geocoding © Esri. Imagery © Esri. Checked {metadata?.checkedDate}.</p></section></div>}
  </div>;
}
