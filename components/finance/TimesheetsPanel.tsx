'use client';
import { Plus } from 'lucide-react';
import { num, type Viewer, type FinRecord } from '@/lib/finance/model';
import { hoursLabel, weekHours, overtimeEligible, zone } from '@/lib/finance/timeclock';

function StatusBadge({ status }: { status: unknown }) {
  const s = String(status || 'Draft');
  return <span className={'f-badge ' + (/Approved|Published|Clocked in/.test(s) ? 'green' : /Pending|Requested|Unfilled|Late|Overtime|Draft|Submitted/.test(s) ? 'amber' : '')}>{s}</span>;
}

const dateLabel = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const clockTime = (s: unknown) => s ? new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(String(s))) : '—';

type TimesheetsPanelProps = {
  records: FinRecord[];
  people: FinRecord[];
  filteredPeople: FinRecord[];
  v: Viewer;
  person?: FinRecord;
  selectedTime: FinRecord[];
  summary: { worked: number; approved: number; pending: number };
  period: { start: string; end: string };
  now: number;
  manager: boolean;
  canEdit: boolean;
  active?: FinRecord;
  onSubmitWeek: (personId: string) => void;
  onApproveWeek: (personId: string) => void;
  onAdd: (kind: string, fields?: Record<string, unknown>) => void;
  onChooseDecision: (record: FinRecord, status: string) => void;
  onSetEditing: (record: FinRecord) => void;
};

export default function TimesheetsPanel({
  records, people, filteredPeople, v, person, selectedTime, summary, period, now, manager, canEdit, active,
  onSubmitWeek, onApproveWeek, onAdd, onChooseDecision, onSetEditing,
}: TimesheetsPanelProps) {
  const name = (id: string) => String(people.find(p => p.kind === 'person' && p.id === id)?.name || id);

  if (manager) {
    return (
      <section className="f-card tc-card">
        <header><h2>Timesheets · {dateLabel(period.start)}</h2></header>
        <div className="tc-table-wrap">
          <table className="tc-table">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Department</th>
                <th>Week hours</th>
                <th>40 hour status</th>
                <th>Week status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map(p => {
                const h = weekHours(records, p.id || '', period.start, period.end, now);
                const entries = records.filter(r => r.kind === 'time' && r.person === p.id && String(r.date) >= period.start && String(r.date) <= period.end && r.status !== 'Voided');
                const pending = entries.filter(r => r.status === 'pending' || r.status === 'Draft').length;
                const submitted = entries.filter(r => r.status === 'Submitted').length;
                const approved = entries.filter(r => r.status === 'Approved').length;
                const statusText = h.worked >= 40
                  ? `Over 40 by ${hoursLabel(Math.max(0, h.worked - 40))}`
                  : h.worked >= 36
                  ? 'Nearing 40 hours'
                  : h.worked > 0
                  ? `${hoursLabel(Math.max(0, 40 - h.worked))} from 40 hours`
                  : 'No hours';
                const canSubmit = pending > 0 && p.id === v.person;
                const canApprove = approved < entries.length;
                return (
                  <tr key={p.id}>
                    <td><b>{String(p.name)}</b><small>{String(p.department)}</small></td>
                    <td>{String(p.department)}</td>
                    <td>{hoursLabel(h.worked)}<small>{approved} approved, {submitted} submitted, {pending} pending</small></td>
                    <td><span className={`tc-hours-status ${h.worked >= 40 ? 'over' : h.worked >= 36 ? 'near' : 'ok'}`}>{statusText}</span></td>
                    <td><span className="tc-week-status">{!entries.length ? 'No entries' : submitted > 0 && pending === 0 && approved === 0 ? 'Submitted for review' : approved === entries.length ? 'Approved' : pending > 0 ? 'Needs submission' : 'Mixed'}</span></td>
                    <td>
                      <div className="f-actions">
                        {canSubmit && <button className="f-button" onClick={() => onSubmitWeek(p.id || '')}>Submit</button>}
                        {canApprove && <button className="f-button primary" onClick={() => onApproveWeek(p.id || '')}>Approve</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <section className="f-card tc-card">
      <header>
        <h2>{name(person?.id || '')} · {hoursLabel(summary.worked)}</h2>
        <div className="f-actions">
          <button className="f-button primary" disabled={!selectedTime.some(r => r.status !== 'Approved' && r.status !== 'Submitted')} onClick={() => person?.id && onSubmitWeek(person.id)}>Submit hours</button>
          <button className="f-button" onClick={() => onAdd('timeCorrection', { hours: 0, reason: '' })}><Plus size={16} />Missing time</button>
          {canEdit && <button className="f-button" onClick={() => onAdd('time', { date: period.start, hours: 0 })}>Add time</button>}
        </div>
      </header>
      <div className="tc-table-wrap">
        <table className="tc-table">
          <thead>
            <tr><th>Date</th><th>Clock in / out</th><th>Hours worked</th><th>Status</th><th>Last change</th><th>Action</th></tr>
          </thead>
          <tbody>
            {selectedTime.map(r => (
              <tr key={r.id}>
                <td>{dateLabel(String(r.date))}</td>
                <td>{clockTime(r.clockStart)} – {clockTime(r.clockEnd)}<small>{r.correctionId ? 'Corrected' : 'Recorded time'}</small></td>
                <td>{hoursLabel(num(r.hours))}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{String(r.updatedBy || 'Timeclock')}<small>{r.updatedAt ? new Date(String(r.updatedAt)).toLocaleString('en-US', { timeZone: zone }) : 'Awaiting review'}</small></td>
                <td>
                  <div className="f-actions">
                    {canEdit && r.status !== 'Approved' && <button className="f-button primary" onClick={() => onChooseDecision(r, 'Approved')}>Approve</button>}
                    <button className="f-button" onClick={() => onAdd('timeCorrection', { timeId: r.id, date: r.date, hours: r.hours, reason: '' })}>Correct</button>
                    <button className="tc-text-button" onClick={() => onSetEditing(r)}>Details</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!selectedTime.length && <p className="tc-empty">No time entries recorded for this week.</p>}
        {active && <p className="tc-empty">Clock running since {clockTime(active.startedAt)}. Clock out to submit this shift for review.</p>}
      </div>
    </section>
  );
}
