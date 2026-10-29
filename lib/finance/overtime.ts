import type { FinRecord, Viewer } from './model';
import { num, round, workweek } from './model.ts';
import { canAccess } from './access.ts';
import { localDate, managesPerson, overtimeEligible, weekHours } from './timeclock.ts';

export type OvertimeSummary = {
  person: string; name: string; department: string; start: string; end: string;
  worked: number; hours: number; running: boolean; approvedHours: number;
  pendingHours: number; cost: number | null; basis: string; asOf: string;
};
export const overtimeHours = (worked:number) => Math.max(0, Math.round((worked-40)*3600)/3600);
export const overtimeReasons = ['Extra earning opportunity', 'Coverage needed', 'Assigned work', 'Other'];
export function canReviewOvertime(v: Viewer, person: string, records: FinRecord[]) {
  return person !== v.person && canAccess(v, 'Timeclock', 'Requests', true) && managesPerson(v, person, records);
}
export function overtimeSummary(p: FinRecord, records: FinRecord[], now = Date.now()): OvertimeSummary {
  const period = workweek(localDate(now), records.find(r => r.id === 'company'));
  const worked = weekHours(records, p.id, period.start, period.end, now), hours = overtimeHours(worked.worked);
  const requests = records.filter(r => r.kind === 'overtime' && r.person === p.id && String(r.date) >= period.start && String(r.date) <= period.end);
  const sum = (decision: string) => requests.filter(r => r.decision === decision).reduce((n, r) => n + num(r.hours), 0);
  let cost: number | null = null, basis = 'Verify the overtime rate in the pay agreement.';
  const hourly = String(p.payType).includes('Hourly');
  const commission = records.filter(r => r.kind === 'earning' && r.person === p.id && r.status === 'Approved' && String(r.date) >= period.start && String(r.date) <= period.end).reduce((n, r) => n + num(r.amount), 0);
  if (hourly && num(p.rate) > 0) {
    const regular = num(p.rate) + (worked.worked ? commission / worked.worked : 0);
    cost = round(hours * regular * 1.5);
    basis = commission ? '1.5× regular rate including recorded approved additional earnings.' : '1.5× hourly rate; additional earnings may change the estimate.';
  } else if (!hourly && num(p.overtimeEstimateRate) > 0) {
    cost = round(hours * num(p.overtimeEstimateRate));
    basis = 'Verified salaried overtime rate from the pay agreement.';
  }
  if (period.transition || p.date && String(p.date) > period.start) {
    cost = null; basis = 'Payroll review needed for a calendar or pay-rate change within this week.';
  }
  return { person:p.id, name:String(p.name), department:String(p.department || ''), start:period.start, end:period.end,
    worked:worked.worked, hours, running:Boolean(worked.active), approvedHours:sum('Approved'), pendingHours:sum('Pending'),
    cost, basis, asOf:new Date(now).toISOString() };
}
// Calculate before projecting staff records; only send estimates for the employee or their permitted supervisor.
export function visibleOvertime(v: Viewer, records: FinRecord[], now = Date.now()) {
  if (!['Today', 'Requests', 'Timesheets'].some(tab => canAccess(v, 'Timeclock', tab))) return [];
  return records.filter(p => p.kind === 'person' && p.status === 'Active' && overtimeEligible(p) &&
    (p.id === v.person || managesPerson(v, p.id, records)))
    .map(p => overtimeSummary(p, records, now));
}
