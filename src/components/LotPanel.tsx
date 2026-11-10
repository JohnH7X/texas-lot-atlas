import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Eye, FileText, MapPin, UserSearch, X } from 'lucide-react';
import type { LotSnapshot } from '../lib/files';
import { useDrag } from '../lib/useDrag';
import { territoryAt, territoryLinks, type Territory, type TerritoryLinks } from '../lib/territory';
import { FT_PER_M, lotArea, lotCenter, lotEdges, SQFT_PER_M2, streetViewUrl, unitsInLot, type LotFeature, type Unit } from '../lib/lots';

const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (v: number | null | undefined) => v == null ? '—' : dollars.format(v);
const len = (m: number) => <>{(m * FT_PER_M).toFixed(1)} ft<small>{m.toFixed(1)} m</small></>;
const sqft = (m2: number | null, land = false) => m2 === null ? '—' : <>{n.format(m2 * SQFT_PER_M2)} ft²<small>{land && m2 > 4046 ? `${(m2 / 4046.86).toFixed(2)} acres` : `${n.format(m2)} m²`}</small></>;

interface Props {
  lot: LotFeature;
  address?: string;
  preferPoint?: [number, number] | null;
  /** One-line zone summary shown under the title, and its full details (collapsed). */
  zoneLine?: ReactNode;
  zoneDetails?: ReactNode;
  /** Plain-text zone summary and grid link, for reports. */
  zoneText?: string;
  zoneGrid?: string;
  onReport?: (snapshot: LotSnapshot) => void;
  onClose: () => void;
}

/** Everything about one selected parcel, in a single card. */
export default function LotPanel({ lot, address, preferPoint, zoneLine, zoneDetails, zoneText, zoneGrid, onReport, onClose }: Props) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [territory, setTerritory] = useState<{ place: Territory; links: TerritoryLinks | null } | null | 'none'>(null);
  const drag = useDrag('detail');
  useEffect(() => {
    let active = true;
    setTerritory(null);
    const center = lotCenter(lot);
    if (!center) { setTerritory('none'); return; }
    void territoryAt(center).then(async place => {
      if (active) setTerritory(place ? { place, links: await territoryLinks(place.code) } : 'none');
    }).catch(() => { if (active) setTerritory('none'); });
    return () => { active = false; };
  }, [lot]);
  useEffect(() => {
    let active = true;
    setUnits(null); setOwnerOpen(false);
    void unitsInLot(lot).then(found => { if (active) setUnits(found); }).catch(() => { if (active) setUnits([]); });
    return () => { active = false; };
  }, [lot]);

  const area = lotArea(lot);
  const edges = lotEdges(lot);
  const perimeter = edges.reduce((t, e) => t + e.length, 0);
  const unit = units?.[0];
  const viewPoint = preferPoint || lotCenter(lot);
  const place = territory && territory !== 'none' ? territory.place : null;
  const links = territory && territory !== 'none' ? territory.links : null;
  const nyc = place?.type === 'borough';
  const muni = unit?.muni && unit.muni !== place?.name ? unit.muni : '';
  const placeLabel = !place ? '' : nyc ? `${place.name} · New York City` : [muni, place.name].filter(Boolean).join(' · ');
  const key = unit?.sbl || lot.properties.LABEL;
  const bbl = unit?.bbl && unit.bbl.length === 10 ? unit.bbl : '';
  const acris = bbl ? `https://a836-acris.nyc.gov/bblsearch/bblsearch.asp?borough=${bbl[0]}&block=${Number(bbl.slice(1, 6))}&lot=${Number(bbl.slice(6))}` : '';
  const zola = bbl ? `https://zola.planning.nyc.gov/l/lot/${bbl[0]}/${Number(bbl.slice(1, 6))}/${Number(bbl.slice(6))}` : '';
  const bis = bbl ? `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=${bbl[0]}&block=${Number(bbl.slice(1, 6))}&lot=${Number(bbl.slice(6))}` : '';
  const rollUrl = nyc ? links?.roll || undefined : links?.site;
  const title = address || unit?.label;

  async function copy() {
    try { await navigator.clipboard.writeText(key); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  function report() {
    const g = lot.geometry;
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    onReport?.({
      lot: key, address: title || '', place: placeLabel, zone: zoneText || (unit?.zoning ? `Zoning ${unit.zoning}${unit.overlays ? ` · overlays ${unit.overlays}` : ''}${unit.special ? ` · special district ${unit.special}` : ''}` : ''),
      zoneGrid: zola || zoneGrid, zoningUrl: links?.zoning, rollUrl: acris || rollUrl,
      center: viewPoint, rings: polys.map(p => p[0].map(([x, y]) => [x, y] as [number, number])), area, perimeter, sides: edges.map(e => e.length),
      unit: unit || null, capturedAt: new Date().toISOString()
    });
  }

  return <section className="detail-card" aria-label="Selected parcel" style={drag.style}>
    <header className="detail-head drag-handle" {...drag.handle}><span className="grip" aria-hidden="true"/>
      <div>
        <div className="eyebrow">{placeLabel ? placeLabel.toUpperCase() : 'TAX PARCEL'}</div>
        <h2>{`Parcel ${key}`}</h2>
        {title && <p className="detail-address"><MapPin size={13}/>{title}</p>}
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Close parcel details"><X size={18}/></button>
    </header>

    {zoneLine && <details className="zone-line"><summary>{zoneLine}<ChevronDown size={14}/></summary><div className="zone-line-body">{zoneDetails}</div></details>}

    {units === null && <p className="detail-note" role="status">Loading assessment…</p>}
    {units?.length === 0 && <p className="detail-note">No assessment record on this parcel. Check the county’s real property office.</p>}

    {unit && <>
      <div className="value-hero"><span>Appraised market value</span><strong>{unit.marketValue ? money(unit.marketValue) : 'Not published'}</strong>
        <small>{unit.marketValue ? <>Land {money(unit.landValue)} · Improvements {money(unit.buildingValue)}{unit.marketDate && <> · {unit.marketDate}</>}</> : 'This appraisal district does not share values statewide — see its site.'}</small></div>
      <dl className="fact-grid">
        <div><dt>Lot area</dt><dd>{sqft(unit.landArea ?? area, true)}</dd></div>
        <div><dt>Appraisal district</dt><dd>{unit.appraisalDistrict || '—'}</dd></div>
        <div><dt>Year built</dt><dd>{unit.builtYear ?? '—'}</dd></div>
        <div><dt>Property ID</dt><dd>{unit.sbl || '—'}</dd></div>
        <div><dt>Property class</dt><dd>{unit.use || '—'}</dd></div>
        {unit.effYear && unit.effYear !== unit.builtYear && <div><dt>Effective year</dt><dd>{unit.effYear}</dd></div>}
        {unit.zoning && <div><dt>Zoning</dt><dd>{unit.zoning}{unit.overlays && <small>Overlay {unit.overlays}</small>}{unit.special && <small>Special district {unit.special}</small>}</dd></div>}
        {unit.far && <div><dt>FAR</dt><dd><small>{unit.far}</small></dd></div>}
        {(unit.landmark || unit.histDistrict) && <div><dt>Landmark</dt><dd>{[unit.landmark, unit.histDistrict].filter(Boolean).join(' · ')}</dd></div>}
        {unit.agDistrict && <div><dt>Agricultural district</dt><dd>{unit.agDistrict}</dd></div>}
      </dl>
      {!!unit.sales?.length && <div className="sales"><b>Recent sales</b>{unit.sales.map((x, i) => <div key={i}><span>{x.date}</span><strong>{money(x.price)}</strong><small>{x.qualified ? 'arm’s length' : 'not qualified'}</small></div>)}</div>}
      {unit.legal && <p className="detail-foot">Legal: {unit.legal}</p>}
    </>}
    {!unit && area !== null && <dl className="fact-grid"><div><dt>Lot area (drawing)</dt><dd>{sqft(area, true)}</dd></div></dl>}

    {edges.length > 0 && <details className="measure">
      <summary>Lot measurements<ChevronDown size={14}/></summary>
      <dl className="fact-grid">
        {unit?.frontage != null && <div><dt>Frontage (roll)</dt><dd>{len(unit.frontage)}</dd></div>}
        {unit?.depth != null && <div><dt>Depth (roll)</dt><dd>{len(unit.depth)}</dd></div>}
        <div><dt>Perimeter</dt><dd>{len(perimeter)}</dd></div>
        <div><dt>Sides</dt><dd>{edges.length}</dd></div>
      </dl>
      <ol className="side-list">{edges.map((e, i) => <li key={i}><span>Side {i + 1}</span><strong>{(e.length * FT_PER_M).toFixed(1)} ft</strong><small>{e.length.toFixed(1)} m</small></li>)}</ol>
      <p className="detail-foot">Sides are measured on the county parcel map drawing, not a survey.</p>
    </details>}

    <button className="owner-button" onClick={() => setOwnerOpen(o => !o)} disabled={units === null}><UserSearch size={15}/> Get owner</button>
    {ownerOpen && <div className="owner-steps" role="status">
      {unit?.owner ? <><b>{unit.owner}</b>{unit.ownerMail && <p>Mailing address: {unit.ownerMail}</p>}<p className="detail-foot">Owner on the appraisal district roll (TxGIO StratMap). Confirm the vesting deed in the county clerk’s real property records.</p></>
        : <p>No owner name on this record. Use the county property appraiser’s search below.</p>}
      <ol>
        {acris && <li><a href={acris} target="_blank" rel="noreferrer">ACRIS deeds & mortgages <ArrowUpRight size={11}/></a> — recorded documents for this BBL, free.</li>}
        {links?.roll && <li><a href={links.roll} target="_blank" rel="noreferrer">{unit?.appraisalDistrict || 'Appraisal district'} property search <ArrowUpRight size={11}/></a> — property ID {key}.</li>}
        <li><a href={`https://www.google.com/search?q=${encodeURIComponent(`${unit?.county || ''} Texas county clerk real property records search`)}`} target="_blank" rel="noreferrer">County clerk records <ArrowUpRight size={11}/></a> — deeds and deeds of trust.</li>
      </ol>
      <button onClick={() => setOwnerOpen(false)}>Close</button>
    </div>}
    {onReport && <button className="report-button" onClick={report} disabled={units === null}><FileText size={15}/> Create report</button>}
    {viewPoint && <a className="street-view-button" href={streetViewUrl(viewPoint)} target="_blank" rel="noreferrer"><Eye size={15}/> Street View <ArrowUpRight size={13}/></a>}

    <div className="link-row">
      {zola ? <a href={zola} target="_blank" rel="noreferrer">ZoLa zoning <ArrowUpRight size={11}/></a> : links && <a href={links.zoning} target="_blank" rel="noreferrer">Zoning <ArrowUpRight size={11}/></a>}
      {bis && <a href={bis} target="_blank" rel="noreferrer">DOB permits & C of O <ArrowUpRight size={11}/></a>}
      {acris && <a href={acris} target="_blank" rel="noreferrer">ACRIS <ArrowUpRight size={11}/></a>}
      {links?.roll && <a href={links.roll} target="_blank" rel="noreferrer">Appraisal district <ArrowUpRight size={11}/></a>}
      <a href="https://msc.fema.gov/portal/search" target="_blank" rel="noreferrer">FEMA flood <ArrowUpRight size={11}/></a>
      <button onClick={copy}><Copy size={11}/>{copied ? 'Copied' : key}</button>
    </div>

    <p className="detail-foot">Appraisal roll: TxGIO StratMap Land Parcels ({unit?.appraisalDistrict || unit?.county || 'county'}). Texas is a non-disclosure state: sale prices are not public, and homestead appraised value is capped at 10% a year.</p>
  </section>;
}
