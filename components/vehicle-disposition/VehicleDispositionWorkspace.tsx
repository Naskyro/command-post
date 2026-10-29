'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Car, Plus, ChevronLeft, AlertTriangle, Calendar, RefreshCw,
  CheckCircle, X, DollarSign, ShieldCheck, FileText, Upload,
} from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import { money } from '@/lib/finance/model';
import '@/components/finance/finance.css';
import '@/components/finance/timeclock.css';

const STATUSES = ['intake', 'notices', 'tcso', 'listed', 'sold', 'scrapped'];
const STATUS_LABELS: Record<string, string> = {
  intake: 'Intake', notices: 'Notices', tcso: 'TCSO / VTR', listed: 'Listed', sold: 'Sold', scrapped: 'Scrapped'
};
const DISPOSITIONS = ['pending', 'retail', 'auction', 'part_out', 'scrap', 'sold'];
const DISPOSITION_LABELS: Record<string, string> = {
  pending: 'Pending', retail: 'Retail sale', auction: 'Auction', part_out: 'Part out', scrap: 'Scrap', sold: 'Sold'
};
const PLATFORMS = ['Facebook Marketplace', 'Private buyer', 'Auction', 'Parts buyer', 'Scrap yard', 'Other'];

type Vehicle = Record<string, unknown>;

function fmtDate(s: unknown) {
  if (!s) return '—';
  try { return new Date(String(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(s); }
}
function StatusBadge({ status }: { status: unknown }) {
  const s = String(status || 'intake');
  const cls = /sold|scrapped/.test(s) ? 'green' : /listed|tcso/.test(s) ? 'amber' : '';
  return <span className={`f-badge ${cls}`}>{STATUS_LABELS[s] || s}</span>;
}
function DispositionBadge({ d }: { d: unknown }) {
  if (!d) return null;
  const s = String(d);
  return <span className="f-badge">{DISPOSITION_LABELS[s] || s}</span>;
}
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="f-field">
      <span className="f-eyebrow">{label}</span>
      <span>{value ?? <em style={{ opacity: 0.4 }}>—</em>}</span>
    </div>
  );
}

export default function VehicleDispositionWorkspace() {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [editPatch, setEditPatch] = useState<Record<string, unknown>>({});
  const [patchBusy, setPatchBusy] = useState(false);

  const [form, setForm] = useState({
    vin: '', license_plate: '', license_plate_state: 'TX', year: '',
    make: '', model: '', color: '', mileage: '',
    has_keys: false, runs: false, condition_notes: '',
    towbook_call_number: '', assigned_to: '', status: 'intake',
  });

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '100');
      const res = await requestJson<{ vehicles: Vehicle[] }>(`/api/vehicles?${params}`);
      setVehicles(res.vehicles || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setError('');
    try {
      const res = await requestJson<{ vehicle: Vehicle }>(`/api/vehicles/${id}`);
      setSelected(res.vehicle);
      setEditPatch({});
      setView('detail');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const num = (k: string) => form[k as keyof typeof form] !== '' ? Number(form[k as keyof typeof form]) : undefined;
      const str = (k: string) => form[k as keyof typeof form] ? String(form[k as keyof typeof form]) : undefined;
      const result = await requestJson<{ id: string }>('/api/vehicles', {
        vin: str('vin') || undefined,
        license_plate: str('license_plate') || undefined,
        license_plate_state: str('license_plate_state'),
        year: num('year'),
        make: str('make'),
        model: str('model'),
        color: str('color'),
        mileage: num('mileage'),
        has_keys: form.has_keys,
        runs: form.runs,
        condition_notes: str('condition_notes'),
        towbook_call_number: str('towbook_call_number'),
        assigned_to: str('assigned_to'),
        status: form.status,
      });
      setSuccess('Vehicle record created.');
      setForm({ vin: '', license_plate: '', license_plate_state: 'TX', year: '', make: '', model: '', color: '', mileage: '', has_keys: false, runs: false, condition_notes: '', towbook_call_number: '', assigned_to: '', status: 'intake' });
      await load();
      setView('list');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!selected || !Object.keys(editPatch).length) return;
    setPatchBusy(true);
    setError('');
    try {
      const id = String(selected.id);
      const version = Number(selected.version || 1);
      await requestJson(`/api/vehicles/${id}`, { ...editPatch, version }, 'PATCH');
      await openDetail(id);
      setSuccess('Vehicle updated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPatchBusy(false);
    }
  };

  const approveDisposition = async (disposition: string) => {
    if (!selected) return;
    setPatchBusy(true);
    setError('');
    try {
      await requestJson(`/api/vehicles/${selected.id}`, {
        action: 'approve',
        approved_disposition: disposition,
        version: Number(selected.version || 1),
      }, 'PATCH');
      await openDetail(String(selected.id));
      setSuccess(`Disposition approved: ${DISPOSITION_LABELS[disposition] || disposition}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPatchBusy(false);
    }
  };

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const patch = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditPatch(prev => ({ ...prev, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="f-workspace">
      <header className="f-heading">
        <h1><Car size={20} style={{ verticalAlign: 'middle' }} /> Vehicle Disposition & Sales</h1>
        <button className="f-button primary" onClick={() => { setError(''); setSuccess(''); setView('create'); }}>
          <Plus size={16} /> Add vehicle
        </button>
      </header>

      {success && <div className="f-toast-inline"><CheckCircle size={15} />{success}<button className="f-icon" onClick={() => setSuccess('')}><X size={13} /></button></div>}
      {error && <p className="f-error">{error}</p>}

      <div className="f-toolbar">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <button className="f-button" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <section className="f-card">
        <div className="tc-table-wrap" style={{ maxHeight: '65vh', overflow: 'auto' }}>
          <table className="tc-table">
            <thead>
              <tr>
                <th>Vehicle</th><th>VIN</th><th>Plate</th><th>Status</th>
                <th>First notice</th><th>Second notice</th><th>VTR-265</th>
                <th>Disposition</th><th>Sale price</th><th>Net recovery</th><th></th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--f-muted)' }}>
                  No vehicle records found
                </td></tr>
              )}
              {vehicles.map(v => (
                <tr key={String(v.id)} style={{ cursor: 'pointer' }} onClick={() => void openDetail(String(v.id))}>
                  <td><b>{[v.year, v.make, v.model].filter(Boolean).join(' ')}</b>{v.color ? <small> {String(v.color)}</small> : null}</td>
                  <td><small>{String(v.vin || '—')}</small></td>
                  <td>{v.license_plate ? <>{String(v.license_plate)}{v.license_plate_state ? ` (${v.license_plate_state})` : ''}</> : '—'}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td><small>{fmtDate(v.first_notice_date)}</small></td>
                  <td><small>{fmtDate(v.second_notice_due_date)}</small></td>
                  <td>{v.vtr_265_picked_up ? <CheckCircle size={14} style={{ color: 'green' }} /> : '—'}</td>
                  <td><DispositionBadge d={v.approved_disposition || v.recommended_disposition} /></td>
                  <td>{v.sale_price ? <b>{money(v.sale_price)}</b> : '—'}</td>
                  <td>{v.net_recovery != null ? <b>{money(v.net_recovery)}</b> : '—'}</td>
                  <td><ChevronLeft size={15} style={{ transform: 'rotate(180deg)', opacity: 0.4 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (view === 'create') return (
    <div className="f-workspace">
      <header className="f-heading">
        <h1><Car size={20} style={{ verticalAlign: 'middle' }} /> Add vehicle record</h1>
        <button className="f-button" onClick={() => setView('list')}><ChevronLeft size={16} /> Back</button>
      </header>
      {error && <p className="f-error">{error}</p>}
      <section className="f-card" style={{ maxWidth: 720 }}>
        <form onSubmit={submitCreate} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <h3 style={{ fontSize: '0.82rem', color: 'var(--f-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle identity</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label className="f-label"><span>Year</span><input type="number" min="1980" max={new Date().getFullYear() + 2} value={form.year} onChange={f('year')} placeholder="e.g. 2017" /></label>
            <label className="f-label"><span>Make</span><input type="text" value={form.make} onChange={f('make')} placeholder="Nissan" /></label>
            <label className="f-label"><span>Model</span><input type="text" value={form.model} onChange={f('model')} placeholder="Altima" /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label className="f-label"><span>Color</span><input type="text" value={form.color} onChange={f('color')} placeholder="Silver" /></label>
            <label className="f-label"><span>Mileage</span><input type="number" min={0} value={form.mileage} onChange={f('mileage')} placeholder="e.g. 98000" /></label>
            <label className="f-label"><span>Towbook call #</span><input type="text" value={form.towbook_call_number} onChange={f('towbook_call_number')} placeholder="Towbook reference" /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <label className="f-label"><span>VIN</span><input type="text" value={form.vin} onChange={f('vin')} placeholder="Vehicle identification number" /></label>
            <label className="f-label"><span>License plate</span><input type="text" value={form.license_plate} onChange={f('license_plate')} placeholder="Plate number" /></label>
            <label className="f-label"><span>Plate state</span>
              <select value={form.license_plate_state} onChange={f('license_plate_state')}>
                {['TX','OK','AR','LA','NM','Other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.has_keys} onChange={f('has_keys')} /> Has keys
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.runs} onChange={f('runs')} /> Runs
            </label>
            <label className="f-label" style={{ flex: 1 }}><span>Status</span>
              <select value={form.status} onChange={f('status')}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </label>
          </div>
          <label className="f-label"><span>Condition notes</span>
            <textarea rows={3} value={form.condition_notes} onChange={f('condition_notes')} placeholder="Damage, missing parts, interior condition…" />
          </label>

          <h3 style={{ fontSize: '0.82rem', color: 'var(--f-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignment</h3>
          <label className="f-label"><span>Assigned to</span>
            <input type="text" value={form.assigned_to} onChange={f('assigned_to')} placeholder="Employee name or ID" />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="f-button primary" disabled={loading}>
              {loading ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />} Save vehicle
            </button>
            <button type="button" className="f-button" onClick={() => setView('list')}>Cancel</button>
          </div>
        </form>
      </section>
    </div>
  );

  // ── DETAIL ────────────────────────────────────────────────────────────────
  const v = selected!;
  const patched = { ...v, ...editPatch } as Vehicle;
  const net = v.net_recovery != null ? Number(v.net_recovery) : null;
  const totalCosts = ['towing_cost','storage_cost','listing_cost','marketing_cost','commission','other_costs']
    .reduce((s, k) => s + (Number(v[k]) || 0), 0);

  return (
    <div className="f-workspace">
      <header className="f-heading">
        <h1><Car size={20} style={{ verticalAlign: 'middle' }} /> {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle record'}</h1>
        <button className="f-button" onClick={() => { setSelected(null); setView('list'); }}><ChevronLeft size={16} /> All vehicles</button>
      </header>

      {success && <div className="f-toast-inline"><CheckCircle size={15} />{success}<button className="f-icon" onClick={() => setSuccess('')}><X size={13} /></button></div>}
      {error && <p className="f-error">{error}</p>}

      {/* Status + identity */}
      <section className="f-card">
        <header>
          <h2><FileText size={17} style={{ verticalAlign: 'middle' }} /> Vehicle record</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <StatusBadge status={v.status} />
            {v.approved_disposition ? <DispositionBadge d={v.approved_disposition} /> : v.recommended_disposition ? <DispositionBadge d={v.recommended_disposition} /> : null}
          </div>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', padding: '1rem 1.5rem' }}>
          <Field label="VIN" value={String(v.vin || '—')} />
          <Field label="License plate" value={v.license_plate ? `${v.license_plate} (${v.license_plate_state || 'TX'})` : '—'} />
          <Field label="Year / Make / Model" value={[v.year, v.make, v.model].filter(Boolean).join(' ')} />
          <Field label="Color" value={String(v.color || '—')} />
          <Field label="Mileage" value={v.mileage ? Number(v.mileage).toLocaleString() : '—'} />
          <Field label="Keys / Runs" value={`${v.has_keys ? 'Keys ✓' : 'No keys'} · ${v.runs ? 'Runs ✓' : 'No start'}`} />
          <Field label="Towbook call #" value={String(v.towbook_call_number || '—')} />
          <Field label="Assigned to" value={String(v.assigned_to || '—')} />
        </div>
        {v.condition_notes ? <p style={{ padding: '0 1.5rem 1rem', fontSize: '0.85rem', color: 'var(--f-muted)' }}>{String(v.condition_notes)}</p> : null}
      </section>

      {/* Notices */}
      <section className="f-card">
        <header><h2><Calendar size={17} style={{ verticalAlign: 'middle' }} /> Notices</h2></header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', padding: '1rem 1.5rem' }}>
          <label className="f-label"><span>First notice date</span><input type="date" value={String(patched.first_notice_date || '')} onChange={patch('first_notice_date')} /></label>
          <label className="f-label"><span>First notice sent by</span><input type="text" value={String(patched.first_notice_sent_by || '')} onChange={patch('first_notice_sent_by')} placeholder="Who sent it" /></label>
          <label className="f-label"><span>Second notice date</span><input type="date" value={String(patched.second_notice_date || '')} onChange={patch('second_notice_date')} /></label>
          <label className="f-label"><span>Second notice due</span><input type="date" value={String(patched.second_notice_due_date || '')} onChange={patch('second_notice_due_date')} /></label>
        </div>
      </section>

      {/* VTR-265 */}
      <section className="f-card">
        <header><h2><ShieldCheck size={17} style={{ verticalAlign: 'middle' }} /> VTR-265 / TCSO</h2></header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', padding: '1rem 1.5rem' }}>
          <label className="f-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(patched.vtr_265_picked_up)} onChange={patch('vtr_265_picked_up')} /> VTR-265 picked up
          </label>
          <label className="f-label"><span>Pickup date</span><input type="date" value={String(patched.vtr_265_pickup_date || '')} onChange={patch('vtr_265_pickup_date')} /></label>
          <label className="f-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(patched.released_from_towbook)} onChange={patch('released_from_towbook')} /> Released from Towbook
          </label>
        </div>
      </section>

      {/* Disposition */}
      <section className="f-card">
        <header><h2><AlertTriangle size={17} style={{ verticalAlign: 'middle' }} /> Disposition</h2></header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', padding: '1rem 1.5rem' }}>
          <label className="f-label"><span>Recommended disposition</span>
            <select value={String(patched.recommended_disposition || '')} onChange={patch('recommended_disposition')}>
              <option value="">Not set</option>
              {DISPOSITIONS.map(d => <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>)}
            </select>
          </label>
          <label className="f-label"><span>Retail estimate ($)</span><input type="number" min={0} step={0.01} value={String(patched.retail_estimate || '')} onChange={patch('retail_estimate')} /></label>
          <label className="f-label"><span>Auction estimate ($)</span><input type="number" min={0} step={0.01} value={String(patched.auction_estimate || '')} onChange={patch('auction_estimate')} /></label>
          <label className="f-label"><span>Part-out estimate ($)</span><input type="number" min={0} step={0.01} value={String(patched.part_out_estimate || '')} onChange={patch('part_out_estimate')} /></label>
          <label className="f-label"><span>Scrap estimate ($)</span><input type="number" min={0} step={0.01} value={String(patched.scrap_estimate || '')} onChange={patch('scrap_estimate')} /></label>
        </div>
        <div style={{ padding: '0 1.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--f-muted)' }}>Approve disposition:</span>
          {DISPOSITIONS.filter(d => d !== 'pending' && d !== 'sold').map(d => (
            <button key={d} className="f-button" style={{ fontSize: '0.8rem' }} disabled={patchBusy}
              onClick={() => void approveDisposition(d)}>
              {DISPOSITION_LABELS[d]}
            </button>
          ))}
        </div>
      </section>

      {/* Sale */}
      <section className="f-card">
        <header><h2><DollarSign size={17} style={{ verticalAlign: 'middle' }} /> Sale & costs</h2></header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', padding: '1rem 1.5rem' }}>
          <label className="f-label"><span>Sale price ($)</span><input type="number" min={0} step={0.01} value={String(patched.sale_price || '')} onChange={patch('sale_price')} /></label>
          <label className="f-label"><span>Sale platform</span>
            <select value={String(patched.sale_platform || '')} onChange={patch('sale_platform')}>
              <option value="">Not set</option>
              {PLATFORMS.map(p => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="f-label"><span>Buyer name</span><input type="text" value={String(patched.buyer_name || '')} onChange={patch('buyer_name')} /></label>
          <label className="f-label"><span>Sale date</span><input type="date" value={String(patched.sale_date || '')} onChange={patch('sale_date')} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', padding: '0 1.5rem 1rem' }}>
          {(['towing_cost','storage_cost','listing_cost','marketing_cost','commission','other_costs'] as const).map(k => (
            <label key={k} className="f-label">
              <span>{k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())} ($)</span>
              <input type="number" min={0} step={0.01} value={String(patched[k] || '')} onChange={patch(k)} />
            </label>
          ))}
        </div>
        <div style={{ padding: '0 1.5rem 1rem', display: 'flex', gap: '2rem' }}>
          <span style={{ fontSize: '0.85rem' }}>Total costs: <b>{money(totalCosts)}</b></span>
          <span style={{ fontSize: '0.85rem' }}>Net recovery: <b style={{ color: net != null && net < 0 ? '#e05252' : 'inherit' }}>{net != null ? money(net) : '—'}</b></span>
          {v.days_on_market != null && <span style={{ fontSize: '0.85rem' }}>Days on market: <b>{String(v.days_on_market)}</b></span>}
        </div>
      </section>

      {/* Status update + save */}
      <section className="f-card">
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '1rem 1.5rem', flexWrap: 'wrap' }}>
          <label className="f-label" style={{ minWidth: 160 }}><span>Status</span>
            <select value={String(patched.status || 'intake')} onChange={patch('status')}>
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <button className="f-button primary" disabled={patchBusy || !Object.keys(editPatch).length} onClick={() => void saveEdit()}>
            {patchBusy ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />} Save changes
          </button>
          {Object.keys(editPatch).length > 0 && (
            <button className="f-button" onClick={() => setEditPatch({})}>Discard</button>
          )}
        </div>
      </section>
    </div>
  );
}
