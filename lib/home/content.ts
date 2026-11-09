import {auditDay,auditStamp} from '../shared/audit-format.ts';
import { displayPersonName } from '../people/display-name.ts';
import type { FinRecord, Viewer } from '../finance/model';
import { accessCatalog, canAccess } from '../finance/access.ts';
import { visible } from '../finance/visibility.ts';
import { addDays, money, num, payrollLine, spendingWeek, workweek } from '../finance/model.ts';
import { departmentGaps, hoursLabel, isExempt, leaveBalance, localDate, localInstant, managesPerson, overtimeEligible, weekHours } from '../finance/timeclock.ts';
import { billBalance } from '../finance/bills.ts';
import type { HomeItem, HomeTarget, WidgetContent, WidgetDefinition } from './widgets';

// Published shifts use Austin wall time. Resolve that explicitly before display; UTC
// instants and payroll calendar dates must keep their separate meanings.
const dateTime=(value:string)=>auditStamp(value)||auditStamp(localInstant(value));
const range=(start:unknown,end:unknown)=>[auditDay(start),auditDay(end)].filter(Boolean).join(' – ');
const target = (module: string, tab?: string, section?: string): HomeTarget => ({ module, tab, section });
const safeSlack = (value: unknown) => {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'slack.com' || url.hostname.endsWith('.slack.com')) ? url.href : undefined; }
  catch { return undefined; }
};

export function homeContent(v: Viewer, records: FinRecord[], widgets: WidgetDefinition[], now = Date.now()): Record<string, WidgetContent> {
  const date = localDate(now), company = records.find(r => r.id === 'company'), period = workweek(date, company);
  const self = records.find(r => r.id === v.person), scoped = visible(v, records);
  const name = (id: unknown) => displayPersonName(records.find(r => r.kind === 'person' && r.id === id)) || 'Employee';
  const activeTeam = records.filter(r => r.kind === 'person' && r.status === 'Active' && r.id !== v.person && managesPerson(v, r.id, records));
  const result: Record<string, WidgetContent> = {};
  const links = (items: [string, string, string, string?][]): HomeItem[] => items.filter(([, module, tab]) => canAccess(v, module, tab)).map(([title, module, tab, section]) => ({ id: module + tab, title, target: target(module, tab, section) }));
  for (const widget of widgets) {
    let content: WidgetContent = { items: [] };
    switch (widget.id) {
      case 'inbox':
        content = { items: [], status: 'Not connected', empty: 'Connect email to see your inbox here.', href: `https://mail.google.com/mail/?authuser=${encodeURIComponent(String(self?.email || v.email))}`, action: 'Open Gmail' };
        break;
      case 'slack':
        content = { items: [], status: 'Not connected', empty: 'Slack messages are not connected.', href: safeSlack(company?.slackUrl), action: 'Open Slack' };
        break;
      case 'hours': {
        const hours = weekHours(records, v.person, period.start, period.end, now);
        content = { metric: hoursLabel(hours.worked), status: hours.active ? 'Clocked in' : 'Clocked out', detail: range(period.start,period.end), items: [
          { id: 'approved', title: 'Approved hours', value: hoursLabel(hours.approved) },
          { id: 'scheduled', title: 'Still scheduled', value: hoursLabel(hours.remaining) },
        ] };
        break;
      }
      case 'shifts':
      case 'open_shifts': {
        const own = widget.id === 'shifts';
        const shifts = records.filter(r => r.kind === 'shift' && (own ? r.person === v.person && r.status === 'Published' : !r.person && r.status !== 'Cancelled' && (v.owner || r.department === v.department)) && localInstant(r.end) > now && localInstant(r.start) < now + 14 * 86400000).sort((a, b) => String(a.start).localeCompare(String(b.start)));
        content = { detail: 'Next 14 days', items: shifts.slice(0, 4).map(r => ({ id: r.id, title: dateTime(String(r.start)), detail: `Until ${dateTime(String(r.end))} · ${r.department}`, target: { ...widget.target!, date: String(r.start).slice(0, 10), department: String(r.department) } })), empty: own ? 'No upcoming shifts assigned.' : 'No available shifts in your department.' };
        break;
      }
      case 'time_off': {
        const types = ['PTO', ...(self && isExempt(self) ? ['Comp time'] : [])];
        content.items = types.map(type => { const balance = leaveBalance(records, v.person, type, date); return { id: type, title: type, value: balance.known ? hoursLabel(balance.available) : 'Not entered', detail: `${hoursLabel(balance.pending)} requested · ${hoursLabel(balance.reserved)} approved upcoming` }; });
        break;
      }
      case 'pay': {
        const runs = records.filter(r => r.kind === 'payrun' && r.status === 'Released' && Array.isArray(r.lines)).flatMap(r => (r.lines as Record<string, unknown>[]).filter(line => line.person === v.person).map(line => ({ run: r, line }))).sort((a, b) => String(b.run.periodEnd).localeCompare(String(a.run.periodEnd)));
        content = { items: runs.slice(0, 4).map(({ run, line }) => ({ id: run.id, title: range(run.period,run.periodEnd), value: money(line.payment), detail: 'Released paystub', target: widget.target })), empty: 'No released paystubs yet.' };
        break;
      }
      case 'spending': {
        const week = spendingWeek(date), report = records.find(r => r.kind === 'expenseReport' && r.person === v.person && r.period === week.start);
        const expenses = records.filter(r => r.kind === 'expense' && r.person === v.person && String(r.date) >= week.start && String(r.date) <= week.end && r.status !== 'Voided');
        content = { metric: money(expenses.reduce((sum, r) => sum + num(r.amount), 0)), status: String(report?.status || 'Not submitted'), detail: range(week.start,week.end), items: [
          { id: 'due', title: 'Report due', detail: report?.due ? dateTime(String(report.due)) : `${auditDay(week.end)} · ${String(company?.expenseDeadline || 'Friday 11:59 PM')} CT` },
          { id: 'count', title: 'Recorded purchases', value: String(expenses.length) },
        ] };
        break;
      }
      case 'approvals': {
        const labels: Record<string, string> = { leaveRequest: 'Time off', shiftRequest: 'Shift pickup', timeCorrection: 'Time correction', overtime: 'Overtime', expenseReport: 'Spending report' };
        const pending = scoped.filter(r => labels[r.kind] && ['Requested', 'Pending', 'In review'].includes(String(r.decision || r.status)) && managesPerson(v, String(r.person), records) && canAccess(v, r.kind === 'expenseReport' ? 'Finance' : 'Timeclock', r.kind === 'expenseReport' ? 'Outflows' : 'Requests', true));
        content = pending.length ? { metric: String(pending.length), items: pending.slice(0, 4).map(r => ({ id: r.id, title: `${name(r.person)} · ${labels[r.kind]}`, detail: auditDay(r.date || r.period), target: r.kind === 'expenseReport' ? target('Finance', 'Outflows', 'To approve') : target('Timeclock', 'Requests') })) } : { items: [], empty: 'No approvals pending' };
        break;
      }
      case 'coverage': {
        const departments = [...new Set([v.department, ...activeTeam.map(p => String(p.department))])];
        const rows = departments.map(department => ({ department, count: departmentGaps(records, period.start, addDays(period.end, 1), department).length }));
        content = { detail: range(period.start,period.end), items: rows.map(r => ({ id: r.department, title: r.department, value: `${r.count} ${r.count === 1 ? 'gap' : 'gaps'}`, target: { ...widget.target!, department: r.department } })), empty: 'No departments assigned.' };
        break;
      }
      case 'team_time': {
        const rows = activeTeam.map(p => ({ p, hours: weekHours(records, p.id, period.start, period.end, now), overtime: overtimeEligible(p) }));
        rows.sort((a, b) => Number(b.overtime && b.hours.worked >= 36) - Number(a.overtime && a.hours.worked >= 36) || b.hours.worked - a.hours.worked);
        content = { metric: String(rows.filter(r => r.overtime && r.hours.worked > 40).length), detail: 'People in overtime', items: rows.slice(0, 5).map(({ p, hours, overtime }) => ({ id: p.id, title: String(p.name), value: hoursLabel(hours.worked), detail: overtime ? `${Math.round(hours.worked / 40 * 100)}% of 40 hours` : String(p.department), target: { ...widget.target!, person: p.id } })), empty: 'No active employees assigned.' };
        break;
      }
      case 'payroll': {
        const lines = scoped.filter(p => p.kind === 'person' && p.status === 'Active' && p.payType && p.payType !== 'Pending method').map(p => payrollLine(p, scoped, period.start, period.end, true));
        const needReview = lines.filter(line => line.issues.length > 0).length;
        content = { metric: money(lines.reduce((sum, line) => sum + line.gross, 0)), detail: `Entered gross pay forecast · Payday ${auditDay(period.payday)}`, status: needReview ? `${needReview} need review` : undefined, items: [], empty: lines.length ? undefined : 'No pay agreements entered.' };
        break;
      }
      case 'bills': {
        const rows = scoped.filter(r => r.kind === 'bill' && !['Paid', 'Voided', 'Cancelled'].includes(String(r.status)) && billBalance(r) > 0).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
        content = { metric: money(rows.reduce((sum, r) => sum + billBalance(r), 0)), detail: 'Unpaid recorded bills', items: rows.slice(0, 4).map(r => ({ id: r.id, title: String(r.vendor || r.name || 'Bill'), detail: r.due ? `Due ${auditDay(r.due)}` : 'Due date not entered', value: money(billBalance(r)), target: widget.target })), empty: 'No unpaid bills recorded.' };
        break;
      }
      case 'taxes': {
        const unfinished = scoped.filter(r => r.kind === 'tax' && !(r.filingStatus === 'Filed' && r.paymentStatus === 'Paid'));
        const rows = unfinished.filter(r => r.due && String(r.due) <= addDays(date, 30)).sort((a, b) => String(a.due).localeCompare(String(b.due)));
        content = { detail: 'Overdue & next 30 days', status: unfinished.some(r => !r.due) ? `${unfinished.filter(r => !r.due).length} dates need review` : undefined, items: rows.slice(0, 4).map(r => ({ id: r.id, title: `${r.name} · ${r.year}`, detail: `Due ${auditDay(r.due)} · ${r.filingStatus || r.status}`, target: widget.target })), empty: 'No deadlines recorded for the next 30 days.' };
        break;
      }
      case 'account_tools':
        content.items = links([['Accounts', 'Account Management', 'accounts'], ['Dispatcher notes', 'Account Management', 'notes'], ['Mileage reports', 'Account Management', 'mileage']]); break;
      case 'sales_tools':
        content.items = links([['Follow-up & activity', 'Sales CRM', 'activity'], ['Sales pipeline', 'Sales CRM', 'pipeline'], ['Route planner', 'Sales CRM', 'routes']]); break;
      case 'dispatch_tools':
        content.items = links([['Property instructions', 'Accounts', 'overview'], ['Permit history', 'Accounts', 'permits'], ['Exceptions & reserved spaces', 'Accounts', 'exceptions']]); break;
      case 'work_orders':
        content.items = links([['Open work orders', 'Work Orders', 'orders'], ['Preventive maintenance', 'Work Orders', 'preventive'], ['Assets & vendors', 'Work Orders', 'assets']]); break;
      case 'vehicle_sales':
        content.items = links([['Company Drive', 'Company Drive', 'browse']]); break;
      case 'sops':
        content.items = links([['My acknowledgments', 'SOP Library', 'assigned'], ['School House Policies', 'SOP Library', 'library']]); break;
      case 'workspaces':
        content.items = Object.keys(accessCatalog).filter(module => module !== 'Home' && canAccess(v, module)).map(module => ({ id: module, title: module, target: target(module) })); break;
    }
    result[widget.id] = content;
  }
  return result;
}
