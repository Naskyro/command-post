'use client';
import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestJson } from '@/lib/shared/client';
import type { Viewer } from '@/lib/finance/model';
import type { Row } from '@/lib/accounts/model';
import { today } from '@/lib/accounts/model';
import { woCategories, woPriorities, woCategoryTypes, type WOCategory } from '@/lib/accounts/work-options';

interface StaffRef { id: string; name: string; department: string; title?: string; }
interface Props {
  viewer: Viewer;
  all: Row[];
  staff: StaffRef[];
  onClose: () => void;
  onSubmitted: (rows: Row[]) => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface FormState {
  category: WOCategory | '';
  requestType: string;
  relatedTo: string;
  shortDescription: string;
  details: string;
  safetyImpact: string;
  operationalImpact: string;
  priority: string;
  prioritySuggested: string;
  location: string;
  relatedVehicle: string;
  relatedEmployee: string;
  relatedDevice: string;
  dueDate: string;
  estimatedCost: string;
  // Category-specific conditional fields
  // IT
  whichPrinter: string;
  itErrorMessage: string;
  othersAffected: string;
  // Fleet
  currentMileage: string;
  // Facilities
  specificLocation: string;
  buildingUnsecured: string;
  // Supplies
  supplyItem: string;
  supplyQty: string;
  supplyDateNeeded: string;
  preferredVendor: string;
  // Safety
  immediateDanger: string;
  safeToUse: string;
  peopleExposed: string;
  // Photos / attachments
  attachmentNote: string;
}

const empty: FormState = {
  category: '', requestType: '', relatedTo: '', shortDescription: '',
  details: '', safetyImpact: '', operationalImpact: '', priority: '', prioritySuggested: 'Normal',
  location: '', relatedVehicle: '', relatedEmployee: '', relatedDevice: '',
  dueDate: '', estimatedCost: '',
  whichPrinter: '', itErrorMessage: '', othersAffected: '',
  currentMileage: '',
  specificLocation: '', buildingUnsecured: '',
  supplyItem: '', supplyQty: '', supplyDateNeeded: '', preferredVendor: '',
  immediateDanger: '', safeToUse: '', peopleExposed: '',
  attachmentNote: '',
};

// Escalate priority automatically for safety/operational triggers
function suggestPriority(f: FormState): string {
  if (f.category === 'Safety' && f.immediateDanger === 'Yes') return 'Emergency';
  if (f.buildingUnsecured === 'Yes') return 'Emergency';
  if (f.safetyImpact === 'Immediate safety risk') return 'Emergency';
  if (f.operationalImpact === 'Operations stopped') return 'Urgent';
  if (f.category === 'Fleet Maintenance & Repairs' && f.safeToUse === 'Unsafe — do not operate') return 'Emergency';
  return f.prioritySuggested || 'Normal';
}

const categoryLabels: Record<string, string> = {
  'Account Management': 'Account management (sign, access, property service)',
  'Fleet Maintenance & Repairs': 'Fleet / vehicle (trucks, tow equipment)',
  'IT Support': 'IT support (computers, printers, internet, software)',
  'Facilities & Maintenance': 'Facilities (building, gate, yard, sanitation)',
  'Supplies & Purchasing': 'Supplies / purchasing',
  'Hardware, Software & Access': 'Hardware, software, or system access',
  'Safety': 'Safety concern or hazard',
  'Project': 'Project request',
  'Other': 'Other / not listed',
};

export default function WOSubmitForm({ viewer, all, staff, onClose, onSubmitted }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>({ ...empty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const vehicles = all.filter(r => r.kind === 'fleetVehicle');
  const employees = staff;

  function set(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }
  function go(s: Step) { setError(''); setStep(s); }

  function validate1() {
    if (!form.category) { setError('Select a category.'); return false; }
    return true;
  }
  function validate2() {
    if (!form.requestType) { setError('Select a request type.'); return false; }
    return true;
  }
  function validate3() { return true; }
  function validate4() {
    if (!form.shortDescription.trim()) { setError('Enter a short description.'); return false; }
    return true;
  }
  function validate5() { return true; }

  function effectivePriority() {
    const suggested = suggestPriority(form);
    return suggested;
  }

  async function submit() {
    if (!form.shortDescription.trim()) { setError('Enter a short description.'); return; }
    setSaving(true);
    setError('');
    const priority = effectivePriority();
    const isEmergency = priority === 'Emergency';
    const status = isEmergency ? 'Needs Review' : form.category === 'Supplies & Purchasing' ? 'Awaiting Approval' : 'New';
    const id = 'workOrder:' + crypto.randomUUID();
    const record: Record<string, unknown> = {
      id, kind: 'workOrder', version: 0,
      name: form.shortDescription.trim(),
      category: form.category,
      requestType: form.requestType,
      details: form.details.trim() || undefined,
      priority,
      status,
      location: form.location || undefined,
      relatedVehicle: form.relatedVehicle || undefined,
      relatedEmployee: form.relatedEmployee || undefined,
      relatedDevice: form.relatedDevice || undefined,
      dueDate: form.dueDate || undefined,
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      safetyImpact: form.safetyImpact || undefined,
      operationalImpact: form.operationalImpact || undefined,
      submittedBy: viewer.person,
      createdBy: viewer.person,
      date: today(),
      createdAt: new Date().toISOString(),
      requiresApproval: form.category === 'Supplies & Purchasing' && Number(form.estimatedCost) > 0,
    };
    // Add conditional fields
    if (form.category === 'IT Support') {
      if (form.whichPrinter) record.whichPrinter = form.whichPrinter;
      if (form.itErrorMessage) record.itErrorMessage = form.itErrorMessage;
      if (form.othersAffected) record.othersAffected = form.othersAffected;
    }
    if (form.category === 'Fleet Maintenance & Repairs') {
      if (form.currentMileage) record.currentMileage = Number(form.currentMileage);
    }
    if (form.category === 'Facilities & Maintenance') {
      if (form.specificLocation) record.specificLocation = form.specificLocation;
      if (form.buildingUnsecured) record.buildingUnsecured = form.buildingUnsecured;
    }
    if (form.category === 'Supplies & Purchasing') {
      if (form.supplyItem) record.supplyItem = form.supplyItem;
      if (form.supplyQty) record.supplyQty = form.supplyQty;
      if (form.supplyDateNeeded) record.supplyDateNeeded = form.supplyDateNeeded;
      if (form.preferredVendor) record.preferredVendor = form.preferredVendor;
    }
    if (form.category === 'Safety') {
      if (form.immediateDanger) record.immediateDanger = form.immediateDanger;
      if (form.safeToUse) record.safeToUse = form.safeToUse;
      if (form.peopleExposed) record.peopleExposed = form.peopleExposed;
    }

    try {
      const res = await requestJson<{ records: Row[] }>('/api/accounts', { action: 'save', record });
      onSubmitted(res.records);
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  }

  const requestTypes = form.category ? (woCategoryTypes[form.category] || ['Other']) : [];
  const finalPriority = effectivePriority();
  const priorityEscalated = finalPriority === 'Emergency' && form.prioritySuggested !== 'Emergency';

  return (
    <div className="wo-submit-overlay">
      <div className="wo-submit-panel">
        {/* Header */}
        <header className="wo-submit-header">
          <div>
            <h2>Submit a request</h2>
            <div className="wo-step-dots">
              {([1,2,3,4,5,6] as Step[]).map(s => (
                <span key={s} className={`wo-step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}>
                  {step > s ? <Check size={10} /> : s}
                </span>
              ))}
            </div>
          </div>
          <button className="wo-icon-btn" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="wo-submit-body">
          {/* Step 1: Category */}
          {step === 1 && (
            <div className="wo-submit-step">
              <h3>What do you need help with?</h3>
              <p className="wo-step-hint">Your answer determines the questions that follow.</p>
              <div className="wo-category-grid">
                {woCategories.map(cat => (
                  <button key={cat}
                    className={`wo-cat-btn ${form.category === cat ? 'selected' : ''}`}
                    onClick={() => { set('category', cat); set('requestType', ''); }}>
                    <span className="wo-cat-check">{form.category === cat && <Check size={14} />}</span>
                    {categoryLabels[cat] || cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Request type */}
          {step === 2 && (
            <div className="wo-submit-step">
              <h3>What specifically do you need?</h3>
              <p className="wo-step-hint">Category: <b>{form.category}</b></p>
              <div className="wo-type-list">
                {requestTypes.map(t => (
                  <button key={t}
                    className={`wo-type-btn ${form.requestType === t ? 'selected' : ''}`}
                    onClick={() => set('requestType', t)}>
                    {form.requestType === t && <Check size={14} />}
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Related record / context */}
          {step === 3 && (
            <div className="wo-submit-step">
              <h3>What is this related to? <span className="wo-optional">(optional)</span></h3>
              {['Fleet Maintenance & Repairs'].includes(form.category) && vehicles.length > 0 && (
                <label>Vehicle
                  <select value={form.relatedVehicle} onChange={e => set('relatedVehicle', e.target.value)}>
                    <option value="">— Select vehicle —</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{String(v.name || v.unitNumber || v.id)}</option>)}
                  </select>
                </label>
              )}
              {['Hardware, Software & Access','IT Support'].includes(form.category) && (
                <label>Device or asset (if known)
                  <input value={form.relatedDevice} onChange={e => set('relatedDevice', e.target.value)} placeholder="e.g. PRN-DSP-02, iPad 3" />
                </label>
              )}
              {['Hardware, Software & Access'].includes(form.category) && (
                <label>Employee (if for a specific person)
                  <select value={form.relatedEmployee} onChange={e => set('relatedEmployee', e.target.value)}>
                    <option value="">— Select employee —</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{String(e.name)}</option>)}
                  </select>
                </label>
              )}
              <label>Location or area <span className="wo-optional">(optional)</span>
                <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Dispatch office, Yard, VSF" />
              </label>
            </div>
          )}

          {/* Step 4: Description */}
          {step === 4 && (
            <div className="wo-submit-step">
              <h3>Describe what you need</h3>
              <label>Short description <span className="wo-required">*</span>
                <input value={form.shortDescription} onChange={e => set('shortDescription', e.target.value)}
                  placeholder="One-line summary of the request" maxLength={200} />
              </label>
              <label>Additional details <span className="wo-optional">(optional)</span>
                <textarea rows={4} value={form.details} onChange={e => set('details', e.target.value)}
                  placeholder="Explain the problem, what you have already tried, any relevant context…" />
              </label>
              <label>Attachment note <span className="wo-optional">(optional)</span>
                <input value={form.attachmentNote} onChange={e => set('attachmentNote', e.target.value)}
                  placeholder="Describe any photo, video, or file you plan to attach separately" />
              </label>
            </div>
          )}

          {/* Step 5: Conditional questions by category */}
          {step === 5 && (
            <div className="wo-submit-step">
              <h3>A few more details</h3>
              {form.category === 'IT Support' && (
                <>
                  {(form.requestType || '').toLowerCase().includes('printer') && (
                    <label>Which printer? (if known)
                      <input value={form.whichPrinter} onChange={e => set('whichPrinter', e.target.value)} placeholder="e.g. PRN-DSP-02, dispatch printer" />
                    </label>
                  )}
                  <label>What happens / error message?
                    <textarea rows={2} value={form.itErrorMessage} onChange={e => set('itErrorMessage', e.target.value)} />
                  </label>
                  <label>Are others affected?
                    <select value={form.othersAffected} onChange={e => set('othersAffected', e.target.value)}>
                      <option value="">Select…</option><option>Just me</option><option>Yes — others affected</option><option>Unknown</option>
                    </select>
                  </label>
                </>
              )}
              {form.category === 'Fleet Maintenance & Repairs' && (
                <>
                  <label>Current mileage (if known)
                    <input type="number" value={form.currentMileage} onChange={e => set('currentMileage', e.target.value)} />
                  </label>
                  <label>Is the vehicle safe to operate?
                    <select value={form.safeToUse} onChange={e => set('safeToUse', e.target.value)}>
                      <option value="">Select…</option>
                      <option>Yes — safe to use with caution</option>
                      <option>Unsafe — do not operate</option>
                      <option>Unknown</option>
                    </select>
                  </label>
                  {form.safeToUse === 'Unsafe — do not operate' && (
                    <div className="wo-safety-warn"><AlertTriangle size={14} />This vehicle will be flagged as Out of Service. Operations will be notified immediately.</div>
                  )}
                </>
              )}
              {form.category === 'Facilities & Maintenance' && (
                <>
                  <label>Specific room, door, gate, or area
                    <input value={form.specificLocation} onChange={e => set('specificLocation', e.target.value)} placeholder="e.g. Front gate, Restroom 1, Yard south side" />
                  </label>
                  {(form.requestType || '').toLowerCase().includes('door') || (form.requestType || '').toLowerCase().includes('lock') || (form.requestType || '').toLowerCase().includes('gate') ? (
                    <label>Is the building or yard currently unsecured?
                      <select value={form.buildingUnsecured} onChange={e => set('buildingUnsecured', e.target.value)}>
                        <option value="">Select…</option><option>No</option><option>Yes</option><option>Unsure</option>
                      </select>
                    </label>
                  ) : null}
                  {form.buildingUnsecured === 'Yes' && (
                    <div className="wo-safety-warn"><AlertTriangle size={14} />Priority will be escalated to Emergency. Operations will be notified immediately.</div>
                  )}
                </>
              )}
              {form.category === 'Supplies & Purchasing' && (
                <>
                  <label>Item name
                    <input value={form.supplyItem} onChange={e => set('supplyItem', e.target.value)} />
                  </label>
                  <label>Quantity
                    <input type="number" value={form.supplyQty} onChange={e => set('supplyQty', e.target.value)} />
                  </label>
                  <label>Date needed
                    <input type="date" value={form.supplyDateNeeded} onChange={e => set('supplyDateNeeded', e.target.value)} />
                  </label>
                  <label>Preferred vendor (optional)
                    <input value={form.preferredVendor} onChange={e => set('preferredVendor', e.target.value)} />
                  </label>
                  <label>Estimated cost ($) (optional)
                    <input type="number" value={form.estimatedCost} onChange={e => set('estimatedCost', e.target.value)} />
                  </label>
                </>
              )}
              {form.category === 'Safety' && (
                <>
                  <label>Is there immediate danger?
                    <select value={form.immediateDanger} onChange={e => set('immediateDanger', e.target.value)}>
                      <option value="">Select…</option><option>No</option><option>Yes</option><option>Unsure</option>
                    </select>
                  </label>
                  {form.immediateDanger === 'Yes' && (
                    <div className="wo-safety-warn"><AlertTriangle size={14} />This will be submitted as an Emergency and operations will be notified immediately.</div>
                  )}
                  <label>Is the equipment or area safe to use?
                    <select value={form.safeToUse} onChange={e => set('safeToUse', e.target.value)}>
                      <option value="">Select…</option><option>Yes</option><option>No</option><option>Unsure</option>
                    </select>
                  </label>
                  <label>Who may be exposed?
                    <input value={form.peopleExposed} onChange={e => set('peopleExposed', e.target.value)} placeholder="e.g. Drivers, Yard staff, All employees" />
                  </label>
                </>
              )}
              {/* Generic: impact and priority for all categories */}
              <label>Safety impact (optional)
                <select value={form.safetyImpact} onChange={e => set('safetyImpact', e.target.value)}>
                  <option value="">None / not applicable</option>
                  <option>Immediate safety risk</option>
                  <option>Potential hazard</option>
                  <option>No safety impact</option>
                </select>
              </label>
              <label>Operational impact (optional)
                <select value={form.operationalImpact} onChange={e => set('operationalImpact', e.target.value)}>
                  <option value="">None / not applicable</option>
                  <option>Operations stopped</option>
                  <option>Significant slowdown</option>
                  <option>Minor inconvenience</option>
                  <option>No operational impact</option>
                </select>
              </label>
              <label>Your priority suggestion
                <select value={form.prioritySuggested} onChange={e => set('prioritySuggested', e.target.value)}>
                  {woPriorities.map(p => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label>Requested by / due date (optional)
                <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
              </label>
            </div>
          )}

          {/* Step 6: Review and submit */}
          {step === 6 && (
            <div className="wo-submit-step">
              <h3>Review and submit</h3>
              {priorityEscalated && (
                <div className="wo-safety-warn"><AlertTriangle size={14} />Priority automatically escalated to <b>{finalPriority}</b> based on your answers.</div>
              )}
              <div className="wo-review-summary">
                <div className="wo-review-row"><span>Category</span><b>{form.category}</b></div>
                <div className="wo-review-row"><span>Request type</span><b>{form.requestType || '—'}</b></div>
                <div className="wo-review-row"><span>Description</span><b>{form.shortDescription}</b></div>
                {form.location && <div className="wo-review-row"><span>Location</span><b>{form.location}</b></div>}
                {form.relatedVehicle && <div className="wo-review-row"><span>Vehicle</span><b>{String(all.find(r=>r.id===form.relatedVehicle)?.name || form.relatedVehicle)}</b></div>}
                <div className="wo-review-row"><span>Priority</span><b>{finalPriority}</b></div>
                {form.dueDate && <div className="wo-review-row"><span>Due date</span><b>{form.dueDate}</b></div>}
                {form.estimatedCost && <div className="wo-review-row"><span>Estimated cost</span><b>${Number(form.estimatedCost).toLocaleString()}</b></div>}
                {form.safetyImpact && <div className="wo-review-row"><span>Safety impact</span><b>{form.safetyImpact}</b></div>}
                {form.details && <div className="wo-review-row wo-full"><span>Details</span><p>{form.details}</p></div>}
              </div>
              <p className="wo-submit-hint">A work order number will be assigned on submission. You can view status updates in <b>My Requests</b>.</p>
            </div>
          )}
        </div>

        {error && <div className="wo-submit-error"><AlertTriangle size={14} />{error}</div>}

        {/* Footer navigation */}
        <footer className="wo-submit-footer">
          {step > 1
            ? <Button variant="outline" onClick={() => go((step - 1) as Step)}><ChevronLeft size={15} />Back</Button>
            : <Button variant="outline" onClick={onClose}>Cancel</Button>
          }
          <div className="wo-step-label">Step {step} of 6</div>
          {step < 6 ? (
            <Button onClick={() => {
              const validators: Record<number, () => boolean> = { 1: validate1, 2: validate2, 3: validate3, 4: validate4, 5: validate5 };
              if (validators[step]()) go((step + 1) as Step);
            }}>
              Continue <ChevronRight size={15} />
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Submitting…' : 'Submit request'}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
