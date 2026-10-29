'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Scale, Plus, ChevronLeft, AlertTriangle, MapPin,
  Calendar, User, Tag, FileText, Loader, X, CheckCircle, Clock,
} from 'lucide-react';
import { requestJson } from '@/lib/shared/client';
import '@/components/finance/finance.css';
import '@/components/finance/timeclock.css';

const CATEGORIES = ['Collision', 'Property damage', 'Injury', 'Safety', 'Theft', 'Regulatory', 'Employee misconduct', 'Other'];
const PRIORITIES = ['Normal', 'High', 'Urgent'];
const STAGES = ['Draft', 'Under review', 'Pending decision', 'Action in Progress', 'In Collection', 'Resolved', 'Closed'];

type Incident = Record<string, unknown>;

function StageBadge({ stage }: { stage: unknown }) {
  const s = String(stage || 'Draft');
  const cls = /Resolved|Closed/.test(s) ? 'green' : /Under review|Pending|Action in Progress|In Collection/.test(s) ? 'amber' : '';
  return <span className={`f-badge ${cls}`}>{s}</span>;
}

function PriorityBadge({ priority }: { priority: unknown }) {
  const p = String(priority || 'Normal');
  const cls = p === 'Urgent' ? 'red' : p === 'High' ? 'amber' : '';
  return <span className={`f-badge ${cls}`}>{p}</span>;
}

function fmtDate(s: unknown) {
  if (!s) return '—';
  try { return new Date(String(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(s); }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="f-field">
      <span className="f-eyebrow">{label}</span>
      <span>{value || <em style={{ opacity: 0.4 }}>—</em>}</span>
    </div>
  );
}

export default function CcrPanel() {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<{ incident: Incident; evidence: Incident[]; decisions: Incident[]; recovery: Incident[]; insurance: Incident[]; findings: Incident[] } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filterStage, setFilterStage] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [editPatch, setEditPatch] = useState<Record<string, string>>({});
  const [patchBusy, setPatchBusy] = useState(false);

  // Create form fields
  const [form, setForm] = useState({
    category: 'Collision',
    location: '',
    description: '',
    occurrence_date: '',
    safety_concern: false,
    priority: 'Normal',
    employee_id: '',
    property_id: '',
  });

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStage) params.set('status', filterStage);
      if (filterCategory) params.set('category', filterCategory);
      params.set('limit', '100');
      const res = await requestJson<{ incidents: Incident[] }>(`/api/ccr/incidents?${params}`);
      setIncidents(res.incidents || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filterStage, filterCategory]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setError('');
    try {
      const res = await requestJson<{ incident: Incident; evidence: Incident[]; decisions: Incident[]; recovery: Incident[]; insurance: Incident[]; findings: Incident[] }>(`/api/ccr/incidents/${id}`);
      setSelected(res);
      setEditPatch({});
      setView('detail');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await requestJson('/api/ccr/incidents', {
        category: form.category,
        location: form.location || undefined,
        description: form.description || undefined,
        occurrence_date: form.occurrence_date || undefined,
        safety_concern: form.safety_concern,
        priority: form.priority,
        employee_id: form.employee_id || undefined,
        property_id: form.property_id || undefined,
      });
      setSuccess('Incident created successfully.');
      setForm({ category: 'Collision', location: '', description: '', occurrence_date: '', safety_concern: false, priority: 'Normal', employee_id: '', property_id: '' });
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
      const id = String(selected.incident.id);
      await requestJson(`/api/ccr/incidents/${id}`, editPatch, 'PATCH');
      await openDetail(id);
      setSuccess('Incident updated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPatchBusy(false);
    }
  };

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const patch = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setEditPatch(prev => ({ ...prev, [key]: e.target.value }));

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="f-workspace">
      <header className="f-heading">
        <h1><Scale size={20} style={{ verticalAlign: 'middle' }} /> CCR Incidents</h1>
        <button className="f-button primary" onClick={() => { setError(''); setSuccess(''); setView('create'); }}>
          <Plus size={16} /> New incident
        </button>
      </header>

      {success && (
        <div className="f-toast-inline" role="status">
          <CheckCircle size={16} /> {success}
          <button className="f-icon" onClick={() => setSuccess('')}><X size={14} /></button>
        </div>
      )}
      {error && <p className="f-error" style={{ padding: '0 1.5rem 1rem' }}>{error}</p>}

      <div className="f-toolbar">
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} aria-label="Filter by stage">
          <option value="">All stages</option>
          {STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="f-button" onClick={() => load()}>Refresh</button>
      </div>

      <section className="f-card" style={{ margin: '0 1.5rem 1.5rem' }}>
        {loadingDetail && <p className="f-meta" style={{ padding: '1rem' }}><Loader size={14} /> Loading…</p>}
        <div className="tc-table-wrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Location</th>
                <th>Description</th>
                <th>Priority</th>
                <th>Stage</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {incidents.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--f-muted)' }}>
                  No incidents found. <button className="f-text" onClick={() => setView('create')}>Create one.</button>
                </td></tr>
              )}
              {incidents.map(inc => (
                <tr key={String(inc.id)} style={{ cursor: 'pointer' }} onClick={() => void openDetail(String(inc.id))}>
                  <td><b>{String(inc.category)}</b></td>
                  <td><small><MapPin size={12} style={{ verticalAlign: 'middle' }} /> {String(inc.location || '—')}</small></td>
                  <td style={{ maxWidth: 240 }}><small>{String(inc.brief_description || '—')}</small></td>
                  <td><PriorityBadge priority={inc.priority} /></td>
                  <td><StageBadge stage={inc.internal_stage} /></td>
                  <td><small>{fmtDate(inc.occurrence_date || inc.created_at)}</small></td>
                  <td><button className="f-button" onClick={e => { e.stopPropagation(); void openDetail(String(inc.id)); }}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  // ── CREATE VIEW ────────────────────────────────────────────────────────────
  if (view === 'create') return (
    <div className="f-workspace">
      <header className="f-heading">
        <button className="f-text" onClick={() => setView('list')}><ChevronLeft size={16} /> Back to incidents</button>
        <h1>New CCR incident</h1>
      </header>

      {error && <p className="f-error" style={{ padding: '0 1.5rem 1rem' }}>{error}</p>}

      <form onSubmit={submitCreate} style={{ padding: '0 1.5rem 2rem' }}>
        <section className="f-card">
          <header><h2>Incident details</h2></header>

          <div className="f-form-grid">
            <label className="f-label">
              <span>Category <span style={{ color: 'var(--f-danger)' }}>*</span></span>
              <select value={form.category} onChange={f('category')} required>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>

            <label className="f-label">
              <span>Priority</span>
              <select value={form.priority} onChange={f('priority')}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </label>

            <label className="f-label">
              <span><MapPin size={13} /> Location</span>
              <input type="text" value={form.location} onChange={f('location')} placeholder="Address, intersection, or property name" />
            </label>

            <label className="f-label">
              <span><Calendar size={13} /> Date of occurrence</span>
              <input type="date" value={form.occurrence_date} onChange={f('occurrence_date')} />
            </label>

            <label className="f-label">
              <span><User size={13} /> Employee involved (ID or name)</span>
              <input type="text" value={form.employee_id} onChange={f('employee_id')} placeholder="Leave blank if not employee-related" />
            </label>

            <label className="f-label">
              <span><Tag size={13} /> Property ID</span>
              <input type="text" value={form.property_id} onChange={f('property_id')} placeholder="Account or property identifier" />
            </label>
          </div>

          <label className="f-label" style={{ padding: '0 1.5rem' }}>
            <span><FileText size={13} /> Description / brief summary <span style={{ color: 'var(--f-danger)' }}>*</span></span>
            <textarea
              value={form.description}
              onChange={f('description')}
              rows={5}
              placeholder="Describe what happened, when, who was involved, and the immediate response taken."
              required
              style={{ width: '100%', resize: 'vertical' }}
            />
          </label>

          <label className="f-label f-label-check" style={{ padding: '0.75rem 1.5rem' }}>
            <input type="checkbox" checked={form.safety_concern} onChange={f('safety_concern')} />
            <span><AlertTriangle size={14} style={{ color: 'var(--f-danger)' }} /> Immediate safety concern — requires urgent review</span>
          </label>
        </section>

        <div className="f-form-actions">
          <button type="button" className="f-button" onClick={() => setView('list')}>Cancel</button>
          <button type="submit" className="f-button primary" disabled={loading}>
            {loading ? <><Loader size={14} /> Saving…</> : <><Plus size={14} /> Create incident</>}
          </button>
        </div>
      </form>
    </div>
  );

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (!selected) return null;
  const { incident, evidence, decisions, recovery, insurance, findings } = selected;

  return (
    <div className="f-workspace">
      <header className="f-heading">
        <button className="f-text" onClick={() => setView('list')}><ChevronLeft size={16} /> Back to incidents</button>
        <h1>{String(incident.category)} incident <StageBadge stage={incident.internal_stage} /></h1>
      </header>

      {error && <p className="f-error" style={{ padding: '0 1.5rem 1rem' }}>{error}</p>}
      {success && <div className="f-toast-inline"><CheckCircle size={14} /> {success}</div>}

      <div style={{ display: 'grid', gap: '1.5rem', padding: '0 1.5rem 2rem', gridTemplateColumns: '1fr 1fr' }}>

        {/* Overview */}
        <section className="f-card" style={{ gridColumn: '1 / -1' }}>
          <header>
            <h2>Overview</h2>
            <PriorityBadge priority={incident.priority} />
          </header>
          <div className="f-detail-grid">
            <Field label="Category" value={String(incident.category)} />
            <Field label="Stage" value={<StageBadge stage={incident.internal_stage} />} />
            <Field label="Priority" value={<PriorityBadge priority={incident.priority} />} />
            <Field label="Safety concern" value={incident.immediate_safety_concern ? '⚠ Yes — urgent' : 'No'} />
            <Field label="Location" value={String(incident.location || '—')} />
            <Field label="Occurrence date" value={fmtDate(incident.occurrence_date)} />
            <Field label="Employee involved" value={String(incident.employee_id || '—')} />
            <Field label="Property / account" value={String(incident.property_id || '—')} />
            <Field label="Created" value={fmtDate(incident.created_at)} />
            <Field label="Last updated" value={fmtDate(incident.updated_at)} />
          </div>
          <div style={{ padding: '0 1.5rem 1rem' }}>
            <span className="f-eyebrow">Description</span>
            <p style={{ marginTop: '0.25rem', lineHeight: 1.6 }}>{String(incident.brief_description || '—')}</p>
          </div>
        </section>

        {/* Edit stage / assignment */}
        <section className="f-card">
          <header><h2>Update record</h2></header>
          <div className="f-form-grid" style={{ padding: '0 1.5rem 1rem' }}>
            <label className="f-label">
              <span>Stage</span>
              <select defaultValue={String(incident.internal_stage)} onChange={patch('status')}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="f-label">
              <span>Priority</span>
              <select defaultValue={String(incident.priority || 'Normal')} onChange={patch('priority')}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="f-label">
              <span>Location</span>
              <input type="text" defaultValue={String(incident.location || '')} onChange={patch('location')} placeholder="Update location" />
            </label>
            <label className="f-label">
              <span>Description</span>
              <textarea rows={3} defaultValue={String(incident.brief_description || '')} onChange={patch('brief_description')} style={{ resize: 'vertical', width: '100%' }} />
            </label>
          </div>
          <div style={{ padding: '0 1.5rem 1rem', display: 'flex', gap: '0.5rem' }}>
            <button className="f-button primary" disabled={patchBusy || !Object.keys(editPatch).length} onClick={() => void saveEdit()}>
              {patchBusy ? <><Loader size={13} /> Saving…</> : 'Save changes'}
            </button>
          </div>
        </section>

        {/* Evidence */}
        <section className="f-card">
          <header><h2>Evidence ({evidence.length})</h2></header>
          <div className="tc-table-wrap" style={{ maxHeight: '24vh', overflow: 'auto' }}>
            <table className="tc-table">
              <thead><tr><th>File</th><th>Type</th><th>Uploaded</th></tr></thead>
              <tbody>
                {evidence.length === 0 && <tr><td colSpan={3}><small style={{ color: 'var(--f-muted)' }}>No evidence uploaded</small></td></tr>}
                {evidence.map((ev, i) => (
                  <tr key={String(ev.id || i)}>
                    <td><small>{String(ev.original_filename || ev.file_id)}</small></td>
                    <td><small>{String(ev.content_classification || ev.file_type || '—')}</small></td>
                    <td><small>{fmtDate(ev.upload_time)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Insurance claims */}
        <section className="f-card">
          <header><h2>Insurance claims ({insurance.length})</h2></header>
          <div className="tc-table-wrap" style={{ maxHeight: '24vh', overflow: 'auto' }}>
            <table className="tc-table">
              <thead><tr><th>Carrier</th><th>Claim #</th><th>Status</th><th>Amount</th></tr></thead>
              <tbody>
                {insurance.length === 0 && <tr><td colSpan={4}><small style={{ color: 'var(--f-muted)' }}>No claims on record</small></td></tr>}
                {insurance.map((cl, i) => (
                  <tr key={String(cl.id || i)}>
                    <td>{String(cl.carrier_name || '—')}</td>
                    <td><small>{String(cl.claim_number || '—')}</small></td>
                    <td><span className="f-badge">{String(cl.claim_status || '—')}</span></td>
                    <td>{cl.claim_amount ? `$${Number(cl.claim_amount).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Regulatory findings */}
        <section className="f-card">
          <header><h2>Regulatory findings ({findings.length})</h2></header>
          <div className="tc-table-wrap" style={{ maxHeight: '24vh', overflow: 'auto' }}>
            <table className="tc-table">
              <thead><tr><th>Agency</th><th>Finding</th><th>Status</th></tr></thead>
              <tbody>
                {findings.length === 0 && <tr><td colSpan={3}><small style={{ color: 'var(--f-muted)' }}>No regulatory findings</small></td></tr>}
                {findings.map((fn, i) => (
                  <tr key={String(fn.id || i)}>
                    <td>{String(fn.agency_name || '—')}</td>
                    <td><small>{String(fn.finding_summary || '—')}</small></td>
                    <td><span className="f-badge">{String(fn.resolution_status || '—')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Employee recovery */}
        <section className="f-card">
          <header><h2>Employee recovery ({recovery.length})</h2></header>
          <div className="tc-table-wrap" style={{ maxHeight: '24vh', overflow: 'auto' }}>
            <table className="tc-table">
              <thead><tr><th>Employee</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {recovery.length === 0 && <tr><td colSpan={4}><small style={{ color: 'var(--f-muted)' }}>No recovery records</small></td></tr>}
                {recovery.map((rc, i) => (
                  <tr key={String(rc.id || i)}>
                    <td>{String(rc.employee_id || '—')}</td>
                    <td>{String(rc.collection_method || '—')}</td>
                    <td>{rc.recovery_approved_amount ? `$${Number(rc.recovery_approved_amount).toLocaleString()}` : '—'}</td>
                    <td><span className="f-badge">{String(rc.collection_status || '—')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Decisions */}
        <section className="f-card">
          <header><h2>Case decisions ({decisions.length})</h2></header>
          <div className="tc-table-wrap" style={{ maxHeight: '24vh', overflow: 'auto' }}>
            <table className="tc-table">
              <thead><tr><th>Type</th><th>Outcome</th><th>Date</th></tr></thead>
              <tbody>
                {decisions.length === 0 && <tr><td colSpan={3}><small style={{ color: 'var(--f-muted)' }}>No decisions recorded</small></td></tr>}
                {decisions.map((d, i) => (
                  <tr key={String(d.id || i)}>
                    <td>{String(d.decision_type || '—')}</td>
                    <td><small>{String(d.outcome_summary || '—')}</small></td>
                    <td><small>{fmtDate(d.decision_date)}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
