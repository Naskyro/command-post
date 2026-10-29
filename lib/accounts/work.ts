import { today, type Row } from './model';

export { taskStatuses, orderStatuses, waitingRoles, orderTypes } from './work-options';
export const isWaiting = (r: Row) => String(r.status).startsWith('Waiting');
export const isFinished = (r: Row) => ['Completed', 'Cancelled'].includes(String(r.status));
export const actionDate = (r: Row) => String(isWaiting(r) ? r.remindOn || '' : r.dueDate || '');
export function workGroup(r: Row, day = today()) {
  if (isFinished(r)) return r.status === 'Completed' ? 'Completed' : 'Cancelled';
  const due = actionDate(r);
  if (isWaiting(r) && (!due || due > day)) return 'Waiting';
  if (!due) return 'Needs scheduling';
  if (due < day) return 'Overdue';
  if (due === day) return 'Today';
  return 'Upcoming';
}
export function checklistProgress(r: Row) {
  const items = (r.checklist as string[] || []);
  const done = (r.completedSteps as string[] || []).filter(id => items.some(item => item.split('|')[0] === id)).length;
  return { done, total: items.length, percent: items.length ? Math.round(done / items.length * 100) : null };
}
export const contactName = (name: unknown) => String(name || '').replace(/\s+[-–—]\s+(PM|APM|Property Manager|Assistant Property Manager)$/i, '').trim();
export function affiliationDates(r: Row) {
  const fmt = (v: unknown) => v ? new Date(String(v) + 'T12:00Z').toLocaleDateString('en-US', { month: 'short', ...(r.datePrecision === 'Month' ? {} : {day:'numeric' as const}), year: 'numeric',timeZone:'UTC' }) : 'Date unknown';
  return `${fmt(r.startDate)} – ${r.endDate ? fmt(r.datePrecision === 'Month' ? new Date(Date.parse(String(r.endDate)+'T12:00Z')-86400000).toISOString().slice(0,10) : r.endDate) : 'Present'}`;
}
