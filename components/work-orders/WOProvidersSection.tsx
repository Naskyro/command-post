'use client';
import { useState } from 'react';
import { Plus, X, Users, Search, Phone, Mail, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import type { Viewer } from '@/lib/finance/model';
import type { Row } from '@/lib/accounts/model';
import { woProviderStatuses } from '@/lib/accounts/work-options';
import { toast } from 'sonner';

const providerTypes = ['Mobile mechanic','Shop mechanic','IT technician','Internet provider','Electrician','Plumber','Locksmith','Gate / security service','Landscaper / lawn','Janitorial','Pest control','Dumpster / portable-toilet service','Parts / supply vendor','Sign vendor','Painter / contractor','Other'];

interface Props { providers: Row[]; all: Row[]; viewer: Viewer; onSave: (rows: Row[]) => void; }

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`wo-pill ${className}`}>{children}</span>;
}

export default function WOProvidersSection({ providers, all, viewer, onSave }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function openNew() {
    setEditing(null);
    setForm({ status: 'Active' });
    setShowForm(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setForm(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
    setShowForm(true);
  }

  async function save() {
    if (!form.name) { toast.error('Enter a provider name.'); return; }
    setSaving(true);
    try {
      const id = editing?.id || 'woProvider:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: { ...form, id, kind: 'woProvider', version: editing?.version ?? 0, name: form.name },
      });
      onSave(res.records);
      setShowForm(false);
      toast.success(editing ? 'Provider updated' : 'Provider added');
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  const types = ['All', ...Array.from(new Set(providers.map(r => String(r.providerType || 'Other'))))];
  let filtered = providers.filter(r => r.status !== 'Inactive' || typeFilter === 'All');
  if (typeFilter !== 'All') filtered = filtered.filter(r => r.providerType === typeFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.name||'').toLowerCase().includes(q) ||
      String(r.services||'').toLowerCase().includes(q) ||
      String(r.contactPerson||'').toLowerCase().includes(q)
    );
  }

  const statusColor: Record<string, string> = {
    'Active': 'tone-teal', 'Inactive': 'tone-gray',
    'Pending Review': 'tone-orange', 'Do Not Use': 'tone-red',
  };

  return (
    <div className="wo-section">
      <div className="wo-section-header">
        <h3>Provider &amp; Vendor Directory ({providers.filter(r => r.status === 'Active').length} active)</h3>
        {canAccess(viewer, 'Work Orders', 'orders', true) &&
          <Button size="sm" onClick={openNew}><Plus size={14} />Add provider</Button>}
      </div>

      <div className="wo-filters">
        <div className="wo-search"><Search size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, specialty, contact…" /></div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 && !showForm
        ? <div className="wo-empty"><Users size={36} /><p>No providers in the directory yet. Add mechanics, vendors, and service providers to track them.</p></div>
        : (
          <div className="wo-item-grid">
            {filtered.map(r => (
              <div key={r.id} className="wo-item-card">
                <div className="wo-item-card-top">
                  <div>
                    <b>{String(r.name)}</b>
                    {r.contactPerson && <span className="wo-card-meta-small">{String(r.contactPerson)}</span>}
                  </div>
                  <div className="wo-provider-badges">
                    <Pill className={statusColor[String(r.status||'Active')] || 'tone-gray'}>{String(r.status||'Active')}</Pill>
                  </div>
                </div>
                <p>{String(r.providerType || '—')}</p>
                {r.services && <p className="wo-provider-services">{String(r.services).substring(0, 100)}</p>}
                <div className="wo-item-meta">
                  {r.phone && <span><Phone size={12} />{String(r.phone)}</span>}
                  {r.email && <span><Mail size={12} />{String(r.email)}</span>}
                  {r.normalRate && <span>Rate: {String(r.normalRate)}</span>}
                  {r.coiStatus && <span>COI: {String(r.coiStatus)}</span>}
                  {r.w9Status && <span>W-9: {String(r.w9Status)}</span>}
                </div>
                {r.notes && <p className="wo-provider-notes">{String(r.notes).substring(0, 100)}</p>}
                {canAccess(viewer, 'Work Orders', 'orders', true) &&
                  <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>}
              </div>
            ))}
          </div>
        )
      }

      {showForm && (
        <div className="wo-detail-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="wo-form-modal">
            <header className="wo-form-modal-header">
              <h3>{editing ? 'Edit provider' : 'Add provider'}</h3>
              <button className="wo-icon-btn" onClick={() => setShowForm(false)}><X size={18} /></button>
            </header>
            <div className="wo-form-grid wo-form-modal-body">
              <label>Name *<input value={form.name||''} onChange={e=>set('name',e.target.value)} /></label>
              <label>Status<select value={form.status||'Active'} onChange={e=>set('status',e.target.value)}>
                {woProviderStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
              <label>Provider type<select value={form.providerType||''} onChange={e=>set('providerType',e.target.value)}>
                <option value="">Select…</option>{providerTypes.map(t=><option key={t}>{t}</option>)}</select></label>
              <label>Contact person<input value={form.contactPerson||''} onChange={e=>set('contactPerson',e.target.value)} /></label>
              <label>Phone<input value={form.phone||''} onChange={e=>set('phone',e.target.value)} /></label>
              <label>Email<input value={form.email||''} onChange={e=>set('email',e.target.value)} /></label>
              <label>Address<input value={form.address||''} onChange={e=>set('address',e.target.value)} /></label>
              <label>Service area<input value={form.serviceArea||''} onChange={e=>set('serviceArea',e.target.value)} /></label>
              <label>Normal rate<input value={form.normalRate||''} onChange={e=>set('normalRate',e.target.value)} /></label>
              <label>Emergency rate<input value={form.emergencyRate||''} onChange={e=>set('emergencyRate',e.target.value)} /></label>
              <label>COI status<select value={form.coiStatus||'Not on file'} onChange={e=>set('coiStatus',e.target.value)}>
                {['On file','Expired','Requested','Not required','Not on file'].map(s=><option key={s}>{s}</option>)}</select></label>
              <label>W-9 status<select value={form.w9Status||'Not on file'} onChange={e=>set('w9Status',e.target.value)}>
                {['On file','Requested','Not required','Not on file'].map(s=><option key={s}>{s}</option>)}</select></label>
              <label>Contract status<select value={form.contractStatus||'None'} onChange={e=>set('contractStatus',e.target.value)}>
                {['Active','None','Expired'].map(s=><option key={s}>{s}</option>)}</select></label>
              <label className="wo-full">Services / specialties<textarea rows={2} value={form.services||''} onChange={e=>set('services',e.target.value)} /></label>
              <label className="wo-full">Warranty / guarantee<textarea rows={2} value={form.warrantyGuarantee||''} onChange={e=>set('warrantyGuarantee',e.target.value)} /></label>
              <label className="wo-full">Internal notes<textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} /></label>
            </div>
            <div className="wo-form-actions wo-form-modal-footer">
              <Button variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving?'Saving…':'Save provider'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
