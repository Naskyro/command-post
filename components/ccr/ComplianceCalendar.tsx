'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Plus, CalendarDays, CheckCircle, AlertTriangle, Clock,
  X, Loader, ChevronDown, ChevronUp, Edit2,
} from 'lucide-react';
import { requestJson, timedFetch } from '@/lib/shared/client';
import '@/components/finance/finance.css';
import '@/components/finance/timeclock.css';

const STATUSES = ['Upcoming', 'In review', 'Preparing', 'Due', 'Expires soon', 'Evidence accepted', 'Complete', 'Overdue'];
const RECURRENCE = ['One-time', 'Monthly', 'Quarterly', 'Semi-annual', 'Annual', 'Biennial', 'As required'];

type Obligation = Record<string, unknown>;

function StatusBadge({ status }: { status: unknown }) {
  const s = String(status || '');
  const cls = /Complete|Evidence accepted/.test(s) ? 'green' : /Overdue|Due|Expires/.test(s) ? 'red' : /In review|Preparing/.test(s) ? 'amber' : '';
  const Icon = /Complete|Evidence accepted/.test(s) ? CheckCircle : /Overdue|Due|Expires/.test(s) ? AlertTriangle : Clock;
  return <span className={`f-badge ${cls}`}><Icon size={11} style={{ verticalAlign: 'middle' }} /> {s}</span>;
}

function fmtDate(s: unknown) {
  if (!s) return '—';
  try { return new Date(String(s) + (String(s).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(s); }
}

const BLANK = { obligation: '', applies_to: '', due_date: '', owner: '', evidence_required: '', work_effect: '', status: 'Upcoming', recurrence: 'Annual', notes: '' };

export default function ComplianceCalendar() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Obligation | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await requestJson<{ obligations: Obligation[] }>(`/api/ccr/obligations?${params}`);
      setObligations(res.obligations || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm({ ...BLANK }); setShowForm(true); };
  const openEdit = (ob: Obligation) => {
    setEditing(ob);
    setForm({
      obligation: String(ob.obligation || ''),
      applies_to: String(ob.applies_to || ''),
      due_date: String(ob.due_date || '').slice(0, 10),
      owner: String(ob.owner || ''),
      evidence_required: String(ob.evidence_required || ''),
      work_effect: String(ob.work_effect || ''),
      status: String(ob.status || 'Upcoming'),
      recurrence: String(ob.recurrence || 'Annual'),
      notes: String(ob.notes || ''),
    });
    setShowForm(true);
  };

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await requestJson(`/api/ccr/obligations/${editing.id}`, form);
        setSuccess('Obligation updated.');
      } else {
        await requestJson('/api/ccr/obligations', form);
        setSuccess('Obligation added to compliance calendar.');
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (id: string, status: string) => {
    try {
      await requestJson(`/api/ccr/obligations/${id}`, { status });
      setSuccess(`Marked as "${status}".`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Remove this obligation?')) return;
    try {
      await timedFetch(`/api/ccr/obligations/${id}`, { method: 'DELETE' });
      setSuccess('Obligation removed.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Seed the hardcoded obligations from the original table into the DB on first load if empty
  const seedDefaults = async () => {
    const defaults = [
      { obligation: 'VSF employee license renewal', applies_to: 'Nessa Rios', due_date: '2026-09-21', owner: 'Austin', evidence_required: 'License copy + source verification', work_effect: 'Restrict VSF work after expiration', status: 'Expires soon', recurrence: 'Annual' },
      { obligation: 'Q3 random-testing selection', applies_to: 'Eligible VSF pool', due_date: '2026-09-08', owner: 'Jerson', evidence_required: 'Pool, random method, selections, notices', work_effect: 'Testing compliance risk', status: 'Due', recurrence: 'Quarterly' },
      { obligation: 'Commercial auto insurance renewal', applies_to: 'Company vehicles', due_date: '2026-10-01', owner: 'Jerson', evidence_required: 'Policy + payment + vehicle schedule', work_effect: 'Vehicles unavailable if lapsed', status: 'In review', recurrence: 'Annual' },
      { obligation: 'August sales-tax support', applies_to: 'Company filing', due_date: '2026-09-21', owner: 'Finance', evidence_required: 'Reconciled taxable activity and filing proof', work_effect: 'Finance filing exception', status: 'Preparing', recurrence: 'Monthly' },
      { obligation: 'TDLR / VSF inspection packet', applies_to: 'Company and yard', due_date: '2026-09-30', owner: 'Austin', evidence_required: 'Licenses, logs, signage, notices, policies', work_effect: 'Inspection readiness', status: 'Upcoming', recurrence: 'Annual' },
    ];
    for (const ob of defaults) {
      try { await requestJson('/api/ccr/obligations', ob); } catch { /* skip if exists */ }
    }
    await load();
    setSuccess('Default obligations loaded.');
  };

  return (
    <div className="f-workspace">
      <header className="f-heading">
        <h1><CalendarDays size={20} style={{ verticalAlign: 'middle' }} /> Compliance calendar</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {obligations.length === 0 && !loading && (
            <button className="f-button" onClick={() => void seedDefaults()}>Load defaults</button>
          )}
          <button className="f-button primary" onClick={openCreate}><Plus size={15} /> Add obligation</button>
        </div>
      </header>

      {error && <p className="f-error" style={{ padding: '0 1.5rem 0.5rem' }}>{error}</p>}
      {success && (
        <div className="f-toast-inline" style={{ margin: '0 1.5rem 1rem' }}>
          <CheckCircle size={15} /> {success}
          <button className="f-icon" onClick={() => setSuccess('')}><X size={13} /></button>
        </div>
      )}

      {/* Obligation form drawer */}
      {showForm && (
        <div style={{ background: 'var(--f-surface-2, #f5f8fa)', borderBottom: '1px solid var(--f-border)', padding: '1.5rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
            {editing ? 'Edit obligation' : 'Add compliance obligation'}
          </h2>
          <form onSubmit={submit}>
            <div className="f-form-grid" style={{ padding: 0, marginBottom: '1rem' }}>
              <label className="f-label" style={{ gridColumn: '1 / -1' }}>
                <span>Obligation <span style={{ color: 'var(--f-danger)' }}>*</span></span>
                <input type="text" value={form.obligation} onChange={f('obligation')} placeholder="e.g. VSF employee license renewal" required />
              </label>
              <label className="f-label">
                <span>Applies to <span style={{ color: 'var(--f-danger)' }}>*</span></span>
                <input type="text" value={form.applies_to} onChange={f('applies_to')} placeholder="Who or what this covers" required />
              </label>
              <label className="f-label">
                <span>Due date</span>
                <input type="date" value={form.due_date} onChange={f('due_date')} />
              </label>
              <label className="f-label">
                <span>Owner</span>
                <input type="text" value={form.owner} onChange={f('owner')} placeholder="Responsible person or role" />
              </label>
              <label className="f-label">
                <span>Status</span>
                <select value={form.status} onChange={f('status')}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="f-label">
                <span>Recurrence</span>
                <select value={form.recurrence} onChange={f('recurrence')}>
                  {RECURRENCE.map(r => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="f-label" style={{ gridColumn: '1 / -1' }}>
                <span>Evidence required</span>
                <input type="text" value={form.evidence_required} onChange={f('evidence_required')} placeholder="What documents or proof are needed" />
              </label>
              <label className="f-label" style={{ gridColumn: '1 / -1' }}>
                <span>Work / business effect</span>
                <input type="text" value={form.work_effect} onChange={f('work_effect')} placeholder="What happens if this is missed" />
              </label>
              <label className="f-label" style={{ gridColumn: '1 / -1' }}>
                <span>Notes</span>
                <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Additional context or instructions" style={{ resize: 'vertical' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="f-button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
              <button type="submit" className="f-button primary" disabled={saving}>
                {saving ? <><Loader size={13} /> Saving…</> : editing ? 'Save changes' : 'Add obligation'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="f-toolbar" style={{ padding: '0 1.5rem 0.75rem' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--f-muted)' }}>{obligations.length} obligation{obligations.length !== 1 ? 's' : ''}</span>
      </div>

      <section className="f-card" style={{ margin: '0 1.5rem' }}>
        {loading && <p style={{ padding: '1.5rem', color: 'var(--f-muted)', textAlign: 'center' }}><Loader size={14} /> Loading…</p>}
        <div className="tc-table-wrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Obligation</th>
                <th>Applies to</th>
                <th>Due</th>
                <th>Owner</th>
                <th>Evidence required</th>
                <th>Work / business effect</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {obligations.length === 0 && !loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--f-muted)' }}>
                  No obligations yet. <button className="f-text" onClick={openCreate}>Add one</button> or <button className="f-text" onClick={() => void seedDefaults()}>load defaults</button>.
                </td></tr>
              )}
              {obligations.map(ob => {
                const id = String(ob.id);
                const isExpanded = expandedId === id;
                return (
                  <>
                    <tr key={id}>
                      <td>
                        <b style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                            onClick={() => setExpandedId(isExpanded ? null : id)}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {String(ob.obligation)}
                        </b>
                        {ob.recurrence ? <small style={{ color: 'var(--f-muted)' }}>{String(ob.recurrence)}</small> : null}
                      </td>
                      <td>{String(ob.applies_to)}</td>
                      <td>{fmtDate(ob.due_date)}</td>
                      <td>{String(ob.owner || '—')}</td>
                      <td><small>{String(ob.evidence_required || '—')}</small></td>
                      <td><small>{String(ob.work_effect || '—')}</small></td>
                      <td><StatusBadge status={ob.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'nowrap' }}>
                          {String(ob.status) !== 'Evidence accepted' && (
                            <button className="f-button" style={{ fontSize: '0.75rem', padding: '5px 8px' }} onClick={() => void quickStatus(id, 'Evidence accepted')}>
                              Accept
                            </button>
                          )}
                          <button className="f-button" style={{ fontSize: '0.75rem', padding: '5px 8px' }} onClick={() => openEdit(ob)}>
                            <Edit2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${id}-exp`}>
                        <td colSpan={8} style={{ background: 'var(--f-surface-2, #f5f8fa)', padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem 1.5rem' }}>
                            {ob.notes ? <div><span className="f-eyebrow">Notes</span><p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{String(ob.notes)}</p></div> : null}
                            <div><span className="f-eyebrow">Added</span><p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{fmtDate(ob.created_at)}</p></div>
                            {ob.updated_at !== ob.created_at && <div><span className="f-eyebrow">Last updated</span><p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>{fmtDate(ob.updated_at)}</p></div>}
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                            {STATUSES.filter(s => s !== String(ob.status)).map(s => (
                              <button key={s} className="f-button" style={{ fontSize: '0.75rem' }} onClick={() => void quickStatus(id, s)}>
                                Mark {s}
                              </button>
                            ))}
                            <button className="f-button" style={{ fontSize: '0.75rem', marginLeft: 'auto', color: 'var(--f-danger, #c0392b)' }} onClick={() => void del(id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
