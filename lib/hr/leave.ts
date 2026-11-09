import type { FinRecord } from '../finance/model';
import { workweek } from '../finance/model.ts';
import { isExempt, weekHours, localDate } from '../finance/timeclock.ts';

export const employmentClasses = ['Full-Time', 'Part-Time', 'Temporary', 'Seasonal'] as const;
export function benefitEligibility(person: FinRecord) {
  if (person.workerType !== 'Employee') return { eligible: false, pending: false, reason: 'Employee benefits do not apply to this worker type.' };
  if (!person.employmentClass) return { eligible: false, pending: true, reason: 'Confirm employment class before applying the benefit schedule.' };
  const eligible = person.employmentClass === 'Full-Time';
  return { eligible, pending: false, reason: eligible ? 'Full-Time Employee' : 'Unpaid time off with approved shift coverage; no company benefit accrual.' };
}
export function ptoRate(person: FinRecord, day: string) {
  const hire = String(person.startDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hire) || day < hire) return 0;
  const assignments=Array.isArray(person.benefitPolicyAssignments)?person.benefitPolicyAssignments as Record<string,unknown>[]:[];
  const policy=assignments.filter(p=>p.status==='Approved'&&String(p.effectiveDate)<=day).sort((a,b)=>String(b.effectiveDate).localeCompare(String(a.effectiveDate))||String(b.requestedAt).localeCompare(String(a.requestedAt)))[0];
  const custom=policy?.custom as Record<string,unknown>|undefined;
  if(custom?.ptoHours!==undefined)return Number(custom.ptoHours)/2080;
  let years = Number(day.slice(0, 4)) - Number(hire.slice(0, 4));
  if (day.slice(5) < hire.slice(5)) years--;
  return (isExempt(person) ? [0.0692, 0.0885, 0.1077] : [0.0577, 0.0769, 0.0962])[Math.min(2, Math.max(0, years))];
}

/** Preview only. Approved actual work includes paid breaks; leave never creates accrual. */
export function ptoAccrual(person: FinRecord, records: FinRecord[], start: string, end: string) {
  const eligibility = benefitEligibility(person);
  if (!eligibility.eligible || !person.startDate) return { ...eligibility, pending: eligibility.pending || eligibility.eligible && !person.startDate, eligibleWorkedHours: 0, earnedHours: 0, weeks: [] as { start: string; hours: number; earned: number }[] };
  const company = records.find(r => r.id === 'company');
  const budget = new Map<string, number>();
  const weeks = new Map<string, { start: string; hours: number; earned: number }>();
  const lower = workweek(start, company).start;
  const times = records.filter(r => r.kind === 'time' && r.person === person.id && r.status === 'Approved' && String(r.date) >= lower && String(r.date) <= end && String(r.date) >= String(person.startDate)).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id));
  for (const time of times) {
    const date = String(time.date), week = workweek(date, company).start;
    const hours = Math.min(Math.max(0, Number(time.hours) || 0), Math.max(0, 40 - (budget.get(week) || 0)));
    budget.set(week, (budget.get(week) || 0) + hours);
    if (date < start) continue;
    const current = weeks.get(week) || { start: week, hours: 0, earned: 0 };
    current.hours += hours;
    current.earned += hours * ptoRate(person, date);
    weeks.set(week, current);
  }
  const rows = [...weeks.values()].map(w => ({ ...w, earned: Math.round(w.earned * 10000) / 10000 }));
  return { ...eligibility, eligibleWorkedHours: rows.reduce((n, w) => n + w.hours, 0), earnedHours: Math.round(rows.reduce((n, w) => n + w.earned, 0) * 10000) / 10000, weeks: rows };
}

/** Authorization is separate from wages and the running clock. */
export function approvedHoursLimit(person: FinRecord, records: FinRecord[], now = Date.now()) {
  const period = workweek(localDate(now), records.find(r => r.id === 'company'));
  const worked = Math.round(weekHours(records, person.id, period.start, period.end, now).worked * 3600) / 3600;
  const approvals = records.filter(r => r.kind === 'overtime' && r.person === person.id && r.decision === 'Approved' && String(r.date) >= period.start && String(r.date) <= period.end);
  const extra = approvals.reduce((sum, r) => sum + Math.max(0, Number(r.approvedHours ?? r.hours) || 0), 0);
  const limit = 40 + extra;
  return { ...period, worked, approvedExtraHours: extra, limit, reached: person.workerType === 'Employee' && worked >= limit, unauthorizedHours: Math.max(0, worked - limit) };
}
