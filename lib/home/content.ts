import type { FinRecord, Viewer } from '../finance/model';
import { accessCatalog, canAccess } from '../finance/access.ts';
import { visible } from '../finance/visibility.ts';
import { addDays, money, num, payrollLine, spendingWeek, workweek } from '../finance/model.ts';
import { departmentGaps, hoursLabel, isExempt, leaveBalance, localDate, localInstant, managesPerson, overtimeEligible, weekHours } from '../finance/timeclock.ts';
import { billBalance } from '../finance/bills.ts';
import type { HomeItem, HomeTarget, WidgetContent, WidgetDefinition, HomeChart } from './widgets';

const dateTime = (value: string) => new Date(localInstant(value)).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const target = (module: string, tab?: string, section?: string): HomeTarget => ({ module, tab, section });
const safeSlack = (value: unknown) => {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && (url.hostname === 'slack.com' || url.hostname.endsWith('.slack.com')) ? url.href : undefined; }
  catch { return undefined; }
};

export function homeContent(v: Viewer, records: FinRecord[], widgets: WidgetDefinition[], now = Date.now()): Record<string, WidgetContent> {
  const date = localDate(now), company = records.find(r => r.id === 'company'), period = workweek(date, company);
  const self = records.find(r => r.id === v.person), scoped = visible(v, records);
  const name = (id: unknown) => String(records.find(r => r.kind === 'person' && r.id === id)?.name || 'Employee');
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
        content = { metric: hoursLabel(hours.worked), status: hours.active ? 'Clocked in' : 'Clocked out', detail: `${period.start} – ${period.end}`, items: [
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
        content = { items: runs.slice(0, 4).map(({ run, line }) => ({ id: run.id, title: `${run.period} – ${run.periodEnd}`, value: money(line.payment), detail: 'Released paystub', target: widget.target })), empty: 'No released paystubs yet.' };
        break;
      }
      case 'spending': {
        const week = spendingWeek(date), report = records.find(r => r.kind === 'expenseReport' && r.person === v.person && r.period === week.start);
        const expenses = records.filter(r => r.kind === 'expense' && r.person === v.person && String(r.date) >= week.start && String(r.date) <= week.end && r.status !== 'Voided');
        const byCategory = expenses.reduce((acc, r) => { const c = String(r.category || 'Uncategorized'); acc[c] = (acc[c] || 0) + num(r.amount); return acc; }, {} as Record<string, number>);
        const chart: HomeChart = { type: 'doughnut', data: Object.entries(byCategory).map(([category, amount]) => ({ category, amount: Math.round(amount) })) as Record<string, unknown>[], nameKey: 'category', valueKey: 'amount' };
        content = { metric: money(expenses.reduce((sum, r) => sum + num(r.amount), 0)), status: String(report?.status || 'Not submitted'), detail: `${week.start} – ${week.end}`, items: [
          { id: 'due', title: 'Report due', detail: report?.due ? dateTime(String(report.due)) : `${week.end} · ${String(company?.expenseDeadline || 'Friday 11:59 PM')} Central` },
          { id: 'count', title: 'Recorded purchases', value: String(expenses.length) },
        ], chart };
        break;
      }
      case 'approvals': {
        const labels: Record<string, string> = { leaveRequest: 'Time off', shiftRequest: 'Shift pickup', timeCorrection: 'Time correction', overtime: 'Overtime', expenseReport: 'Spending report' };
        const pending = scoped.filter(r => labels[r.kind] && ['Requested', 'Pending', 'In review'].includes(String(r.decision || r.status)) && managesPerson(v, String(r.person), records) && canAccess(v, r.kind === 'expenseReport' ? 'Finance' : 'Timeclock', r.kind === 'expenseReport' ? 'Outflows' : 'Requests', true));
        content = pending.length ? { metric: String(pending.length), items: pending.slice(0, 4).map(r => ({ id: r.id, title: `${name(r.person)} · ${labels[r.kind]}`, detail: String(r.date || r.period || ''), target: r.kind === 'expenseReport' ? target('Finance', 'Outflows', 'To approve') : target('Timeclock', 'Requests') })) } : { items: [], empty: 'No approvals pending' };
        break;
      }
      case 'coverage': {
        const departments = [...new Set([v.department, ...activeTeam.map(p => String(p.department))])];
        const rows = departments.map(department => ({ department, count: departmentGaps(records, period.start, addDays(period.end, 1), department).length }));
        const chart: HomeChart = { type: 'bar', data: rows.map(r => ({ department: r.department, count: r.count })) as Record<string, unknown>[], xKey: 'department', yKey: 'count', color: '#8b5cf6' };
        content = { detail: `${period.start} – ${period.end}`, items: rows.map(r => ({ id: r.department, title: r.department, value: `${r.count} ${r.count === 1 ? 'gap' : 'gaps'}`, target: { ...widget.target!, department: r.department } })), chart, empty: 'No departments assigned.' };
        break;
      }
      case 'team_time': {
        const rows = activeTeam.map(p => ({ p, hours: weekHours(records, p.id, period.start, period.end, now), overtime: overtimeEligible(p) }));
        rows.sort((a, b) => Number(b.overtime && b.hours.worked >= 36) - Number(a.overtime && a.hours.worked >= 36) || b.hours.worked - a.hours.worked);
        const chart: HomeChart = { type: 'bar', data: rows.slice(0, 8).map(r => ({ name: String(r.p.name).split(' ')[0], hours: Math.round(r.hours.worked * 10) / 10 })) as Record<string, unknown>[], xKey: 'name', yKey: 'hours', color: '#f97316' };
        content = { metric: String(rows.filter(r => r.overtime && r.hours.worked > 40).length), detail: 'People in overtime', items: rows.slice(0, 5).map(({ p, hours, overtime }) => ({ id: p.id, title: String(p.name), value: hoursLabel(hours.worked), detail: overtime ? `${Math.round(hours.worked / 40 * 100)}% of 40 hours` : String(p.department), target: { ...widget.target!, person: p.id } })), chart, empty: 'No active employees assigned.' };
        break;
      }
      case 'payroll': {
        const lines = scoped.filter(p => p.kind === 'person' && p.status === 'Active' && p.payType && p.payType !== 'Pending method').map(p => payrollLine(p, scoped, period.start, period.end, true));
        const needReview = lines.filter(line => line.issues.length > 0).length;
        const payrollByDept = lines.reduce((acc, line) => { const d = line.department || 'Other'; acc[d] = (acc[d] || 0) + line.gross; return acc; }, {} as Record<string, number>);
        const chart: HomeChart = { type: 'bar', data: Object.entries(payrollByDept).map(([dept, gross]) => ({ dept, gross: Math.round(gross) })) as Record<string, unknown>[], xKey: 'dept', yKey: 'gross', color: '#10b981' };
        content = { metric: money(lines.reduce((sum, line) => sum + line.gross, 0)), detail: `Entered gross pay forecast · Payday ${period.payday}`, status: needReview ? `${needReview} need review` : undefined, items: [], chart, empty: lines.length ? undefined : 'No pay agreements entered.' };
        break;
      }
      case 'bills': {
        const rows = scoped.filter(r => r.kind === 'bill' && !['Paid', 'Voided', 'Cancelled'].includes(String(r.status)) && billBalance(r) > 0).sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')));
        const chart: HomeChart = { type: 'bar', data: rows.slice(0, 8).map(r => ({ vendor: String(r.vendor || r.name || 'Bill'), balance: Math.round(billBalance(r)) })) as Record<string, unknown>[], xKey: 'vendor', yKey: 'balance', color: '#ef4444' };
        content = { metric: money(rows.reduce((sum, r) => sum + billBalance(r), 0)), detail: 'Unpaid recorded bills', items: rows.slice(0, 4).map(r => ({ id: r.id, title: String(r.vendor || r.name || 'Bill'), detail: r.due ? `Due ${r.due}` : 'Due date not entered', value: money(billBalance(r)), target: widget.target })), chart, empty: 'No unpaid bills recorded.' };
        break;
      }
      case 'taxes': {
        const unfinished = scoped.filter(r => r.kind === 'tax' && !(r.filingStatus === 'Filed' && r.paymentStatus === 'Paid'));
        const rows = unfinished.filter(r => r.due && String(r.due) <= addDays(date, 30)).sort((a, b) => String(a.due).localeCompare(String(b.due)));
        content = { detail: 'Overdue & next 30 days', status: unfinished.some(r => !r.due) ? `${unfinished.filter(r => !r.due).length} dates need review` : undefined, items: rows.slice(0, 4).map(r => ({ id: r.id, title: `${r.name} · ${r.year}`, detail: `Due ${r.due} · ${r.filingStatus || r.status}`, target: widget.target })), empty: 'No deadlines recorded for the next 30 days.' };
        break;
      }
      case 'account_tools':
        content.items = links([['Accounts', 'Account Management', 'accounts'], ['Dispatcher notes', 'Account Management', 'notes'], ['Mileage reports', 'Account Management', 'mileage']]); break;
      case 'sales_tools':
        content.items = links([['Follow-up & activity', 'Sales CRM', 'activity'], ['Sales pipeline', 'Sales CRM', 'pipeline'], ['Route planner', 'Sales CRM', 'routes']]); break;
      case 'dispatch_tools':
        content.items = links([['Property instructions', 'Accounts', 'overview'], ['Permit history', 'Accounts', 'permits'], ['Exceptions & reserved spaces', 'Accounts', 'exceptions']]); break;
      case 'work_orders': {
        const today_ = localDate(now);
        const workOrders = records.filter(r => r.kind === 'workOrder');
        const isOpen = (r: FinRecord) => !['Completed','Cancelled','Duplicate','Unable to Complete','Deferred'].includes(String(r.status || 'New'));
        const open = workOrders.filter(isOpen);
        const emergency = open.filter(r => r.priority === 'Emergency');
        const urgent = open.filter(r => r.priority === 'Urgent');
        const awaiting = open.filter(r => r.status === 'Awaiting Approval' || (r.requiresApproval && r.status === 'New'));
        const overdue = open.filter(r => r.dueDate && String(r.dueDate) < today_);
        const myAssigned = open.filter(r => r.assignee === v.person);
        const byCat = ['Account Management','Fleet Maintenance & Repairs','IT Support','Facilities & Maintenance','Supplies & Purchasing','Hardware, Software & Access','Safety','Project','Other']
          .map(cat => ({ cat, count: open.filter(r => r.category === cat).length }))
          .filter(x => x.count > 0);
        const chart: HomeChart = { type: 'bar', data: byCat.map(x => ({ cat: x.cat, count: x.count })) as Record<string, unknown>[], xKey: 'cat', yKey: 'count', color: '#3b82f6' };
        content = {
          metric: String(open.length),
          detail: 'Open work orders',
          status: emergency.length ? `${emergency.length} emergency` : urgent.length ? `${urgent.length} urgent` : undefined,
          items: [
            { id: 'emergency', title: 'Emergency / Urgent', value: String(emergency.length + urgent.length) },
            { id: 'overdue', title: 'Overdue', value: String(overdue.length) },
            { id: 'approval', title: 'Awaiting approval', value: String(awaiting.length) },
            { id: 'mine', title: 'Assigned to me', value: String(myAssigned.length) },
          ],
          chart,
        };
        break;
      }
      case 'vehicle_sales':
        content.items = links([['Vehicle queue', 'Vehicle Disposition & Sales', 'queue'], ['Notice deadlines', 'Vehicle Disposition & Sales', 'notices'], ['Buyers & sales', 'Vehicle Disposition & Sales', 'buyers']]); break;
      case 'sops':
        content.items = links([['My acknowledgments', 'SOP Library', 'assigned'], ['SOP library', 'SOP Library', 'library']]); break;
      case 'workspaces':
        content.items = Object.keys(accessCatalog).filter(module => module !== 'Home' && canAccess(v, module)).map(module => ({ id: module, title: module, target: target(module) })); break;
    }
    result[widget.id] = content;
  }
  return result;
}
