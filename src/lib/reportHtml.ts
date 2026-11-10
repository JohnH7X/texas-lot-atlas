import { FT_PER_M, SQFT_PER_M2 } from './lots';
import { satelliteFrame, type PropertyFile, type Settings } from './files';
import { DECLARATION_TOPICS, MANDATE_FIELDS, PREOFFER_CHECKS, LISTING_FIELDS } from './checklists';

// Printable HTML documents for a property file: the branded report and the worksheets.

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (v: number | null | undefined) => v == null ? '—' : usd.format(v);
const area = (m2: number | null | undefined) => m2 == null ? '—' : `${n.format(m2 * SQFT_PER_M2)} ft² (${n.format(m2)} m²)`;
const len = (m: number | null | undefined) => m == null ? '—' : `${(m * FT_PER_M).toFixed(1)} ft (${m.toFixed(1)} m)`;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function shell(title: string, s: Settings, body: string) {
  const c = esc(s.color || '#1d3924');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:letter;margin:16mm}*{box-sizing:border-box}body{margin:0;font:13px/1.5 'Helvetica Neue',Arial,sans-serif;color:#1d2420;background:#fff}
  .page{max-width:780px;margin:0 auto;padding:28px}
  .brand{display:flex;align-items:center;gap:16px;border-bottom:3px solid ${c};padding-bottom:14px;margin-bottom:20px}
  .brand img{max-height:56px;max-width:160px}.brand .who{margin-left:auto;text-align:right;font-size:12px;color:#55605a}.brand .who b{display:block;color:#1d2420;font-size:14px}
  h1{font-size:24px;margin:0 0 2px}h2{font-size:15px;color:${c};text-transform:uppercase;letter-spacing:.06em;margin:26px 0 8px;border-bottom:1px solid #dfe5dc;padding-bottom:4px;break-after:avoid}
  .sub{color:#55605a;margin:0}table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eef1ec;text-align:left;vertical-align:top}th{width:38%;color:#55605a;font-weight:500}
  .hero{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.hero div{background:#f4f7f2;border-radius:8px;padding:10px 12px}.hero span{display:block;font-size:11px;color:#55605a;text-transform:uppercase;letter-spacing:.05em}.hero b{font-size:18px}
  .sat{position:relative;margin-top:8px;border-radius:8px;overflow:hidden;line-height:0;background:#222;width:720px;max-width:100%}.sat .tiles{position:absolute;left:0;top:0}.sat .tiles img{position:absolute;width:256px;height:256px}.sat svg{position:absolute;inset:0;width:100%;height:100%}
  .ok{color:#2c7a45;font-weight:600}.todo{color:#a3541c;font-weight:600}a{color:${c}}
  .box{border:1px solid #cfd8cc;border-radius:6px;min-height:22px;padding:5px 8px}.small{font-size:11px;color:#6b756e}
  .foot{margin-top:28px;border-top:1px solid #dfe5dc;padding-top:10px;font-size:10.5px;color:#6b756e}
  .noprint{position:sticky;top:0;background:#fff;padding:10px 0;text-align:right}.noprint button{font:600 13px sans-serif;background:${c};color:#fff;border:0;border-radius:6px;padding:9px 16px;cursor:pointer}
  @media print{.noprint{display:none}.page{padding:0}}
  </style></head><body><div class="page"><div class="noprint"><button onclick="print()">Print / Save as PDF</button></div>
  <div class="brand">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : ''}<div><b style="font-size:16px">${esc(s.agency || 'Property file')}</b></div>
  <div class="who">${s.broker ? `<b>${esc(s.broker)}</b>${esc(s.title)}` : ''}${s.licence ? `<br>Licence ${esc(s.licence)}` : ''}${s.phone ? `<br>${esc(s.phone)}` : ''}${s.email ? ` · ${esc(s.email)}` : ''}</div></div>
  ${body}</div></body></html>`;
}

function head(f: PropertyFile, kind: string) {
  const s = f.snapshot;
  return `<p class="sub">${esc(kind)} · ${date(new Date().toISOString())}</p><h1>${esc(s.address || `Parcel ${s.lot}`)}</h1><p class="sub">Parcel ${esc(s.lot)}${s.place ? ` · ${esc(s.place)}` : ''}${f.client ? ` · Client: ${esc(f.client)}` : ''}</p>`;
}

export function reportHtml(f: PropertyFile, settings: Settings) {
  const s = f.snapshot, u = s.unit;
  const sat = satelliteFrame(s.rings);
  const depth = u?.depth ?? (u?.frontage && (u.landArea ?? s.area) ? (u.landArea ?? s.area)! / u.frontage : null);
  const done = PREOFFER_CHECKS.filter(c => f.checks[c.key]).length;
  const declared = DECLARATION_TOPICS.filter(t => f.declaration[t.key]?.answer);
  const flagged = DECLARATION_TOPICS.filter(t => f.declaration[t.key]?.answer === 'yes');
  const hints = DECLARATION_TOPICS.map(t => t.hint?.(s)).filter(Boolean);
  const sources = [
    ['Appraisal district', s.rollUrl], ['Zoning', s.zoneGrid || s.zoningUrl],
    ['FEMA flood map', 'https://msc.fema.gov/portal/search'], ['TCEQ records', 'https://www.tceq.texas.gov/agency/data/records-services'],
    ['Texas Water Development Board (flood)', 'https://www.twdb.texas.gov/flood/'], ['SOSDirect (entity owners)', 'https://www.sos.state.tx.us/corp/sosda/'],
    ['Street View', s.center ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.center[1]},${s.center[0]}` : '']
  ].filter(([, url]) => url);

  const body = `${head(f, 'Property report')}
  ${u ? `<div class="hero"><div><span>Appraised market value</span><b>${u.marketValue ? money(u.marketValue) : 'Not shared'}</b></div><div><span>Land / improvements</span><b style="font-size:14px">${money(u.landValue)} / ${money(u.buildingValue)}</b></div><div><span>Owner of record</span><b style="font-size:13px">${esc(u.owner || '—')}</b></div></div>` : ''}
  <h2>1. Identification</h2><table>
  <tr><th>Civic address</th><td>${esc(s.address || '—')}</td></tr><tr><th>Appraisal district property ID</th><td>${esc(s.lot)}</td></tr>
  <tr><th>City / county</th><td>${esc(s.place || '—')}</td></tr><tr><th>Legal description</th><td>${esc(u?.legal || '—')}</td></tr>
  <tr><th>Owner of record</th><td>${esc(u?.owner || '—')}${u?.ownerMail ? `<br><span class="small">${esc(u.ownerMail)}</span>` : ''}</td></tr><tr><th>Appraisal district</th><td>${esc(u?.appraisalDistrict || '—')}</td></tr>
  <tr><th>Coordinates</th><td>${s.center ? `${s.center[1].toFixed(6)}, ${s.center[0].toFixed(6)}` : '—'}</td></tr></table>
  ${sat ? `<h2>2. Site</h2><div class="sat" style="aspect-ratio:${sat.w}/${sat.h}"><div class="tiles" style="width:${sat.w}px;height:${sat.h}px">${sat.tiles.map(t => `<img src="${t.url}" alt="" style="left:${t.x.toFixed(0)}px;top:${t.y.toFixed(0)}px">`).join('')}</div><svg viewBox="0 0 ${sat.w} ${sat.h}" preserveAspectRatio="none">${sat.paths.map(p => `<polygon points="${p}" fill="rgba(242,201,76,.18)" stroke="#f2c94c" stroke-width="3"/>`).join('')}</svg></div><p class="small">Imagery © Esri, Maxar, Earthstar Geographics. Outline: county parcel map drawing, not a survey.</p>` : ''}
  <h2>3. Assessment roll${u?.marketDate ? ` (${esc(u.marketDate)})` : ''}</h2>${u ? `<table>
  <tr><th>Market value</th><td><b>${u.marketValue ? money(u.marketValue) : 'Not shared statewide'}</b></td></tr><tr><th>Land value</th><td>${money(u.landValue)}</td></tr>
  <tr><th>Improvement value</th><td>${money(u.buildingValue)}</td></tr><tr><th>Category</th><td>${esc(u.use || '—')}</td></tr></table><p class="small">Texas is a non-disclosure state: sale prices are not public.</p>` : '<p>No appraisal record for this parcel. Check with the appraisal district.</p>'}
  <h2>4. Building</h2><table>
  <tr><th>Year built</th><td>${u?.builtYear ?? '—'}</td></tr>
  <tr><th>Floors</th><td>${u?.floors ?? '—'}</td></tr><tr><th>Residential units</th><td>${u?.dwellings ?? '—'}</td></tr><tr><th>Living area</th><td>${area(u?.floorArea)}</td></tr></table>
  <h2>5. Land & measurements</h2><table>
  <tr><th>Lot area</th><td>${area(u?.landArea ?? s.area)}</td></tr><tr><th>Frontage (roll)</th><td>${len(u?.frontage)}</td></tr><tr><th>Depth</th><td>${len(depth)}</td></tr>
  <tr><th>Perimeter (drawing)</th><td>${len(s.perimeter)}</td></tr><tr><th>Sides (drawing)</th><td>${s.sides.map((m, i) => `${i + 1}: ${m.toFixed(1)} m`).join(' · ') || '—'}</td></tr></table>
  <h2>6. Zoning</h2><table><tr><th>District</th><td>${esc(s.zone || 'Set by the city (Houston has none) — not in statewide open data')}</td></tr>${u?.far ? `<tr><th>FAR</th><td>${esc(u.far)}</td></tr>` : ''}${u?.landmark || u?.histDistrict ? `<tr><th>Landmark</th><td>${esc([u.landmark, u.histDistrict].filter(Boolean).join(' · '))}</td></tr>` : ''}${u?.agDistrict ? `<tr><th>Agricultural district</th><td>${esc(u.agDistrict)}</td></tr>` : ''}${s.zoneGrid ? `<tr><th>Zoning map</th><td><a href="${esc(s.zoneGrid)}">${esc(s.zoneGrid)}</a></td></tr>` : ''}${s.zoningUrl ? `<tr><th>Zoning code</th><td><a href="${esc(s.zoningUrl)}">${esc(s.zoningUrl)}</a></td></tr>` : ''}</table>
  <h2>7. Points to verify</h2>${hints.length ? `<ul>${hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : '<p>No age- or type-based flags from open data.</p>'}
  ${declared.length ? `<p>Seller’s disclosure: ${declared.length} of ${DECLARATION_TOPICS.length} topics answered${flagged.length ? `; “yes” on <b>${flagged.map(t => esc(t.label)).join(', ')}</b>` : ''}.</p>` : ''}
  <h2>8. Due diligence status</h2><p>${done} of ${PREOFFER_CHECKS.length} pre-offer checks completed.</p><table>${PREOFFER_CHECKS.map(c => `<tr><td style="width:90px">${f.checks[c.key] ? '<span class="ok">Done</span>' : '<span class="todo">To do</span>'}</td><td>${esc(c.label)}${f.checkNotes?.[c.key] ? `<br><small style="color:#555">${esc(f.checkNotes[c.key])}</small>` : ''}</td></tr>`).join('')}</table>
  <h2>9. Primary sources</h2><table>${sources.map(([l, url]) => `<tr><th>${esc(l)}</th><td><a href="${esc(url)}">${esc(url)}</a></td></tr>`).join('')}</table>
  ${f.notes ? `<h2>Broker notes</h2><p>${esc(f.notes).replace(/\n/g, '<br>')}</p>` : ''}
  <div class="foot">Prepared ${date(new Date().toISOString())} from public open data captured ${date(s.capturedAt)}: county appraisal district rolls and parcel maps (TxGIO StratMap Land Parcels). This report is a screening tool. It is not a survey, a title search, an inspection, an appraisal or legal advice. Verify every item with the primary source before relying on it. Made with the Texas Lot Atlas · garabedian.ai</div>`;
  return shell(`Report · ${s.address || s.lot}`, settings, body);
}

export function mandateHtml(f: PropertyFile, settings: Settings) {
  const fields = MANDATE_FIELDS.filter(x => !x.side || x.side === f.side);
  const body = `${head(f, f.side === 'listing' ? 'Listing agreement worksheet' : 'Buyer agency agreement worksheet')}
  <p class="small">Information gathered for the listing or buyer agreement and the IABS notice. This worksheet does not replace the signed forms.</p>
  <h2>Property</h2><table><tr><th>Address</th><td>${esc(f.snapshot.address || '—')}</td></tr><tr><th>Property ID</th><td>${esc(f.snapshot.lot)}</td></tr><tr><th>Owner of record</th><td>${esc(f.snapshot.unit?.owner || '—')}</td></tr><tr><th>Appraised market value</th><td>${money(f.snapshot.unit?.marketValue)}</td></tr></table>
  <h2>Agreement details</h2><table>${fields.map(x => `<tr><th>${esc(x.label)}</th><td><div class="box">${esc(f.mandate[x.key] || '').replace(/\n/g, '<br>')}</div></td></tr>`).join('')}</table>`;
  return shell('Agreement worksheet', settings, body);
}

export function declarationHtml(f: PropertyFile, settings: Settings) {
  const label = { yes: 'Yes', no: 'No', unknown: 'Don’t know', '': '—' };
  const body = `${head(f, 'Seller’s Disclosure Notice · interview notes')}
  <p class="small">Notes from the seller interview, to help complete the TREC Seller’s Disclosure Notice (Property Code §5.008), including the flood questions. The seller signs the official form.</p>
  <table>${DECLARATION_TOPICS.map(t => { const a = f.declaration[t.key] || { answer: '', details: '' }; const h = t.hint?.(f.snapshot); return `<tr><th><b>${esc(t.label)}</b><br><span class="small">${esc(t.ask)}</span>${h ? `<br><span class="small" style="color:#a3541c">${esc(h)}</span>` : ''}</th><td><b>${label[a.answer]}</b>${a.details ? `<br>${esc(a.details).replace(/\n/g, '<br>')}` : ''}</td></tr>`; }).join('')}</table>`;
  return shell('Disclosure notes', settings, body);
}

export function listingText(f: PropertyFile) {
  const s = f.snapshot, u = s.unit;
  const rows: [string, string][] = [
    ['Address', s.address], ['Property ID', s.lot], ['City / county', s.place], ['Legal', u?.legal || ''], ['Year built', String(u?.builtYear ?? '')],
    ['Lot area', u?.landArea ?? s.area ? `${n.format((u?.landArea ?? s.area)! * SQFT_PER_M2)} sq ft` : ''], ['Living area', u?.floorArea ? `${n.format(u.floorArea * SQFT_PER_M2)} sq ft` : ''],
    ['Frontage', u?.frontage ? `${(u.frontage * FT_PER_M).toFixed(1)} ft` : ''], ['Floors', String(u?.floors ?? '')], ['Units', String(u?.dwellings ?? '')],
    ['Appraised value', u?.marketValue ? money(u.marketValue) : ''], ['Appraisal district', u?.appraisalDistrict || ''],
    ['Zoning', s.zone], ...LISTING_FIELDS.map(x => [x.label, f.listing[x.key] || ''] as [string, string])
  ];
  return rows.filter(([, v]) => v);
}
