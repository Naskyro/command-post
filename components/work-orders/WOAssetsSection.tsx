'use client';
import { useState } from 'react';
import { Plus, X, Boxes, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import type { Viewer } from '@/lib/finance/model';
import type { Row } from '@/lib/accounts/model';
import { woAssetStatuses } from '@/lib/accounts/work-options';
import { toast } from 'sonner';

const assetTypes = ['Laptop / desktop','Monitor','Phone / tablet','Printer / scanner','Label printer','Television / display','Router / network device','Camera / recorder','Radio','Key / access card','Tool','Office equipment / furniture','Window AC','Gate / gate component','Portable toilet','Other'];
const conditions = ['Excellent','Good','Fair','Poor','Damaged','For disposal'];

interface Props { assets: Row[]; all: Row[]; viewer: Viewer; onSave: (rows: Row[]) => void; }

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`wo-pill ${className}`}>{children}</span>;
}

export default function WOAssetsSection({ assets, all, viewer, onSave }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function openNew() {
    setEditing(null);
    setForm({ status: 'Available', condition: 'Good' });
    setShowForm(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setForm(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
    setShowForm(true);
  }

  async function save() {
    if (!form.name) { toast.error('Enter an asset name.'); return; }
    setSaving(true);
    try {
      const id = editing?.id || 'woAsset:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: {
          ...form, id, kind: 'woAsset', version: editing?.version ?? 0,
          name: form.name,
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        },
      });
      onSave(res.records);
      setShowForm(false);
      toast.success(editing ? 'Asset updated' : 'Asset added');
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  const types = ['All', ...Array.from(new Set(assets.map(r => String(r.assetType || 'Other'))))];
  let filtered = assets;
  if (typeFilter !== 'All') filtered = filtered.filter(r => r.assetType === typeFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.name||'').toLowerCase().includes(q) ||
      String(r.assetNumber||'').toLowerCase().includes(q) ||
      String(r.brand||'').toLowerCase().includes(q) ||
      String(r.serialNumber||'').toLowerCase().includes(q)
    );
  }

  const statusColor: Record<string, string> = {
    'Available': 'tone-teal', 'Assigned': 'tone-blue', 'Checked Out': 'tone-blue',
    'Missing': 'tone-red', 'Damaged': 'tone-orange', 'In Repair': 'tone-orange', 'Disposed': 'tone-gray',
  };

  return (
    <div className="wo-section">
      <div className="wo-section-header">
        <h3>Company Assets ({assets.length})</h3>
        {canAccess(viewer, 'Work Orders', 'orders', true) &&
          <Button size="sm" onClick={openNew}><Plus size={14} />Add asset</Button>}
      </div>

      <div className="wo-filters">
        <div className="wo-search"><Search size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, number, brand, serial…" /></div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 && !showForm
        ? <div className="wo-empty"><Boxes size={36} /><p>No assets found. Add company assets to track their status, assignment, and history.</p></div>
        : (
          <div className="wo-item-grid">
            {filtered.map(r => (
              <div key={r.id} className="wo-item-card">
                <div className="wo-item-card-top">
                  <div>
                    {r.assetNumber && <span className="wo-card-id">{String(r.assetNumber)}</span>}
                    <b>{String(r.name)}</b>
                  </div>
                  <Pill className={statusColor[String(r.status||'Available')] || 'tone-gray'}>{String(r.status||'Available')}</Pill>
                </div>
                <p>{String(r.assetType || '—')} {r.brand ? `· ${r.brand}` : ''} {r.model ? `· ${r.model}` : ''}</p>
                <div className="wo-item-meta">
                  {r.assignedEmployee && <span>Assigned: {String(r.assignedEmployee)}</span>}
                  {r.assignedLocation && <span>{String(r.assignedLocation)}</span>}
                  {r.condition && <span>Condition: {String(r.condition)}</span>}
                  {r.warranty && <span>Warranty: {String(r.warranty)}</span>}
                </div>
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
              <h3>{editing ? 'Edit asset' : 'Add asset'}</h3>
              <button className="wo-icon-btn" onClick={() => setShowForm(false)}><X size={18} /></button>
            </header>
            <div className="wo-form-grid wo-form-modal-body">
              <label>Asset name *<input value={form.name||''} onChange={e=>set('name',e.target.value)} /></label>
              <label>Asset number<input value={form.assetNumber||''} onChange={e=>set('assetNumber',e.target.value)} /></label>
              <label>Asset type<select value={form.assetType||''} onChange={e=>set('assetType',e.target.value)}>
                <option value="">Select…</option>{assetTypes.map(t=><option key={t}>{t}</option>)}</select></label>
              <label>Status<select value={form.status||'Available'} onChange={e=>set('status',e.target.value)}>
                {woAssetStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
              <label>Brand<input value={form.brand||''} onChange={e=>set('brand',e.target.value)} /></label>
              <label>Model<input value={form.model||''} onChange={e=>set('model',e.target.value)} /></label>
              <label>Serial number<input value={form.serialNumber||''} onChange={e=>set('serialNumber',e.target.value)} /></label>
              <label>Condition<select value={form.condition||'Good'} onChange={e=>set('condition',e.target.value)}>
                {conditions.map(c=><option key={c}>{c}</option>)}</select></label>
              <label>Purchase date<input type="date" value={form.purchaseDate||''} onChange={e=>set('purchaseDate',e.target.value)} /></label>
              <label>Purchase price ($)<input type="number" value={form.purchasePrice||''} onChange={e=>set('purchasePrice',e.target.value)} /></label>
              <label>Vendor / source<input value={form.vendor||''} onChange={e=>set('vendor',e.target.value)} /></label>
              <label>Warranty<input value={form.warranty||''} onChange={e=>set('warranty',e.target.value)} /></label>
              <label>Assigned employee<input value={form.assignedEmployee||''} onChange={e=>set('assignedEmployee',e.target.value)} /></label>
              <label>Assigned location<input value={form.assignedLocation||''} onChange={e=>set('assignedLocation',e.target.value)} /></label>
              <label className="wo-full">Notes<textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} /></label>
            </div>
            <div className="wo-form-actions wo-form-modal-footer">
              <Button variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving?'Saving…':'Save asset'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
