'use client';
import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { money, num, today, type FinRecord, type Viewer, inPeriod, payrollLine } from '@/lib/finance/model';
import { timedFetch } from '@/lib/shared/client';

// ── Inline pay-rate editor ────────────────────────────────────────────────────
const PAY_TYPES = ['Hourly non-exempt', 'Hourly + commission', 'Hourly exempt', 'Salary + commission', 'Salary exempt', 'Net salary', 'Per tow', 'Pending method'];

type PayEditorProps = {
  person: FinRecord;
  onSaved: (updated: FinRecord) => void;
  onClose: () => void;
};

function PayEditor({ person, onSaved, onClose }: PayEditorProps) {
  const [payType, setPayType] = useState(String(person.payType || 'Hourly non-exempt'));
  const [rate, setRate] = useState(String(person.rate ?? ''));
  const [commissionNotes, setCommissionNotes] = useState(String(person.commissionNotes ?? ''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isHourly = payType.includes('Hourly');
  const isSalary = payType.includes('Salary') || payType === 'Net salary';
  const needsRate = isHourly || isSalary;

  async function save() {
    if (!reason.trim()) { setError('Add a reason for the change.'); return; }
    const r = parseFloat(rate);
    if (needsRate && (isNaN(r) || r < 0)) { setError('Enter a valid rate.'); return; }
    setError('');
    setBusy(true);
    try {
      const fields: Record<string, unknown> = { payType, commissionNotes, date: today() };
      if (needsRate) fields.rate = r;
      const res = await timedFetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'savePay', id: person.id, version: person.version, fields, reason }),
      });
      const body = await res.json() as { error?: string; person?: FinRecord };
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      onSaved(body.person!);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-pay-editor">
      <h3>Edit pay — {String(person.name)}</h3>
      <label>Pay type
        <select value={payType} onChange={e => setPayType(e.target.value)}>
          {PAY_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </label>
      {needsRate && (
        <label>{isHourly ? 'Hourly rate ($/hr)' : 'Weekly salary ($)'}
          <input type="number" min={0} step={0.01} value={rate} onChange={e => setRate(e.target.value)} placeholder="0.00" />
        </label>
      )}
      <label>Commission rules / notes
        <textarea rows={2} value={commissionNotes} onChange={e => setCommissionNotes(e.target.value)} placeholder="e.g. $50 per tow, or 5% of revenue collected" />
      </label>
      <label>Reason for change *
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" />
      </label>
      {error && <p className="f-error">{error}</p>}
      <div className="f-actions">
        <button className="f-button" onClick={onClose}>Cancel</button>
        <button className="f-button primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save pay'}</button>
      </div>
    </div>
  );
}

// ── Commission entry form ─────────────────────────────────────────────────────
type CommissionFormProps = {
  person: FinRecord;
  periodStart: string;
  onAdded: (rec: FinRecord) => void;
  onClose: () => void;
};

function CommissionForm({ person, periodStart, onAdded, onClose }: CommissionFormProps) {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const amt = parseFloat(amount);
    if (!desc.trim()) { setError('Enter a description.'); return; }
    if (isNaN(amt) || amt <= 0) { setError('Enter a positive dollar amount.'); return; }
    setError('');
    setBusy(true);
    const record: FinRecord = {
      id: crypto.randomUUID(),
      kind: 'earning',
      version: 0,
      name: desc.trim(),
      amount: amt,
      person: person.id,
      date: periodStart,
      status: 'Approved',
      note,
    };
    try {
      const res = await timedFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record, reason: `Commission: ${desc.trim()}` }),
      });
      const body = await res.json() as { error?: string; record?: FinRecord };
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      onAdded(body.record!);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="cp-commission-form-row">
      <td colSpan={7}>
        <div className="cp-commission-inline">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (e.g. Tow #421)" />
          <input type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" />
          {error && <span className="f-error" style={{ fontSize: 13 }}>{error}</span>}
          <button className="f-button primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Add'}</button>
          <button className="f-button" onClick={onClose}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
type Props = {
  records: FinRecord[];
  people: FinRecord[];
  viewer: Viewer;
  period: { start: string; end: string; payday: string };
  onRecordsChanged: (updated: FinRecord[]) => void;
};

export default function CompensationPanel({ records: initialRecords, people: initialPeople, viewer, period, onRecordsChanged }: Props) {
  const [records, setRecords] = useState(initialRecords);
  const [people, setPeople] = useState(initialPeople);
  const [editingPay, setEditingPay] = useState<string | null>(null);
  const [addingCommission, setAddingCommission] = useState<string | null>(null);

  const isOwner = viewer.owner;
  const activePeople = people.filter(p => p.status === 'Active');

  function handlePaySaved(updated: FinRecord) {
    const next = people.map(p => p.id === updated.id ? { ...p, ...updated } : p);
    setPeople(next);
    setEditingPay(null);
  }

  function handleCommissionAdded(rec: FinRecord) {
    const next = [...records, rec];
    setRecords(next);
    onRecordsChanged(next);
    setAddingCommission(null);
  }

  const totalHours = activePeople.reduce((s, p) => s + payrollLine(p, records, period.start, period.end).hours, 0);
  const totalCommission = activePeople.reduce((s, p) => s + payrollLine(p, records, period.start, period.end).commission, 0);
  const totalGross = activePeople.reduce((s, p) => s + payrollLine(p, records, period.start, period.end).gross, 0);

  return (
    <div className="cp-panel">
      {/* ── Summary stats ── */}
      <div className="f-stats">
        <div className="f-metric">
          <div><strong>Total hours</strong><small>All workers this week</small></div>
          <strong>{totalHours.toFixed(1)}</strong>
        </div>
        <div className="f-metric">
          <div><strong>Commission logged</strong><small>Approved this pay period</small></div>
          <strong>{money(totalCommission)}</strong>
        </div>
        <div className="f-metric">
          <div><strong>Gross payroll owed</strong><small>Wages + commission combined</small></div>
          <strong>{money(totalGross)}</strong>
        </div>
      </div>

      {/* ── Per-person breakdown ── */}
      <section className="f-card">
        <header>
          <h2>Pay &amp; commission breakdown · {period.start} – {period.end}</h2>
          <small style={{ color: 'var(--ws-muted,#5d7385)', fontSize: 13 }}>Payday: {period.payday}</small>
        </header>
        <div className="f-table-wrap">
          <table className="f-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Pay type &amp; rate</th>
                <th>Hours</th>
                <th>Base pay</th>
                <th>Commission this week</th>
                <th>Total owed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {activePeople.map(person => {
                const line = payrollLine(person, records, period.start, period.end);
                const isHourly = String(person.payType || '').includes('Hourly');
                const rateLabel = isHourly
                  ? `${money(person.rate ?? 0)}/hr`
                  : String(person.payType || '').includes('Salary') || String(person.payType) === 'Net salary'
                  ? `${money(person.rate ?? 0)} salary`
                  : String(person.payType || 'Not set');
                const baseThisWeek = line.gross - line.commission;
                const weekEarnings = records.filter(r =>
                  r.kind === 'earning' && r.person === person.id &&
                  inPeriod(r, period.start, period.end) && r.status === 'Approved'
                );

                return [
                  <tr key={person.id}>
                    <td>
                      <b>{String(person.name)}</b>
                      <small>{String(person.department)}</small>
                      {person.commissionNotes && (
                        <small style={{ color: 'var(--ws-muted,#5d7385)', fontStyle: 'italic', display: 'block' }}>
                          {String(person.commissionNotes)}
                        </small>
                      )}
                    </td>
                    <td>
                      <b>{String(person.payType || 'Not set')}</b>
                      <small>{rateLabel}</small>
                    </td>
                    <td>{line.hours.toFixed(2)}</td>
                    <td>{money(baseThisWeek)}</td>
                    <td>
                      <b>{money(line.commission)}</b>
                      {weekEarnings.length > 0 && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--ws-accent,#155e7a)' }}>
                            {weekEarnings.length} {weekEarnings.length === 1 ? 'entry' : 'entries'}
                          </summary>
                          {weekEarnings.map(r => (
                            <div key={String(r.id)} style={{ fontSize: 12, padding: '2px 0', color: 'var(--ws-muted,#5d7385)' }}>
                              {String(r.name)} · {money(num(r.amount))} · {String(r.date)}
                            </div>
                          ))}
                        </details>
                      )}
                    </td>
                    <td><strong style={{ fontSize: 15 }}>{money(line.gross)}</strong></td>
                    <td>
                      <div className="f-actions" style={{ flexWrap: 'nowrap' }}>
                        {isOwner && (
                          <button className="f-button" onClick={() => setEditingPay(editingPay === person.id ? null : String(person.id))}>
                            <Pencil size={14} />Change pay
                          </button>
                        )}
                        <button className="f-button primary" onClick={() => setAddingCommission(addingCommission === person.id ? null : String(person.id))}>
                          <Plus size={14} />Add commission
                        </button>
                      </div>
                    </td>
                  </tr>,

                  editingPay === String(person.id) && (
                    <tr key={String(person.id) + '-pay-edit'}>
                      <td colSpan={7}>
                        <PayEditor person={person} onSaved={handlePaySaved} onClose={() => setEditingPay(null)} />
                      </td>
                    </tr>
                  ),

                  addingCommission === String(person.id) && (
                    <CommissionForm
                      key={String(person.id) + '-commission'}
                      person={person}
                      periodStart={period.start}
                      onAdded={handleCommissionAdded}
                      onClose={() => setAddingCommission(null)}
                    />
                  ),
                ];
              })}
            </tbody>
          </table>
          {!activePeople.length && (
            <p style={{ padding: 24, textAlign: 'center', color: 'var(--ws-muted,#5d7385)' }}>
              No active workers found.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
