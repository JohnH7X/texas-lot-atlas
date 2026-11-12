import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Eye, FileText, MapPin, X } from 'lucide-react';
import type { LotSnapshot } from '../lib/files';
import { useDrag } from '../lib/useDrag';
import { territoryAt, territoryLinks, type Territory, type TerritoryLinks } from '../lib/territory';
import { deedsAt, DEED_COUNTIES, infrastructureAt, type Deed, type Infra, FT_PER_M, lotArea, lotCenter, lotEdges, SQFT_PER_M2, streetViewUrl, unitsInLot, type LotFeature, type Unit } from '../lib/lots';

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
  // The chosen tab stays open as you move from parcel to parcel; the map reads it to tailor the hover label.
  const [tab, setTabState] = useState<'overview' | 'owner' | 'sales' | 'infra' | 'lot'>(() => (document.body.dataset.lotTab as 'sales') || 'overview');
  const setTab = (t: typeof tab) => { document.body.dataset.lotTab = t; setTabState(t); };
  useEffect(() => () => { delete document.body.dataset.lotTab; }, []);
  const [infra, setInfra] = useState<Infra | null | 'loading'>('loading');
  const [deeds, setDeeds] = useState<Deed[] | null>(null);
  useEffect(() => {
    let active = true; setInfra('loading');
    const c = lotCenter(lot);
    if (!c) { setInfra(null); return; }
    void infrastructureAt(c).then(r => { if (active) setInfra(r); }).catch(() => { if (active) setInfra(null); });
    return () => { active = false; };
  }, [lot]);
  useEffect(() => {
    let active = true; setDeeds(null);
    const c = lotCenter(lot), county = units?.[0]?.county;
    if (c && county && DEED_COUNTIES[county]) void deedsAt(county, c).then(r => { if (active) setDeeds(r); }).catch(() => {});
    return () => { active = false; };
  }, [units, lot]);
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
    setUnits(null);
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
      unit: unit ? { ...unit, infra: infra === 'loading' ? null : infra, deeds } : null, capturedAt: new Date().toISOString()
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

    {unit && <div className="tabs" role="tablist">{(['overview', 'owner', 'sales', 'infra', 'lot'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
      {t === 'overview' ? 'Overview' : t === 'owner' ? 'Owner' : t === 'sales' ? 'Sales' : t === 'infra' ? 'Utilities' : 'Lot'}</button>)}</div>}

    {unit && tab === 'overview' && <>
      <div className="value-hero"><span>Appraised market value</span><strong>{unit.marketValue ? money(unit.marketValue) : 'Not published'}</strong>
        <small>{unit.marketValue ? <>{unit.marketDate || 'Appraisal roll'} · {unit.appraisalDistrict || 'appraisal district'}</> : 'This appraisal district does not share values statewide — see its site.'}</small></div>
      <button className="owner-line as-link" onClick={() => setTab('owner')}><span>Owner of record</span><b>{unit.owner || 'Not published — see the appraisal district'}</b><small>Owner details →</small></button>
      {unit.marketValue ? <table className="appraisal"><tbody>
        <tr><th>Land value</th><td>{money(unit.landValue)}</td></tr>
        <tr><th>Improvements</th><td>{money(unit.buildingValue)}</td></tr>
        <tr className="sum"><th>Market value</th><td>{money(unit.marketValue)}</td></tr>
      </tbody></table> : null}
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
    </>}

    {unit && tab === 'owner' && <div className="tab-body">
      <div className="owner-line"><span>Owner of record</span><b>{unit.owner || 'Not published — see the appraisal district'}</b></div>
      <dl className="fact-grid">
        <div><dt>Mailing address</dt><dd>{unit.ownerMail || '—'}</dd></div>
        <div><dt>Property ID</dt><dd>{key}</dd></div>
        <div><dt>Appraisal district</dt><dd>{unit.appraisalDistrict || '—'}</dd></div>
        <div><dt>County</dt><dd>{unit.county || '—'}</dd></div>
        {deeds?.[0] && <div><dt>Last deed</dt><dd>{deeds[0].date}<small>{[deeds[0].kind, deeds[0].ref].filter(Boolean).join(' · ')}</small></dd></div>}
      </dl>
      {unit.legal && <p className="detail-foot">Legal description: {unit.legal}</p>}
      <ol className="owner-links">
        {acris && <li><a href={acris} target="_blank" rel="noreferrer">ACRIS deeds & mortgages <ArrowUpRight size={11}/></a> — recorded documents for this BBL, free.</li>}
        {links?.roll && <li><a href={links.roll} target="_blank" rel="noreferrer">{unit?.appraisalDistrict || 'Appraisal district'} property search <ArrowUpRight size={11}/></a> — property ID {key}.</li>}
        <li><a href={`https://www.google.com/search?q=${encodeURIComponent(`${unit?.county || ''} Texas county clerk real property records search`)}`} target="_blank" rel="noreferrer">County clerk records <ArrowUpRight size={11}/></a> — deeds and deeds of trust.</li>
      </ol>
      <p className="detail-foot">Owner on the appraisal district roll (TxGIO StratMap). Confirm the vesting deed in the county clerk’s real property records.</p>
    </div>}

    {unit && tab === 'sales' && <div className="tab-body">
      <div className="sales"><b>Sales & deed history</b>
        {deeds?.length ? deeds.map((d, i) => <div key={i}><span>{d.date}</span><strong>Last deed</strong><small>{[d.kind, d.ref].filter(Boolean).join(' · ')}</small></div>) : null}
        <p className="detail-foot">Texas is a non-disclosure state: sale prices are not public records. {deeds?.length ? `Last deed from the ${DEED_COUNTIES[unit.county || '']}. ` : ''}Every deed (dates, grantor, grantee) is in the <a href={`https://www.google.com/search?q=${encodeURIComponent(`${unit.county || ''} Texas county clerk real property records search`)}`} target="_blank" rel="noreferrer">county clerk’s records <ArrowUpRight size={10}/></a>; sold prices come from the MLS.</p>
      </div>
    </div>}

    {unit && tab === 'infra' && <div className="tab-body infra">
        {infra === 'loading' ? <p className="detail-note">Checking utilities…</p> : <ul>
          <li className={infra?.water.length ? 'ok' : 'q'}><span>Water</span><b>{infra?.water.length ? infra.water.join(', ') : 'No CCN — city utility or well'}</b></li>
          <li className={infra?.sewer.length ? 'ok' : 'q'}><span>Sewer</span><b>{infra?.sewer.length ? infra.sewer.join(', ') : 'No CCN — city sewer or septic'}</b></li>
          <li className={infra?.electric.length ? 'ok' : 'q'}><span>Electric</span><b>{infra?.electric.length ? <>{infra.electric.join(', ')}{infra.electric.length > 1 && <small> (utilities serving this area — confirm which serves the lot)</small>}</> : 'Check with the utility'}</b></li>
          <li className={infra?.mud ? 'warn' : 'q'}><span>Districts</span><b>{infra?.districts.length ? infra.districts.map(d => `${d.name}`).join(' · ') : 'None mapped'}{infra?.mud && <small> MUD notice required · extra district tax</small>}</b></li>
          <li className="q"><span>Internet</span><b>{viewPoint && <a href={`https://broadbandmap.fcc.gov/location-summary/fixed?lat=${viewPoint[1]}&lon=${viewPoint[0]}&zoom=17`} target="_blank" rel="noreferrer">FCC broadband map <ArrowUpRight size={10}/></a>}</b></li>
          <li className="q"><span>Gas · road · drainage · fees</span><b>Confirm with utilities and the city or county</b></li>
        </ul>}
        <p className="detail-foot">Water and sewer: PUCT certificated service areas (CCN). Cities often serve without a CCN. Districts: TCEQ water districts. Electric: EIA service territories (HIFLD). Full checklist in the property file.</p>
    </div>}

    {(tab === 'lot' || !unit) && <div className="tab-body">
      {!unit && area !== null && <dl className="fact-grid"><div><dt>Lot area (drawing)</dt><dd>{sqft(area, true)}</dd></div></dl>}
      {edges.length > 0 && <>
      <dl className="fact-grid">
        {unit?.frontage != null && <div><dt>Frontage (roll)</dt><dd>{len(unit.frontage)}</dd></div>}
        {unit?.depth != null && <div><dt>Depth (roll)</dt><dd>{len(unit.depth)}</dd></div>}
        <div><dt>Perimeter</dt><dd>{len(perimeter)}</dd></div>
        <div><dt>Sides</dt><dd>{edges.length}</dd></div>
      </dl>
      <ol className="side-list">{edges.map((e, i) => <li key={i}><span>Side {i + 1}</span><strong>{(e.length * FT_PER_M).toFixed(1)} ft</strong><small>{e.length.toFixed(1)} m</small></li>)}</ol>
      <p className="detail-foot">Sides are measured on the county parcel map drawing, not a survey.</p>
      </>}
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
