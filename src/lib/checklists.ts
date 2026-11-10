import type { LotSnapshot, PropertyFile } from './files';

// Worksheets and checklists for the reporting module, for Texas practice. They prepare a license holder's work;
// the TREC promulgated contract, the IABS notice and the Seller's Disclosure Notice are still signed on the official forms.

export interface Field { key: string; label: string; type?: 'text' | 'date' | 'number' | 'area'; hint?: string; side?: 'listing' | 'buyer' }

export const MANDATE_FIELDS: Field[] = [
  { key: 'clientName', label: 'Client name(s)' },
  { key: 'clientAddress', label: 'Client address' },
  { key: 'clientPhone', label: 'Client phone' },
  { key: 'clientEmail', label: 'Client email' },
  { key: 'entity', label: 'If an entity: legal name and signer', hint: 'Check the Texas Secretary of State (SOSDirect).' },
  { key: 'iabs', label: 'Information About Brokerage Services (IABS) given at first substantive contact' },
  { key: 'price', label: 'List price', type: 'number', side: 'listing' },
  { key: 'budget', label: 'Maximum price / budget', type: 'number', side: 'buyer' },
  { key: 'criteria', label: 'Search criteria (areas, school district, acreage, must-haves)', type: 'area', side: 'buyer' },
  { key: 'type', label: 'Listing agreement (TXR-1101 exclusive right to sell, or other)', side: 'listing' },
  { key: 'start', label: 'Agreement start', type: 'date' },
  { key: 'end', label: 'Agreement end', type: 'date' },
  { key: 'commission', label: 'Compensation and cooperating compensation' },
  { key: 'inclusions', label: 'Improvements and accessories conveyed', type: 'area', side: 'listing' },
  { key: 'exclusions', label: 'Exclusions', type: 'area', side: 'listing' },
  { key: 'minerals', label: 'Mineral, water and surface rights reserved or conveyed' },
  { key: 'mortgage', label: 'Liens, payoff, HOA transfer fees', side: 'listing' },
  { key: 'financing', label: 'Pre-approval (lender, amount) or proof of funds', side: 'buyer' },
  { key: 'title', label: 'Title company / escrow agent' },
  { key: 'other', label: 'Other conditions', type: 'area' }
];

export interface Topic { key: string; label: string; ask: string; hint?: (s: LotSnapshot) => string | '' }
const year = (s: LotSnapshot) => s.unit?.builtYear ?? null;

// Follows the TREC Seller's Disclosure Notice (Property Code §5.008).
export const DECLARATION_TOPICS: Topic[] = [
  { key: 'flood', label: 'Flooding & flood insurance', ask: 'Floodplain, flood pool, reservoir; prior flooding, flood claims or FEMA assistance; flood insurance carried?' },
  { key: 'foundation', label: 'Foundation', ask: 'Foundation repairs, cracks, slab leaks, piers, warranties transferable?' },
  { key: 'roof', label: 'Roof & hail', ask: 'Roof age, hail or wind damage, insurance claims, repairs?' },
  { key: 'water', label: 'Water penetration & mold', ask: 'Leaks, water damage, mold remediation?' },
  { key: 'systems', label: 'Plumbing, electrical & HVAC', ask: 'Polybutylene pipe, aluminum wiring, HVAC age, known defects?', hint: s => (year(s) ?? 2000) < 1990 ? 'Pre-1990: ask about aluminum wiring and cast-iron drains.' : '' },
  { key: 'pests', label: 'Termites & wood rot', ask: 'Active or previous termites, treatment, damage repaired?' },
  { key: 'septic', label: 'Water, septic & wells', ask: 'City water/sewer, well, on-site sewage facility (OSSF) permit and service history?' },
  { key: 'environment', label: 'Environmental', ask: 'Lead paint, asbestos, radon, landfill, underground tanks, wetlands, endangered species habitat?', hint: s => (year(s) ?? 2000) < 1978 ? 'Built before 1978: lead-based paint addendum (TREC OP-L) required.' : '' },
  { key: 'permits', label: 'Permits & additions', ask: 'Room additions or structural changes without permits; violations of deed restrictions or zoning?' },
  { key: 'hoa', label: 'HOA, MUD & PID', ask: 'HOA fees and transfer fees; Municipal Utility District or Public Improvement District assessments?' },
  { key: 'easements', label: 'Easements, encroachments & survey', ask: 'Unrecorded easements, encroachments, boundary disputes; existing survey (T-47 affidavit)?' },
  { key: 'minerals', label: 'Minerals & leases', ask: 'Oil, gas or mineral leases; wind/solar leases; water rights?' },
  { key: 'taxes', label: 'Taxes & exemptions', ask: 'Homestead, over-65, disabled veteran or ag (1-d-1) exemptions that change at sale; rollback taxes?' },
  { key: 'other', label: 'Anything else', ask: 'Any other condition that materially affects the health or safety of an individual or the value?' }
];

export interface Check { key: string; label: string; url?: string; hint?: string }
export const PREOFFER_CHECKS: Check[] = [
  { key: 'title', label: 'Title commitment ordered (Schedule B exceptions, liens)' },
  { key: 'survey', label: 'Survey or T-47 affidavit; matches the parcel map' },
  { key: 'roll', label: 'Appraisal district record checked (owner, values, exemptions)' },
  { key: 'comparables', label: 'Comparable sales pulled from the MLS (non-disclosure state)' },
  { key: 'zoning', label: 'Zoning or deed restrictions checked' },
  { key: 'permits', label: 'Permits and code cases searched with the city' },
  { key: 'flood', label: 'FEMA flood zone checked (and flood insurance quote)', url: 'https://msc.fema.gov/portal/search' },
  { key: 'environment', label: 'TCEQ records searched (contamination, OSSF)', url: 'https://www.tceq.texas.gov/agency/data/records-services' },
  { key: 'disclosure', label: 'Seller’s Disclosure Notice received and reviewed' },
  { key: 'lead', label: 'Lead-based paint addendum (built before 1978)' },
  { key: 'mud', label: 'MUD / PID notice (Water Code §49.452) if applicable' },
  { key: 'hoa', label: 'HOA addendum, resale certificate and subdivision information' },
  { key: 'inspection', label: 'Inspection within the option period' },
  { key: 'wdi', label: 'Wood-destroying insect inspection' },
  { key: 'minerals', label: 'Mineral reservations and leases reviewed' },
  { key: 'financing', label: 'Third-party financing addendum and appraisal' },
  { key: 'insurance', label: 'Homeowners and windstorm (TWIA on the coast) insurance quotes' },
  { key: 'taxes', label: 'Taxes estimated without the seller’s exemptions; rollback taxes on ag land' },
  { key: 'valuation', label: 'Price compared with the appraised market value' },
  { key: 'closing', label: 'Option fee, earnest money, closing and possession dates agreed' }
];

export const LISTING_FIELDS: Field[] = [
  { key: 'type', label: 'Property type' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'rooms', label: 'Bedrooms / bathrooms' },
  { key: 'parking', label: 'Garage / parking' },
  { key: 'school', label: 'School district' },
  { key: 'taxes', label: 'Annual taxes and tax rate' },
  { key: 'hoa', label: 'HOA / MUD / PID' },
  { key: 'flood', label: 'Flood zone' },
  { key: 'description', label: 'Public remarks', type: 'area' },
  { key: 'agentRemarks', label: 'Agent remarks', type: 'area' }
];

export const DOC_CATEGORIES = ['Listing / buyer agreement', 'IABS', 'Seller’s Disclosure Notice', 'Survey / T-47', 'Title commitment', 'Inspection', 'HOA / MUD documents', 'Photos', 'Contract & addenda', 'Other'];

// ---- pre-offer findings filled in from what the atlas already knows about the parcel ----

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export interface Finding { note: string; done?: boolean }
export function preofferFindings(f: PropertyFile): Record<string, Finding> {
  const s = f.snapshot, u = s.unit, out: Record<string, Finding> = {};
  const price = Number(f.mandate.price || f.listing.price || f.mandate.budget) || 0;
  if (u) out.roll = { note: [u.owner && `Owner: ${u.owner}`, u.use, u.builtYear && `built ${u.builtYear}`, u.marketValue ? `market ${money(u.marketValue)}` : 'values not shared statewide', u.appraisalDistrict, u.marketDate].filter(Boolean).join(' · ') + '.', done: true };
  out.survey = { note: `Property ID ${s.lot}${s.area ? ` · about ${Math.round(s.area * 10.7639).toLocaleString()} ft² on the parcel map` : ''}${u?.legal ? ` · legal: ${u.legal}` : ''}. Compare with the survey or T-47.` };
  out.comparables = { note: 'Texas does not disclose sale prices publicly: use MLS sold data.' };
  out.zoning = { note: /Houston/i.test(u?.muni || s.place) ? 'Houston has no zoning: check deed restrictions and city ordinances.' : `Check ${u?.muni ? `the City of ${u.muni[0] + u.muni.slice(1).toLowerCase()}` : 'the city'}’s zoning, or county rules outside city limits.` };
  if (u?.builtYear) out.lead = u.builtYear < 1978 ? { note: `Built ${u.builtYear}: lead-based paint addendum required.` } : { note: `Built ${u.builtYear}: lead-based paint addendum not required.`, done: true };
  if (u?.use && /open-space|ag/i.test(u.use)) out.taxes = { note: `${u.use}: ag valuation may end at sale — estimate rollback taxes.` };
  if (u?.marketValue) out.valuation = price
    ? { note: `Price ${money(price)} vs appraised market ${money(u.marketValue)}: ${price >= u.marketValue ? '+' : ''}${Math.round((price / u.marketValue - 1) * 100)}%.`, done: true }
    : { note: `Appraised market value ${money(u.marketValue)}. Enter the price in the agreement to compare.` };
  return out;
}
