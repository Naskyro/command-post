'use client';
import { useState } from 'react';
import {
  Truck, Plus, AlertTriangle, CheckCircle, Clock, Wrench,
  ChevronDown, ChevronRight, ClipboardList, X, Flame, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/shared/client';
import { canAccess } from '@/lib/finance/access';
import type { Viewer } from '@/lib/finance/model';
import type { Row } from '@/lib/accounts/model';
import { today } from '@/lib/accounts/model';
import { fleetVehicleStatuses } from '@/lib/accounts/work-options';
import { toast } from 'sonner';

interface Props {
  vehicles: Row[];
  inspections: Row[];
  defects: Row[];
  pmRecords: Row[];
  fleetOrders: Row[];
  all: Row[];
  viewer: Viewer;
  onSave: (rows: Row[]) => void;
}

type FleetTab = 'vehicles' | 'daily-inspection' | 'defects' | 'pm' | 'work-orders';

const statusColor: Record<string, string> = {
  'Ready': 'tone-teal',
  'Ready With Noncritical Issues': 'tone-blue',
  'Limited Use': 'tone-orange',
  'Scheduled for Service': 'tone-blue',
  'Awaiting Repair': 'tone-orange',
  'Out of Service': 'tone-red',
  'Sold': 'tone-gray',
  'Retired': 'tone-gray',
  'Historical': 'tone-gray',
};

function Pill({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`wo-pill ${className}`}>{children}</span>;
}

// ── Vehicle profile card ──────────────────────────────────────────────────────
function VehicleCard({ v, onClick }: { v: Row; onClick: () => void }) {
  const status = String(v.status || 'Ready');
  const isOOS = status === 'Out of Service';
  return (
    <div className={`wo-vehicle-card ${isOOS ? 'oos' : ''}`} onClick={onClick}>
      <div className="wo-vehicle-top">
        <div className="wo-vehicle-title">
          <Truck size={16} />
          <div>
            <b>Unit {String(v.unitNumber || '?')} — {String(v.year || '')} {String(v.make || '')} {String(v.model || '')}</b>
            <span className="wo-vehicle-plate">{String(v.plate || '')} {String(v.plateState || '')}</span>
          </div>
        </div>
        <Pill className={statusColor[status] || 'tone-gray'}>{status}</Pill>
      </div>
      <div className="wo-vehicle-meta">
        {v.currentMileage && <span><Clock size={12} />{Number(v.currentMileage).toLocaleString()} mi</span>}
        {v.assignedDriver && <span>Driver: {String(v.assignedDriver)}</span>}
        {v.registrationExpiry && <span>Reg: {String(v.registrationExpiry)}</span>}
        {v.inspectionExpiry && <span>Insp: {String(v.inspectionExpiry)}</span>}
        {v.fuelType && <span>{String(v.fuelType)}</span>}
      </div>
      {isOOS && <div className="wo-oos-banner"><AlertTriangle size={13} />Out of Service — do not dispatch</div>}
    </div>
  );
}

// ── Vehicle form ──────────────────────────────────────────────────────────────
function VehicleForm({ initial, onClose, onSave }: { initial?: Row; onClose: () => void; onSave: (rows: Row[]) => void }) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    initial
      ? Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v ?? '')]))
      : { unitNumber: '', year: '', make: '', model: '', fuelType: 'Diesel', vehicleType: 'Tow truck', status: 'Ready' }
  );
  const [saving, setSaving] = useState(false);
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.unitNumber || !form.make || !form.model) { toast.error('Unit number, make, and model are required.'); return; }
    setSaving(true);
    try {
      const id = initial?.id || 'fleetVehicle:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: {
          ...form,
          id, kind: 'fleetVehicle', version: initial?.version ?? 0,
          name: `Unit ${form.unitNumber} — ${form.year} ${form.make} ${form.model}`,
          currentMileage: form.currentMileage ? Number(form.currentMileage) : undefined,
          currentEngineHours: form.currentEngineHours ? Number(form.currentEngineHours) : undefined,
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        },
      });
      onSave(res.records);
      toast.success(initial ? 'Vehicle updated' : 'Vehicle added');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  return (
    <div className="wo-detail-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wo-form-modal">
        <header className="wo-form-modal-header">
          <h3>{initial ? 'Edit vehicle' : 'Add vehicle'}</h3>
          <button className="wo-icon-btn" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="wo-form-grid wo-form-modal-body">
          <label>Unit number *<input value={form.unitNumber||''} onChange={e=>set('unitNumber',e.target.value)} /></label>
          <label>Status<select value={form.status||'Ready'} onChange={e=>set('status',e.target.value)}>
            {fleetVehicleStatuses.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>Year<input type="number" value={form.year||''} onChange={e=>set('year',e.target.value)} /></label>
          <label>Make *<input value={form.make||''} onChange={e=>set('make',e.target.value)} /></label>
          <label>Model *<input value={form.model||''} onChange={e=>set('model',e.target.value)} /></label>
          <label>Vehicle type<select value={form.vehicleType||'Tow truck'} onChange={e=>set('vehicleType',e.target.value)}>
            {['Tow truck','Pickup truck','Van','Car','Other'].map(t=><option key={t}>{t}</option>)}</select></label>
          <label>Fuel type<select value={form.fuelType||'Diesel'} onChange={e=>set('fuelType',e.target.value)}>
            {['Diesel','Gas','Electric','Hybrid'].map(t=><option key={t}>{t}</option>)}</select></label>
          <label>VIN<input value={form.vin||''} onChange={e=>set('vin',e.target.value)} /></label>
          <label>License plate<input value={form.plate||''} onChange={e=>set('plate',e.target.value)} /></label>
          <label>Plate state<input value={form.plateState||''} onChange={e=>set('plateState',e.target.value)} maxLength={2} /></label>
          <label>Current mileage<input type="number" value={form.currentMileage||''} onChange={e=>set('currentMileage',e.target.value)} /></label>
          <label>Engine hours<input type="number" value={form.currentEngineHours||''} onChange={e=>set('currentEngineHours',e.target.value)} /></label>
          <label>Purchase date<input type="date" value={form.purchaseDate||''} onChange={e=>set('purchaseDate',e.target.value)} /></label>
          <label>Purchase price ($)<input type="number" value={form.purchasePrice||''} onChange={e=>set('purchasePrice',e.target.value)} /></label>
          <label>Registration expiration<input type="date" value={form.registrationExpiry||''} onChange={e=>set('registrationExpiry',e.target.value)} /></label>
          <label>State inspection expiration<input type="date" value={form.inspectionExpiry||''} onChange={e=>set('inspectionExpiry',e.target.value)} /></label>
          <label>Insurance info<input value={form.insuranceInfo||''} onChange={e=>set('insuranceInfo',e.target.value)} /></label>
          <label>Operating permits<input value={form.operatingPermits||''} onChange={e=>set('operatingPermits',e.target.value)} /></label>
          <label>Assigned driver<input value={form.assignedDriver||''} onChange={e=>set('assignedDriver',e.target.value)} /></label>
          <label className="wo-full">Notes<textarea rows={2} value={form.notes||''} onChange={e=>set('notes',e.target.value)} /></label>
        </div>
        <div className="wo-form-actions wo-form-modal-footer">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving?'Saving…':'Save vehicle'}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Daily inspection form ─────────────────────────────────────────────────────
function DailyInspectionForm({ vehicles, viewer, onClose, onSave }:
  { vehicles: Row[]; viewer: Viewer; onClose: () => void; onSave: (rows: Row[]) => void }) {
  const [vehicleId, setVehicleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<Record<string, string>>({
    dashboardWarnings: '', visibleLeaks: '', brakesOk: '', steeringOk: '',
    tiresOk: '', lightsOk: '', horn: '', seatbelts: '', cameras: '', radio: '',
    wheelLift: '', winch: '', strapsChains: '', safetyVest: '',
    cabCleanliness: '', exteriorCleanliness: '', newDamage: '', unusualConcerns: '',
  });
  const [safeToOperate, setSafeToOperate] = useState('');
  const [notes, setNotes] = useState('');
  const [inspType, setInspType] = useState('Daily pre-trip');

  const yesNo = ['Yes', 'No', 'Not Checked', 'Not Applicable'];
  const clean = ['Clean', 'Needs Attention', 'Unacceptable'];

  const boolChecks: [string, string][] = [
    ['dashboardWarnings', 'New dashboard warning lights'],
    ['visibleLeaks', 'Visible fluid leaks'],
    ['brakesOk', 'Brakes operating correctly'],
    ['steeringOk', 'Steering operating correctly'],
    ['tiresOk', 'Tires visually inflated and undamaged'],
    ['lightsOk', 'All lights (headlights, brake, turn, lightbar)'],
    ['horn', 'Horn'],
    ['seatbelts', 'Seatbelts'],
    ['cameras', 'Cameras'],
    ['radio', 'Two-way radio'],
    ['wheelLift', 'Wheel lift'],
    ['winch', 'Winch and cable'],
    ['strapsChains', 'Straps, chains, hooks, dollies present'],
    ['safetyVest', 'High-visibility vests in door pockets'],
    ['newDamage', 'New interior or exterior damage'],
    ['unusualConcerns', 'Unusual noises, odors, vibrations, or concerns'],
  ];

  async function submit() {
    if (!vehicleId) { toast.error('Select a vehicle.'); return; }
    if (!safeToOperate) { toast.error('Answer the safe-to-operate question.'); return; }
    const unsafe = safeToOperate === 'No — do not operate';
    setSaving(true);
    try {
      const id = 'fleetInspection:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: {
          id, kind: 'fleetInspection', version: 0,
          name: `${inspType} — ${today()}`,
          vehicleId, inspType, driver: viewer.person, date: today(),
          ...checks, safeToOperate, notes,
          defectCreated: unsafe,
        },
      });
      // If unsafe, also create a defect
      if (unsafe) {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        const defId = 'fleetDefect:' + crypto.randomUUID();
        await requestJson<{ records: Row[] }>('/api/accounts', {
          action: 'save',
          record: {
            id: defId, kind: 'fleetDefect', version: 0,
            name: `Defect — ${String(vehicle?.name || vehicleId)} — ${today()}`,
            vehicleId, reportedBy: viewer.person, date: today(),
            description: notes || 'Reported via daily inspection. Vehicle marked unsafe to operate.',
            safeToOperate: 'No — do not operate',
            severity: 'Critical',
            status: 'Reported',
          },
        });
        // Also update vehicle status to Out of Service
        const veh = vehicles.find(v => v.id === vehicleId);
        if (veh) {
          await requestJson<{ records: Row[] }>('/api/accounts', {
            action: 'save',
            record: { ...veh, status: 'Out of Service' },
          });
        }
      }
      onSave(res.records);
      toast.success(unsafe ? 'Inspection submitted. Vehicle marked Out of Service.' : 'Inspection submitted');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  const unsafe = safeToOperate === 'No — do not operate';

  return (
    <div className="wo-detail-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wo-form-modal wo-inspection-modal">
        <header className="wo-form-modal-header">
          <h3>Driver Inspection</h3>
          <button className="wo-icon-btn" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="wo-form-modal-body">
          <div className="wo-form-grid">
            <label>Vehicle *
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
                <option value="">— Select vehicle —</option>
                {vehicles.filter(v => !['Sold','Retired','Historical'].includes(String(v.status))).map(v =>
                  <option key={v.id} value={v.id}>{String(v.name || v.unitNumber || v.id)}</option>
                )}
              </select>
            </label>
            <label>Inspection type
              <select value={inspType} onChange={e => setInspType(e.target.value)}>
                <option>Daily pre-trip</option><option>Daily post-trip</option>
              </select>
            </label>
            <label>Driver: <b>{viewer.name}</b></label>
            <label>Date: <b>{today()}</b></label>
          </div>

          <h4 className="wo-insp-section">Quick checks</h4>
          <p className="wo-step-hint">Answer each item. Report what you observe — diagnosis not required.</p>
          <div className="wo-check-list">
            {boolChecks.map(([key, label]) => (
              <div key={key} className={`wo-check-row ${checks[key] === 'No' || checks[key] === 'Yes' && ['newDamage','unusualConcerns','dashboardWarnings','visibleLeaks'].includes(key) ? 'flagged' : ''}`}>
                <span className="wo-check-label">{label}</span>
                <div className="wo-check-options">
                  {yesNo.map(opt => (
                    <button key={opt}
                      className={`wo-check-opt ${checks[key] === opt ? 'selected' : ''}`}
                      onClick={() => setChecks(c => ({ ...c, [key]: opt }))}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="wo-check-row">
              <span className="wo-check-label">Cab cleanliness</span>
              <div className="wo-check-options">
                {clean.map(opt => (
                  <button key={opt}
                    className={`wo-check-opt ${checks.cabCleanliness === opt ? 'selected' : ''}`}
                    onClick={() => setChecks(c => ({ ...c, cabCleanliness: opt }))}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="wo-check-row">
              <span className="wo-check-label">Exterior cleanliness</span>
              <div className="wo-check-options">
                {clean.map(opt => (
                  <button key={opt}
                    className={`wo-check-opt ${checks.exteriorCleanliness === opt ? 'selected' : ''}`}
                    onClick={() => setChecks(c => ({ ...c, exteriorCleanliness: opt }))}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h4 className="wo-insp-section">Final assessment</h4>
          <div className="wo-safe-question">
            <b>Is this vehicle safe to operate today?</b>
            <div className="wo-safe-options">
              {['Yes — safe to operate', 'No — do not operate'].map(opt => (
                <button key={opt}
                  className={`wo-safe-opt ${safeToOperate === opt ? opt.startsWith('Yes') ? 'safe' : 'unsafe' : ''}`}
                  onClick={() => setSafeToOperate(opt)}>
                  {opt.startsWith('Yes') ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {unsafe && (
            <div className="wo-safety-warn">
              <Flame size={14} />
              <b>Do Not Operate.</b> This vehicle will be marked Out of Service and a defect report will be created. Operations will be notified.
            </div>
          )}

          <label className="wo-full">Notes / observations
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe any issues, unusual conditions, or damage observed…" />
          </label>
        </div>
        <div className="wo-form-actions wo-form-modal-footer">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className={unsafe ? 'wo-btn-danger' : ''}>
            {saving ? 'Submitting…' : unsafe ? 'Submit — Mark Out of Service' : 'Submit inspection'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Defect / repair card ──────────────────────────────────────────────────────
function DefectCard({ r, vehicles, viewer, all, onSave }:
  { r: Row; vehicles: Row[]; viewer: Viewer; all: Row[]; onSave: (rows: Row[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(String(r.status || 'Reported'));
  const vehicle = vehicles.find(v => v.id === r.vehicleId);
  const isOpen = !['Completed','Cancelled','Deferred'].includes(String(r.status));

  async function updateStatus(newStatus: string) {
    setSaving(true);
    try {
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save', record: { ...r, status: newStatus },
      });
      onSave(res.records);
      toast.success('Defect updated');
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  return (
    <div className={`wo-defect-card ${String(r.severity||'').toLowerCase()}`}>
      <div className="wo-defect-top">
        <div>
          <div className="wo-defect-title">
            <AlertTriangle size={14} />
            <b>{String(r.name || 'Defect report')}</b>
          </div>
          <span className="wo-vehicle-ref">{vehicle ? String(vehicle.name) : String(r.vehicleId || '—')}</span>
        </div>
        <div className="wo-defect-badges">
          {r.severity && <span className={`wo-severity ${String(r.severity).toLowerCase()}`}>{String(r.severity)}</span>}
          <span className="wo-pill">{String(r.status || 'Reported')}</span>
          <button className="wo-expand-btn" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>
      <p className="wo-defect-desc">{String(r.description || '').substring(0, 120)}</p>

      {expanded && (
        <div className="wo-defect-detail">
          {r.safeToOperate && <p><Shield size={12} /><b>Safe to operate:</b> {String(r.safeToOperate)}</p>}
          {r.diagnosis && <p><b>Diagnosis:</b> {String(r.diagnosis)}</p>}
          {r.rootCause && <p><b>Root cause:</b> {String(r.rootCause)}</p>}
          {r.recommendedRepair && <p><b>Recommended repair:</b> {String(r.recommendedRepair)}</p>}
          {r.estimatedCost && <p><b>Estimated cost:</b> ${Number(r.estimatedCost).toLocaleString()}</p>}
          {r.actualCost && <p><b>Actual cost:</b> ${Number(r.actualCost).toLocaleString()}</p>}
          {isOpen && canAccess(viewer, 'Work Orders', 'orders', true) && (
            <div className="wo-defect-actions">
              <label>Update status:
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  {['Reported','Inspection Needed','Awaiting Diagnosis','Awaiting Estimate','Awaiting Approval','Approved','Scheduled','Awaiting Parts','In Repair','Ready for Verification','Completed','Deferred','Cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
              <Button size="sm" onClick={() => updateStatus(status)} disabled={saving}>{saving ? '…' : 'Update'}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PM schedule card ──────────────────────────────────────────────────────────
function PMCard({ r, vehicles }: { r: Row; vehicles: Row[] }) {
  const vehicle = vehicles.find(v => v.id === r.vehicleId);
  const isOverdue = r.status === 'Overdue' || r.status === 'Critical';
  return (
    <div className={`wo-pm-card ${isOverdue ? 'overdue' : ''}`}>
      <div className="wo-pm-top">
        <b>{String(r.serviceType || r.name)}</b>
        <span className={`wo-pill ${isOverdue ? 'tone-red' : r.status === 'Due' ? 'tone-orange' : 'tone-blue'}`}>
          {String(r.status || 'Upcoming')}
        </span>
      </div>
      <p>{vehicle ? String(vehicle.name) : String(r.vehicleId || '—')}</p>
      <div className="wo-pm-meta">
        {r.nextDueDate && <span><Clock size={12} />Due: {String(r.nextDueDate)}</span>}
        {r.nextDueMileage && <span>Due at: {Number(r.nextDueMileage).toLocaleString()} mi</span>}
        {r.estimatedCost && <span>${Number(r.estimatedCost).toLocaleString()} estimated</span>}
        {r.preferredProvider && <span>Provider: {String(r.preferredProvider)}</span>}
      </div>
    </div>
  );
}

// ── Fleet work orders ─────────────────────────────────────────────────────────
function FleetWorkOrders({ orders, vehicles, all, viewer }:
  { orders: Row[]; vehicles: Row[]; all: Row[]; viewer: Viewer }) {
  if (orders.length === 0)
    return <div className="wo-empty"><Wrench size={32} /><p>No fleet work orders yet. Submit a fleet request to get started.</p></div>;
  return (
    <div className="wo-cards-grid">
      {orders.map(r => (
        <div key={r.id} className="wo-card tone-blue">
          <div className="wo-priority-bar tone-blue" />
          <div className="wo-card-body">
            <header className="wo-card-header">
              <span className="wo-card-id">{String(r.id).replace('workOrder:','WO-').substring(0,12)}</span>
              <span className={`wo-pill ${r.status==='Completed'?'tone-teal':r.status==='In Progress'?'tone-blue':'tone-gray'}`}>{String(r.status||'New')}</span>
            </header>
            <b className="wo-card-title">{String(r.name)}</b>
            {r.relatedVehicle && <p className="wo-card-details">{String(vehicles.find(v=>v.id===r.relatedVehicle)?.name || r.relatedVehicle)}</p>}
            <div className="wo-card-footer">
              {r.assignee && <span>{String(r.assignee)}</span>}
              {r.estimatedCost && <span>${Number(r.estimatedCost).toLocaleString()} est.</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Fleet section main ────────────────────────────────────────────────────────
export default function WOFleetSection({ vehicles, inspections, defects, pmRecords, fleetOrders, all, viewer, onSave }: Props) {
  const [fleetTab, setFleetTab] = useState<FleetTab>('vehicles');
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Row | null>(null);
  const [showInspForm, setShowInspForm] = useState(false);
  const [showPMForm, setShowPMForm] = useState(false);
  const [pmForm, setPMForm] = useState<Record<string, string>>({});
  const [pmSaving, setPMSaving] = useState(false);

  const activeVehicles = vehicles.filter(v => !['Sold','Retired','Historical','Totaled'].includes(String(v.status)));
  const oosVehicles = vehicles.filter(v => v.status === 'Out of Service');
  const openDefects = defects.filter(d => !['Completed','Cancelled'].includes(String(d.status)));
  const overdueOrDuePM = pmRecords.filter(p => ['Due','Overdue','Critical'].includes(String(p.status)));

  const fleetTabs: { id: FleetTab; label: string; badge?: number }[] = [
    { id: 'vehicles', label: 'Vehicles', badge: oosVehicles.length || undefined },
    { id: 'daily-inspection', label: 'Daily Inspection' },
    { id: 'defects', label: 'Defects & Repairs', badge: openDefects.length || undefined },
    { id: 'pm', label: 'Preventive Maintenance', badge: overdueOrDuePM.length || undefined },
    { id: 'work-orders', label: 'Work Orders' },
  ];

  async function savePM() {
    if (!pmForm.vehicleId || !pmForm.serviceType) { toast.error('Vehicle and service type are required.'); return; }
    setPMSaving(true);
    try {
      const id = 'fleetPM:' + crypto.randomUUID();
      const res = await requestJson<{ records: Row[] }>('/api/accounts', {
        action: 'save',
        record: {
          ...pmForm, id, kind: 'fleetPM', version: 0,
          name: `${pmForm.serviceType} — ${String(vehicles.find(v => v.id === pmForm.vehicleId)?.name || pmForm.vehicleId)}`,
          estimatedCost: pmForm.estimatedCost ? Number(pmForm.estimatedCost) : undefined,
          intervalValue: pmForm.intervalValue ? Number(pmForm.intervalValue) : undefined,
          lastCompletedMileage: pmForm.lastCompletedMileage ? Number(pmForm.lastCompletedMileage) : undefined,
          nextDueMileage: pmForm.nextDueMileage ? Number(pmForm.nextDueMileage) : undefined,
        },
      });
      onSave(res.records);
      toast.success('PM schedule added');
      setShowPMForm(false);
      setPMForm({});
    } catch (e) { toast.error((e as Error).message); }
    setPMSaving(false);
  }

  const allPMServices = ['Oil and filter','Diesel fuel filter','Air filter','Transmission','Differential','Coolant flush','Brake inspection','Tire rotation','Battery test','Suspension check','Hydraulics','Wheel lift','Winch / cable','Lightbar check','Camera check','Radio check','State inspection','Registration renewal','Insurance renewal','Operating permit renewal','Other'];

  return (
    <div className="wo-fleet-section">
      <div className="wo-fleet-header">
        <div className="wo-fleet-metrics">
          <span className="wo-fleet-metric"><Truck size={14} />{activeVehicles.length} active vehicles</span>
          {oosVehicles.length > 0 && <span className="wo-fleet-metric tone-red"><AlertTriangle size={14} />{oosVehicles.length} out of service</span>}
          {openDefects.length > 0 && <span className="wo-fleet-metric tone-orange"><Wrench size={14} />{openDefects.length} open defects</span>}
          {overdueOrDuePM.length > 0 && <span className="wo-fleet-metric tone-orange"><Clock size={14} />{overdueOrDuePM.length} PM due/overdue</span>}
        </div>
      </div>

      <nav className="wo-sub-tab-nav">
        {fleetTabs.map(t => (
          <button key={t.id}
            className={`wo-sub-tab ${fleetTab === t.id ? 'active' : ''}`}
            onClick={() => setFleetTab(t.id)}>
            {t.label}
            {t.badge ? <span className="wo-tab-badge">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      <div className="wo-fleet-content">
        {/* Vehicles tab */}
        {fleetTab === 'vehicles' && (
          <div>
            <div className="wo-section-header">
              <h3>Company Vehicles ({activeVehicles.length} active)</h3>
              {canAccess(viewer, 'Work Orders', 'orders', true) && (
                <Button size="sm" onClick={() => { setEditVehicle(null); setShowVehicleForm(true); }}>
                  <Plus size={14} />Add vehicle
                </Button>
              )}
            </div>
            {vehicles.length === 0
              ? <div className="wo-empty"><Truck size={36} /><p>No vehicles in the directory yet.</p></div>
              : <div className="wo-vehicle-grid">
                  {vehicles.map(v => (
                    <VehicleCard key={v.id} v={v} onClick={() => { setEditVehicle(v); setShowVehicleForm(true); }} />
                  ))}
                </div>
            }
          </div>
        )}

        {/* Daily inspection */}
        {fleetTab === 'daily-inspection' && (
          <div>
            <div className="wo-section-header">
              <h3>Driver Inspections</h3>
              <Button size="sm" onClick={() => setShowInspForm(true)}>
                <Plus size={14} />Start inspection
              </Button>
            </div>
            {inspections.length === 0
              ? <div className="wo-empty"><ClipboardList size={36} /><p>No inspections recorded yet.</p></div>
              : <div className="wo-inspection-list">
                  {[...inspections].sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).slice(0, 20).map(insp => {
                    const vehicle = vehicles.find(v => v.id === insp.vehicleId);
                    const unsafe = String(insp.safeToOperate || '').startsWith('No');
                    return (
                      <div key={insp.id} className={`wo-insp-row ${unsafe ? 'unsafe' : ''}`}>
                        <div>
                          <b>{String(insp.inspType || 'Inspection')}</b>
                          <span>{vehicle ? String(vehicle.name) : String(insp.vehicleId || '—')}</span>
                          <span>{String(insp.date || '—')} · {String(insp.driver || '—')}</span>
                        </div>
                        <span className={`wo-pill ${unsafe ? 'tone-red' : 'tone-teal'}`}>
                          {unsafe ? 'Unsafe' : 'Clear'}
                        </span>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        )}

        {/* Defects */}
        {fleetTab === 'defects' && (
          <div>
            <div className="wo-section-header">
              <h3>Defects &amp; Repairs ({openDefects.length} open)</h3>
            </div>
            {defects.length === 0
              ? <div className="wo-empty"><Wrench size={36} /><p>No defect reports yet.</p></div>
              : <div className="wo-defect-list">
                  {[...defects].sort((a,b) => {
                    const so = ['Critical','High','Medium','Low'];
                    return so.indexOf(String(a.severity||'Low')) - so.indexOf(String(b.severity||'Low'));
                  }).map(d => (
                    <DefectCard key={d.id} r={d} vehicles={vehicles} viewer={viewer} all={all} onSave={onSave} />
                  ))}
                </div>
            }
          </div>
        )}

        {/* PM tab */}
        {fleetTab === 'pm' && (
          <div>
            <div className="wo-section-header">
              <h3>Preventive Maintenance Schedules</h3>
              {canAccess(viewer, 'Work Orders', 'orders', true) && (
                <Button size="sm" onClick={() => { setPMForm({}); setShowPMForm(true); }}>
                  <Plus size={14} />Add PM schedule
                </Button>
              )}
            </div>
            {overdueOrDuePM.length > 0 && (
              <div className="wo-pm-alert">
                <AlertTriangle size={14} />{overdueOrDuePM.length} maintenance item{overdueOrDuePM.length > 1 ? 's' : ''} due or overdue
              </div>
            )}
            {pmRecords.length === 0 && !showPMForm
              ? <div className="wo-empty"><Clock size={36} /><p>No preventive maintenance schedules yet.</p></div>
              : <div className="wo-pm-grid">{pmRecords.map(r => <PMCard key={r.id} r={r} vehicles={vehicles} />)}</div>
            }
            {showPMForm && (
              <div className="wo-inline-form">
                <h4>Add PM schedule</h4>
                <div className="wo-form-grid">
                  <label>Vehicle *
                    <select value={pmForm.vehicleId||''} onChange={e=>setPMForm(f=>({...f,vehicleId:e.target.value}))}>
                      <option value="">— Select —</option>
                      {vehicles.map(v=><option key={v.id} value={v.id}>{String(v.name||v.id)}</option>)}
                    </select>
                  </label>
                  <label>Service type *
                    <select value={pmForm.serviceType||''} onChange={e=>setPMForm(f=>({...f,serviceType:e.target.value}))}>
                      <option value="">— Select —</option>
                      {allPMServices.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </label>
                  <label>Interval type
                    <select value={pmForm.intervalType||''} onChange={e=>setPMForm(f=>({...f,intervalType:e.target.value}))}>
                      <option value="">Select…</option>
                      {['Mileage','Engine hours','Calendar days','Monthly','Quarterly','Annual','Custom'].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </label>
                  <label>Interval amount
                    <input type="number" value={pmForm.intervalValue||''} onChange={e=>setPMForm(f=>({...f,intervalValue:e.target.value}))} />
                  </label>
                  <label>Last completed
                    <input type="date" value={pmForm.lastCompletedDate||''} onChange={e=>setPMForm(f=>({...f,lastCompletedDate:e.target.value}))} />
                  </label>
                  <label>Next due date
                    <input type="date" value={pmForm.nextDueDate||''} onChange={e=>setPMForm(f=>({...f,nextDueDate:e.target.value}))} />
                  </label>
                  <label>Next due mileage
                    <input type="number" value={pmForm.nextDueMileage||''} onChange={e=>setPMForm(f=>({...f,nextDueMileage:e.target.value}))} />
                  </label>
                  <label>Status
                    <select value={pmForm.status||'Upcoming'} onChange={e=>setPMForm(f=>({...f,status:e.target.value}))}>
                      {['Upcoming','Due Soon','Due','Overdue','Critical'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </label>
                  <label>Estimated cost ($)
                    <input type="number" value={pmForm.estimatedCost||''} onChange={e=>setPMForm(f=>({...f,estimatedCost:e.target.value}))} />
                  </label>
                  <label>Preferred provider
                    <input value={pmForm.preferredProvider||''} onChange={e=>setPMForm(f=>({...f,preferredProvider:e.target.value}))} />
                  </label>
                </div>
                <div className="wo-form-actions">
                  <Button variant="outline" onClick={()=>setShowPMForm(false)}>Cancel</Button>
                  <Button onClick={savePM} disabled={pmSaving}>{pmSaving?'Saving…':'Save'}</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Fleet work orders */}
        {fleetTab === 'work-orders' && (
          <div>
            <div className="wo-section-header">
              <h3>Fleet Work Orders ({fleetOrders.filter(r=>!['Completed','Cancelled'].includes(String(r.status))).length} open)</h3>
            </div>
            <FleetWorkOrders orders={fleetOrders} vehicles={vehicles} all={all} viewer={viewer} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showVehicleForm && (
        <VehicleForm
          initial={editVehicle || undefined}
          onClose={() => { setShowVehicleForm(false); setEditVehicle(null); }}
          onSave={rows => { onSave(rows); setShowVehicleForm(false); setEditVehicle(null); }}
        />
      )}
      {showInspForm && (
        <DailyInspectionForm
          vehicles={activeVehicles} viewer={viewer}
          onClose={() => setShowInspForm(false)}
          onSave={rows => { onSave(rows); setShowInspForm(false); }}
        />
      )}
    </div>
  );
}
