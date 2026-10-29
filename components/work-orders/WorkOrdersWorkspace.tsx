'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Wrench, Plus, RefreshCw, Search, AlertTriangle, CheckCircle, Clock,
  Truck, Settings, ChevronRight, X, ChevronDown, ClipboardList,
  PackageSearch, Users, Building2, Zap, ShieldAlert, FolderOpen,
  Star, RotateCcw, Calendar, BarChart3, ListFilter, FileText,
  Flame, ArrowUpRight, ArrowRight, Boxes, UserCheck, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import type { Viewer } from '@/lib/finance/model';
import type { Row } from '@/lib/accounts/model';
import { today } from '@/lib/accounts/model';
import {
  woStatuses, woPriorities, woCategories, woPaymentMethods,
  fleetVehicleStatuses, woCategoryTypes, woAssetStatuses, woProviderStatuses,
  type WOStatus, type WOPriority, type WOCategory
} from '@/lib/accounts/work-options';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import WOSubmitForm from './WOSubmitForm';
import WOFleetSection from './WOFleetSection';
import WOAssetsSection from './WOAssetsSection';
import WOProvidersSection from './WOProvidersSection';
import './work-orders.css';

interface StaffRef { id: string; name: string; department: string; title?: string; }
interface WOData {
  records: Row[];
  viewer: Viewer;
  staff: StaffRef[];
}

interface Props { initialTab?: string; onOpen?: (label: string, tab?: string) => void; }

const priorityTone: Record<string, string> = {
  Emergency: 'tone-red', Urgent: 'tone-orange', Normal: 'tone-blue', Low: 'tone-gray',
};
const statusClass: Record<string, string> = {
  'New': 'ws-status-new', 'Needs Review': 'ws-status-needs-review',
  'In Progress': 'ws-status-in-progress', 'Completed': 'ws-status-completed',
  'Awaiting Approval': 'ws-status-waiting', 'Assigned': 'ws-status-assigned',
  'Cancelled': 'ws-status-cancelled', 'Deferred': 'ws-status-deferred',
  'Ready for Verification': 'ws-status-verify',
};
const catIcon: Record<string, React.ReactNode> = {
  'Account Management': <Building2 size={15} />,
  'Fleet Maintenance & Repairs': <Truck size={15} />,
  'IT Support': <Zap size={15} />,
  'Facilities & Maintenance': <Settings size={15} />,
  'Supplies & Purchasing': <PackageSearch size={15} />,
  'Hardware, Software & Access': <Boxes size={15} />,
  'Safety': <ShieldAlert size={15} />,
  'Project': <FolderOpen size={15} />,
  'Other': <FileText size={15} />,
};

function woNumber(r: Row) { return String(r.woNumber || r.id).replace(/^workOrder:/,'WO-').substring(0,12); }
function isOpen(r: Row) { return !['Completed','Cancelled','Duplicate','Unable to Complete','Deferred'].includes(String(r.status||'New')); }
function isApprovalNeeded(r: Row) { return r.status === 'Awaiting Approval' || (r.requiresApproval && r.status === 'New'); }
function daysAgo(dateStr: unknown) {
  if (!dateStr) return '';
  const d = Math.floor((Date.now() - Date.parse(String(dateStr))) / 86400000);
  return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : d + 'd ago';
}

// ── Pill / badge ──────────────────────────────────────────────────────────────
function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`wo-pill ${className}`}>{children}</span>;
}
function PriorityBadge({ p }: { p: string }) {
  return <Pill className={`wo-priority ${priorityTone[p] || 'tone-gray'}`}>{p}</Pill>;
}
function StatusBadge({ s }: { s: string }) {
  return <Pill className={`wo-status ${statusClass[s] || ''}`}>{s || 'New'}</Pill>;
}

// ── Single work order card ────────────────────────────────────────────────────
function WOCard({ r, onClick }: { r: Row; onClick: () => void }) {
  const cat = String(r.category || 'Other');
  const priority = String(r.priority || 'Normal');
  const status = String(r.status || 'New');
  return (
    <article className={`wo-card ${priorityTone[priority]}`} onClick={onClick}>
      <div className={`wo-priority-bar ${priorityTone[priority]}`} />
      <div className="wo-card-body">
        <header className="wo-card-header">
          <div className="wo-card-meta">
            <span className="wo-card-id">{woNumber(r)}</span>
            <span className="wo-card-cat">{catIcon[cat]}{cat}</span>
          </div>
          <StatusBadge s={status} />
        </header>
        <b className="wo-card-title">{String(r.name || r.title || 'Work order')}</b>
        {r.details && <p className="wo-card-details">{String(r.details).substring(0, 120)}</p>}
        <footer className="wo-card-footer">
          {r.assignee && <span><UserCheck size={13} />{String(r.assignee)}</span>}
          {r.location && <span><Building2 size={13} />{String(r.location)}</span>}
          {r.dueDate && <span><Clock size={13} />Due {String(r.dueDate)}</span>}
          {r.estimatedCost && <span><ArrowUpRight size={13} />${Number(r.estimatedCost).toLocaleString()} est.</span>}
          <PriorityBadge p={priority} />
        </footer>
      </div>
    </article>
  );
}

// ── Work order detail modal ───────────────────────────────────────────────────
function WODetail({ r, all, staff, viewer, onClose, onSave }:
  { r: Row; all: Row[]; staff: StaffRef[]; viewer: Viewer; onClose: () => void; onSave: (next: Row) => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(String(r.status || 'New'));
  const [assignee, setAssignee] = useState(String(r.assignee || ''));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const operationsStaff = staff.filter(s => s.department === 'Operations');

  async function saveStatus() {
    setSaving(true);
    try {
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: { ...r, status, assignee: assignee || r.assignee, internalNotes: notes ? (String(r.internalNotes || '') + '\n' + today() + ': ' + notes).trim() : r.internalNotes },
      });
      onSave(res.records.find(x => x.id === r.id) || r);
      toast.success('Work order updated');
      setEditing(false);
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  const comments = all.filter(c => c.kind === 'comment' && c.parentId === r.id);
  const cat = String(r.category || 'Other');

  return (
    <div className="wo-detail-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wo-detail-panel">
        <header className="wo-detail-header">
          <div>
            <span className="wo-detail-id">{woNumber(r)} · {cat}</span>
            <h2>{String(r.name || r.title || 'Work order')}</h2>
          </div>
          <div className="wo-detail-header-actions">
            <StatusBadge s={String(r.status || 'New')} />
            <PriorityBadge p={String(r.priority || 'Normal')} />
            <button className="wo-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </header>

        <div className="wo-detail-body">
          <div className="wo-detail-main">
            {r.details && <section className="wo-detail-section"><h4>Request details</h4><p>{String(r.details)}</p></section>}
            {r.safetyImpact && <div className="wo-safety-banner"><ShieldAlert size={15} />{String(r.safetyImpact)}</div>}

            <section className="wo-detail-section">
              <h4>Status &amp; assignment</h4>
              {editing ? (
                <div className="wo-edit-row">
                  <label>Status<select value={status} onChange={e => setStatus(e.target.value)}>
                    {woStatuses.map(s => <option key={s}>{s}</option>)}
                  </select></label>
                  <label>Assigned to<select value={assignee} onChange={e => setAssignee(e.target.value)}>
                    <option value="">— unassigned —</option>
                    {operationsStaff.map(s => <option key={s.id} value={s.id}>{String(s.name)}{s.title ? ` — ${s.title}` : ''}</option>)}
                  </select></label>
                  <label className="wo-full">Work note (appended to internal notes)<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
                  <div className="wo-edit-actions">
                    <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button size="sm" onClick={saveStatus} disabled={saving}>{saving ? 'Saving…' : 'Save update'}</Button>
                  </div>
                </div>
              ) : (
                <dl className="wo-detail-dl">
                  <dt>Status</dt><dd><StatusBadge s={String(r.status||'New')} /></dd>
                  <dt>Priority</dt><dd><PriorityBadge p={String(r.priority||'Normal')} /></dd>
                  <dt>Assigned to</dt><dd>{String(r.assignee || '—')}</dd>
                  <dt>Due date</dt><dd>{String(r.dueDate || '—')}</dd>
                  <dt>Scheduled</dt><dd>{String(r.scheduledDate || '—')}</dd>
                  {canAccess(viewer, 'Work Orders', 'orders', true) &&
                    <dt className="wo-full"><Button size="sm" variant="outline" onClick={() => setEditing(true)}>Update status / assign</Button></dt>}
                </dl>
              )}
            </section>

            {(r.estimatedCost || r.approvedAmount || r.actualCost) && (
              <section className="wo-detail-section">
                <h4>Cost</h4>
                <dl className="wo-detail-dl">
                  {r.estimatedCost && <><dt>Estimated</dt><dd>${Number(r.estimatedCost).toLocaleString()}</dd></>}
                  {r.approvedAmount && <><dt>Approved</dt><dd>${Number(r.approvedAmount).toLocaleString()}</dd></>}
                  {r.actualCost && <><dt>Actual</dt><dd>${Number(r.actualCost).toLocaleString()}</dd></>}
                </dl>
              </section>
            )}

            {comments.length > 0 && (
              <section className="wo-detail-section">
                <h4>Comments &amp; updates</h4>
                <div className="wo-comments">
                  {comments.map(c => (
                    <div key={c.id} className="wo-comment">
                      <span className="wo-comment-meta">{String(c.updatedBy || c.authorId || '?')} · {daysAgo(c.updatedAt || c.createdAt)}</span>
                      <p>{String(c.details || '')}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {r.internalNotes && (
              <section className="wo-detail-section">
                <h4>Internal notes</h4><p className="wo-internal-notes">{String(r.internalNotes)}</p>
              </section>
            )}
          </div>

          <aside className="wo-detail-sidebar">
            <section><h5>Requester</h5><p>{String(r.submittedBy || r.createdBy || '—')}</p></section>
            <section><h5>Submitted</h5><p>{daysAgo(r.createdAt) || String(r.date || '—')}</p></section>
            <section><h5>Category</h5><p>{cat}</p></section>
            {r.requestType && <section><h5>Request type</h5><p>{String(r.requestType)}</p></section>}
            {r.location && <section><h5>Location</h5><p>{String(r.location)}</p></section>}
            {r.relatedVehicle && <section><h5>Vehicle</h5><p>{String(r.relatedVehicle)}</p></section>}
            {r.providerName && <section><h5>Provider</h5><p>{String(r.providerName)}</p></section>}
            {r.provider && <section><h5>Provider</h5><p>{String(r.provider)}</p></section>}
            {r.requiresApproval && <section><h5>Approval</h5><p>{String(r.approvedBy || 'Pending approval')}</p></section>}
            {r.resolution && <section><h5>Resolution</h5><p>{String(r.resolution)}</p></section>}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Work orders list with filters ─────────────────────────────────────────────
function WOList({ orders, all, staff = [], viewer, categoryFilter, title, emptyMsg, statusFilter: initStatusFilter = 'Open' }:
  { orders: Row[]; all: Row[]; staff?: StaffRef[]; viewer: Viewer; categoryFilter?: string; title: string; emptyMsg?: string; statusFilter?: string }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initStatusFilter);
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [detail, setDetail] = useState<Row | null>(null);
  const [localRows, setLocalRows] = useState<Row[]>(orders);
  useEffect(() => { setLocalRows(orders); }, [orders]);

  let filtered = localRows;
  if (categoryFilter) filtered = filtered.filter(r => r.category === categoryFilter);
  if (statusFilter === 'Open') filtered = filtered.filter(isOpen);
  else if (statusFilter !== 'All') filtered = filtered.filter(r => r.status === statusFilter);
  if (priorityFilter !== 'All') filtered = filtered.filter(r => r.priority === priorityFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.details || '').toLowerCase().includes(q) ||
      String(r.assignee || '').toLowerCase().includes(q) ||
      String(r.requestType || '').toLowerCase().includes(q) ||
      woNumber(r).toLowerCase().includes(q)
    );
  }
  filtered = [...filtered].sort((a, b) => {
    const po = ['Emergency','Urgent','Normal','Low'];
    const pa = po.indexOf(String(a.priority||'Normal')), pb = po.indexOf(String(b.priority||'Normal'));
    if (pa !== pb) return pa - pb;
    return String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || ''));
  });

  const open = localRows.filter(r => !categoryFilter || r.category === categoryFilter).filter(isOpen).length;
  const emergency = localRows.filter(r => r.priority === 'Emergency' && isOpen(r)).length;

  return (
    <div className="wo-list-section">
      <div className="wo-list-header">
        <div>
          <h3>{title}</h3>
          <span className="wo-list-counts">{open} open{emergency > 0 && <span className="wo-emergency-badge"><Flame size={12} />{emergency} emergency</span>}</span>
        </div>
      </div>
      <div className="wo-filters">
        <div className="wo-search"><Search size={14} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, ID, or assignee…" /></div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="Open">Open orders</option>
          <option value="All">All statuses</option>
          {woStatuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="All">All priorities</option>
          {woPriorities.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {filtered.length === 0
        ? <div className="wo-empty"><ClipboardList size={32} /><p>{emptyMsg || 'No work orders match your filters.'}</p></div>
        : <div className="wo-cards-grid">{filtered.map(r => <WOCard key={r.id} r={r} onClick={() => setDetail(r)} />)}</div>
      }

      {detail && (
        <WODetail
          r={detail} all={all} staff={staff} viewer={viewer}
          onClose={() => setDetail(null)}
          onSave={updated => setLocalRows(prev => prev.map(x => x.id === updated.id ? updated : x))}
        />
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function WODashboard({ orders, viewer, onTab }: { orders: Row[]; viewer: Viewer; onTab: (t: string) => void }) {
  const open = orders.filter(isOpen);
  const emergency = open.filter(r => r.priority === 'Emergency');
  const urgent = open.filter(r => r.priority === 'Urgent');
  const awaitingApproval = open.filter(isApprovalNeeded);
  const myAssigned = open.filter(r => r.assignee === viewer.person);
  const today_ = today();
  const overdue = open.filter(r => r.dueDate && String(r.dueDate) < today_);

  const byCat = woCategories.map(cat => ({
    cat,
    count: open.filter(r => r.category === cat).length,
  })).filter(x => x.count > 0);

  const recent = [...orders]
    .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))
    .slice(0, 6);

  return (
    <div className="wo-dashboard">
      <div className="wo-metrics">
        <div className="wo-metric"><span className="wo-metric-val">{open.length}</span><span className="wo-metric-label">Open</span></div>
        <div className="wo-metric tone-red"><span className="wo-metric-val">{emergency.length + urgent.length}</span><span className="wo-metric-label">Emergency / Urgent</span></div>
        <div className="wo-metric tone-orange"><span className="wo-metric-val">{overdue.length}</span><span className="wo-metric-label">Overdue</span></div>
        <div className="wo-metric tone-teal"><span className="wo-metric-val">{awaitingApproval.length}</span><span className="wo-metric-label">Awaiting approval</span></div>
        <div className="wo-metric tone-blue"><span className="wo-metric-val">{myAssigned.length}</span><span className="wo-metric-label">Assigned to me</span></div>
      </div>

      {emergency.length > 0 && (
        <div className="wo-emergency-banner">
          <ShieldAlert size={16} />
          <strong>Emergency requests require immediate attention</strong>
          <div className="wo-emergency-list">
            {emergency.map(r => (
              <span key={r.id} className="wo-emergency-item"><Flame size={12} />{String(r.name)}</span>
            ))}
          </div>
        </div>
      )}

      <div className="wo-dashboard-grid">
        <div className="wo-dashboard-card">
          <h4><BarChart3 size={15} />By category</h4>
          <div className="wo-cat-list">
            {byCat.map(({ cat, count }) => (
              <button key={cat} className="wo-cat-row" onClick={() => onTab('cat:' + cat)}>
                <span>{catIcon[cat]}{cat}</span>
                <span className="wo-cat-count">{count}</span>
                <ChevronRight size={13} />
              </button>
            ))}
            {byCat.length === 0 && <p className="wo-empty-small">No open work orders.</p>}
          </div>
        </div>

        <div className="wo-dashboard-card">
          <h4><Clock size={15} />Recent submissions</h4>
          <div className="wo-recent-list">
            {recent.map(r => (
              <div key={r.id} className="wo-recent-row">
                <div>
                  <span className="wo-recent-id">{woNumber(r)}</span>
                  <span className="wo-recent-title">{String(r.name).substring(0, 50)}</span>
                </div>
                <div className="wo-recent-right">
                  <StatusBadge s={String(r.status || 'New')} />
                  <span className="wo-recent-date">{daysAgo(r.createdAt || r.date)}</span>
                </div>
              </div>
            ))}
            {recent.length === 0 && <p className="wo-empty-small">No submissions yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── My Submitted Requests ─────────────────────────────────────────────────────
function MySubmitted({ orders, all, staff, viewer }: { orders: Row[]; all: Row[]; staff: StaffRef[]; viewer: Viewer }) {
  const mine = orders.filter(r => r.submittedBy === viewer.person || r.createdBy === viewer.person);
  return <WOList orders={mine} all={all} staff={staff} viewer={viewer} title="My Submitted Requests"
    emptyMsg="You have not submitted any work orders yet." statusFilter="All" />;
}

// ── My Assigned Work ──────────────────────────────────────────────────────────
function MyAssigned({ orders, all, staff, viewer }: { orders: Row[]; all: Row[]; staff: StaffRef[]; viewer: Viewer }) {
  const mine = orders.filter(r => r.assignee === viewer.person && isOpen(r));
  return <WOList orders={mine} all={all} staff={staff} viewer={viewer} title="My Assigned Work"
    emptyMsg="No work is currently assigned to you." statusFilter="All" />;
}

// ── Approvals ─────────────────────────────────────────────────────────────────
function WOApprovals({ orders, all, staff, viewer, onSave }:
  { orders: Row[]; all: Row[]; staff: StaffRef[]; viewer: Viewer; onSave: (rows: Row[]) => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const pending = orders.filter(r => r.status === 'Awaiting Approval' || (r.requiresApproval && r.status === 'New'));

  async function decide(r: Row, approved: boolean) {
    setSaving(r.id);
    try {
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: {
          ...r,
          status: approved ? 'Approved' : 'Cancelled',
          approvedBy: approved ? viewer.person : undefined,
          approvedAt: approved ? new Date().toISOString() : undefined,
        },
      });
      onSave(res.records);
      toast.success(approved ? 'Work order approved' : 'Work order denied');
    } catch (e) { toast.error((e as Error).message); }
    setSaving(null);
  }

  if (pending.length === 0)
    return <div className="wo-empty-page"><CheckCircle size={36} /><p>No work orders are waiting for approval.</p></div>;

  return (
    <div className="wo-approvals">
      <h3>Approvals ({pending.length})</h3>
      <div className="wo-approval-list">
        {pending.map(r => (
          <div key={r.id} className="wo-approval-card">
            <div className="wo-approval-info">
              <span className="wo-card-id">{woNumber(r)}</span>
              <b>{String(r.name)}</b>
              <p>{String(r.details || '').substring(0, 150)}</p>
              <div className="wo-approval-meta">
                {r.category && <Pill>{String(r.category)}</Pill>}
                {r.priority && <PriorityBadge p={String(r.priority)} />}
                {r.estimatedCost && <span>${Number(r.estimatedCost).toLocaleString()} estimated</span>}
              </div>
            </div>
            <div className="wo-approval-actions">
              <Button size="sm" variant="outline" onClick={() => decide(r, false)} disabled={saving === r.id}>Deny</Button>
              <Button size="sm" onClick={() => decide(r, true)} disabled={saving === r.id}>
                {saving === r.id ? 'Saving…' : 'Approve'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Completed & Historical ────────────────────────────────────────────────────
function WOCompleted({ orders, all, staff, viewer }: { orders: Row[]; all: Row[]; staff: StaffRef[]; viewer: Viewer }) {
  const done = orders.filter(r => !isOpen(r));
  return <WOList orders={done} all={all} staff={staff} viewer={viewer} title="Completed & Historical" statusFilter="All"
    emptyMsg="No completed or closed work orders yet." />;
}

// ── Main workspace ────────────────────────────────────────────────────────────
export default function WorkOrdersWorkspace({ initialTab = 'dashboard', onOpen }: Props) {
  const [data, setData] = useState<WOData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab);
  const [showSubmit, setShowSubmit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await requestJson<WOData>('/api/accounts?surface=orders');
      setData(d);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function mergeRows(rows: Row[]) {
    if (!data) return;
    const map = new Map(data.records.map(r => [r.id, r]));
    for (const r of rows) map.set(r.id, r);
    setData({ ...data, records: [...map.values()] });
  }

  const viewer = data?.viewer;
  const all = data?.records ?? [];
  const orders = all.filter(r => r.kind === 'workOrder');
  const staff = data?.staff ?? [];
  const fleetVehicles = all.filter(r => r.kind === 'fleetVehicle');
  const inspections = all.filter(r => r.kind === 'fleetInspection');
  const defects = all.filter(r => r.kind === 'fleetDefect');
  const pmRecords = all.filter(r => r.kind === 'fleetPM');
  const assets = all.filter(r => r.kind === 'woAsset');
  const providers = all.filter(r => r.kind === 'woProvider');
  const recurring = all.filter(r => r.kind === 'woRecurring');
  const projects = all.filter(r => r.kind === 'woProject');

  const mainTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} /> },
    { id: 'all', label: 'All Work Orders', icon: <ClipboardList size={15} /> },
    { id: 'cat:Account Management', label: 'Account Management', icon: <Building2 size={15} /> },
    { id: 'fleet', label: 'Fleet', icon: <Truck size={15} /> },
    { id: 'cat:IT Support', label: 'IT Support', icon: <Zap size={15} /> },
    { id: 'cat:Facilities & Maintenance', label: 'Facilities', icon: <Settings size={15} /> },
    { id: 'cat:Supplies & Purchasing', label: 'Supplies', icon: <PackageSearch size={15} /> },
    { id: 'cat:Hardware, Software & Access', label: 'Hardware & Access', icon: <Boxes size={15} /> },
    { id: 'recurring', label: 'Recurring', icon: <RotateCcw size={15} /> },
    { id: 'projects', label: 'Projects', icon: <FolderOpen size={15} /> },
    { id: 'assets', label: 'Assets', icon: <Boxes size={15} /> },
    { id: 'providers', label: 'Providers', icon: <Users size={15} /> },
    { id: 'my-requests', label: 'My Requests', icon: <Eye size={15} /> },
    { id: 'my-work', label: 'My Work', icon: <UserCheck size={15} /> },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle size={15} /> },
    { id: 'completed', label: 'Completed', icon: <Star size={15} /> },
  ];

  const activeTab = mainTabs.find(t => t.id === tab) || mainTabs[0];

  return (
    <div className="wo-workspace">
      <Toaster />
      <header className="wo-workspace-header">
        <div className="wo-workspace-title">
          <Wrench size={20} />
          <div>
            <h1>Work Orders</h1>
            <p>Submit, assign, track, complete, and audit all operational work requests.</p>
          </div>
        </div>
        <div className="wo-workspace-actions">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /></Button>
          <Button size="sm" onClick={() => setShowSubmit(true)}><Plus size={15} />Submit request</Button>
        </div>
      </header>

      <nav className="wo-tab-nav" role="tablist">
        {mainTabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`wo-tab ${tab === t.id ? 'wo-tab-active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.icon}{t.label}
            {t.id === 'approvals' && orders.filter(isApprovalNeeded).length > 0 &&
              <span className="wo-tab-badge">{orders.filter(isApprovalNeeded).length}</span>}
          </button>
        ))}
      </nav>

      <main className="wo-main-content">
        {loading && !data && <div className="wo-loading"><RefreshCw className="spin" size={20} />Loading…</div>}
        {error && <div className="wo-error"><AlertTriangle size={16} />{error}</div>}

        {data && viewer && (
          <>
            {tab === 'dashboard' && <WODashboard orders={orders} viewer={viewer} onTab={setTab} />}
            {tab === 'all' && <WOList orders={orders} all={all} staff={staff} viewer={viewer} title="All Work Orders" statusFilter="Open" />}
            {tab.startsWith('cat:') && (
              <WOList orders={orders} all={all} staff={staff} viewer={viewer}
                categoryFilter={tab.slice(4)} title={tab.slice(4)} />
            )}
            {tab === 'fleet' && (
              <WOFleetSection
                vehicles={fleetVehicles} inspections={inspections}
                defects={defects} pmRecords={pmRecords}
                fleetOrders={orders.filter(r => r.category === 'Fleet Maintenance & Repairs')}
                all={all} viewer={viewer}
                onSave={mergeRows}
              />
            )}
            {tab === 'assets' && (
              <WOAssetsSection assets={assets} all={all} viewer={viewer} onSave={mergeRows} />
            )}
            {tab === 'providers' && (
              <WOProvidersSection providers={providers} all={all} viewer={viewer} onSave={mergeRows} />
            )}
            {tab === 'recurring' && <WORecurringSection items={recurring} all={all} viewer={viewer} onSave={mergeRows} />}
            {tab === 'projects' && <WOProjectsSection projects={projects} all={all} viewer={viewer} onSave={mergeRows} />}
            {tab === 'my-requests' && <MySubmitted orders={orders} all={all} staff={staff} viewer={viewer} />}
            {tab === 'my-work' && <MyAssigned orders={orders} all={all} staff={staff} viewer={viewer} />}
            {tab === 'approvals' && <WOApprovals orders={orders} all={all} staff={staff} viewer={viewer} onSave={mergeRows} />}
            {tab === 'completed' && <WOCompleted orders={orders} all={all} staff={staff} viewer={viewer} />}
          </>
        )}
      </main>

      {showSubmit && data && viewer && (
        <WOSubmitForm
          viewer={viewer} all={all} staff={staff}
          onClose={() => setShowSubmit(false)}
          onSubmitted={rows => { mergeRows(rows); setShowSubmit(false); toast.success('Work order submitted'); }}
        />
      )}
    </div>
  );
}

// ── Recurring Work section ────────────────────────────────────────────────────
function WORecurringSection({ items, all, viewer, onSave }:
  { items: Row[]; all: Row[]; viewer: Viewer; onSave: (rows: Row[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setForm({ name: '', category: '', frequency: 'Weekly', startDate: today(), status: 'Active' });
    setShowForm(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setForm(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
    setShowForm(true);
  }
  async function save() {
    setSaving(true);
    try {
      const id = editing?.id || 'woRecurring:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: { ...form, id, kind: 'woRecurring', version: editing?.version ?? 0, name: form.name },
      });
      onSave(res.records);
      setShowForm(false);
      toast.success(editing ? 'Updated' : 'Recurring work created');
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  const freqs = ['Daily','Weekly','Every 2 weeks','Monthly','Quarterly','Annually','Custom mileage / hours','Other'];
  const cats = ['Weekly truck inspection','Monthly camera check','Fire-extinguisher check','Office-supply inventory','Portable-toilet service','Dumpster pickup','Landscaping','Pest control','Window AC maintenance','Property-sign inspection','Vehicle oil change','Registration / inspection renewal','Software-license renewal','Equipment inventory','Office deep cleaning','Other'];

  return (
    <div className="wo-section">
      <div className="wo-section-header">
        <h3>Recurring Work ({items.filter(r=>r.status==='Active').length} active)</h3>
        {canAccess(viewer, 'Work Orders', 'orders', true) &&
          <Button size="sm" onClick={openNew}><Plus size={14} />Add recurring work</Button>}
      </div>

      {items.length === 0 && !showForm &&
        <div className="wo-empty"><RotateCcw size={32} /><p>No recurring work configured yet.</p></div>}

      <div className="wo-item-grid">
        {items.map(r => (
          <div key={r.id} className={`wo-item-card ${r.status === 'Active' ? 'active' : 'paused'}`}>
            <div className="wo-item-card-top">
              <b>{String(r.name)}</b>
              <Pill className={r.status === 'Active' ? 'tone-teal' : 'tone-gray'}>{String(r.status)}</Pill>
            </div>
            <p>{String(r.category || '')}</p>
            <div className="wo-item-meta">
              <span><Calendar size={13} />{String(r.frequency || '—')}</span>
              {r.nextDue && <span><Clock size={13} />Next: {String(r.nextDue)}</span>}
              {r.assignedTo && <span><UserCheck size={13} />{String(r.assignedTo)}</span>}
              {r.estimatedCost && <span>${Number(r.estimatedCost).toLocaleString()}/occurrence</span>}
            </div>
            {canAccess(viewer, 'Work Orders', 'orders', true) &&
              <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="wo-inline-form">
          <h4>{editing ? 'Edit recurring work' : 'Add recurring work'}</h4>
          <div className="wo-form-grid">
            <label>Name (required)<input value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></label>
            <label>Category<select value={form.category||''} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
              <option value="">Select…</option>{cats.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>Frequency<select value={form.frequency||'Weekly'} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))}>
              {freqs.map(c=><option key={c}>{c}</option>)}</select></label>
            <label>Start date<input type="date" value={form.startDate||''} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} /></label>
            <label>Next due<input type="date" value={form.nextDue||''} onChange={e=>setForm(f=>({...f,nextDue:e.target.value}))} /></label>
            <label>Status<select value={form.status||'Active'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
              <option>Active</option><option>Paused</option><option>Completed</option></select></label>
            <label>Estimated cost ($)<input type="number" value={form.estimatedCost||''} onChange={e=>setForm(f=>({...f,estimatedCost:e.target.value}))} /></label>
            <label className="wo-full">Notes<textarea rows={2} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></label>
          </div>
          <div className="wo-form-actions">
            <Button variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Projects section ──────────────────────────────────────────────────────────
function WOProjectsSection({ projects, all, viewer, onSave }:
  { projects: Row[]; all: Row[]; viewer: Viewer; onSave: (rows: Row[]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const orders = all.filter(r => r.kind === 'workOrder');

  function openNew() {
    setEditing(null);
    setForm({ name: '', status: 'Planning', progressPercent: '0' });
    setShowForm(true);
  }
  function openEdit(r: Row) {
    setEditing(r);
    setForm(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
    setShowForm(true);
  }
  async function save() {
    setSaving(true);
    try {
      const id = editing?.id || 'woProject:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: { ...form, id, kind: 'woProject', version: editing?.version ?? 0, name: form.name, progressPercent: Number(form.progressPercent) || 0, budget: form.budget ? Number(form.budget) : undefined },
      });
      onSave(res.records);
      setShowForm(false);
      toast.success(editing ? 'Updated' : 'Project created');
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  return (
    <div className="wo-section">
      <div className="wo-section-header">
        <h3>Projects ({projects.filter(r=>r.status==='Active').length} active)</h3>
        {canAccess(viewer, 'Work Orders', 'orders', true) &&
          <Button size="sm" onClick={openNew}><Plus size={14} />New project</Button>}
      </div>

      {projects.length === 0 && !showForm &&
        <div className="wo-empty"><FolderOpen size={32} /><p>No projects yet.</p></div>}

      <div className="wo-project-grid">
        {projects.map(r => {
          const linked = orders.filter(o => o.projectId === r.id);
          const pct = Number(r.progressPercent) || 0;
          return (
            <div key={r.id} className="wo-project-card">
              <div className="wo-project-top">
                <div>
                  <b>{String(r.name)}</b>
                  <p className="wo-project-scope">{String(r.purpose || '').substring(0,100)}</p>
                </div>
                <Pill className={r.status==='Active'?'tone-teal':r.status==='Completed'?'tone-green':'tone-gray'}>{String(r.status||'Planning')}</Pill>
              </div>
              <div className="wo-progress-bar"><div className="wo-progress-fill" style={{width:pct+'%'}} /></div>
              <span className="wo-progress-label">{pct}% complete</span>
              <div className="wo-project-meta">
                {r.budget && <span>${Number(r.budget).toLocaleString()} budget</span>}
                {r.targetDate && <span><Calendar size={12} />Target: {String(r.targetDate)}</span>}
                <span><ClipboardList size={12} />{linked.length} work orders</span>
              </div>
              {r.risks && <div className="wo-project-risks"><AlertTriangle size={12} />{String(r.risks).substring(0,120)}</div>}
              {canAccess(viewer, 'Work Orders', 'orders', true) &&
                <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit project</Button>}
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="wo-inline-form">
          <h4>{editing ? 'Edit project' : 'New project'}</h4>
          <div className="wo-form-grid">
            <label>Project name (required)<input value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></label>
            <label>Status<select value={form.status||'Planning'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
              {['Planning','Active','On Hold','Completed','Cancelled'].map(s=><option key={s}>{s}</option>)}</select></label>
            <label>Budget ($)<input type="number" value={form.budget||''} onChange={e=>setForm(f=>({...f,budget:e.target.value}))} /></label>
            <label>Target completion<input type="date" value={form.targetDate||''} onChange={e=>setForm(f=>({...f,targetDate:e.target.value}))} /></label>
            <label>Progress (%)<input type="number" min="0" max="100" value={form.progressPercent||'0'} onChange={e=>setForm(f=>({...f,progressPercent:e.target.value}))} /></label>
            <label className="wo-full">Purpose / scope<textarea rows={2} value={form.purpose||''} onChange={e=>setForm(f=>({...f,purpose:e.target.value}))} /></label>
            <label className="wo-full">Risks / blockers<textarea rows={2} value={form.risks||''} onChange={e=>setForm(f=>({...f,risks:e.target.value}))} /></label>
          </div>
          <div className="wo-form-actions">
            <Button variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving?'Saving…':'Save project'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}


