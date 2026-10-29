import { canAccess } from '../finance/access.ts';
import type { FinRecord, Viewer } from '../finance/model';
import { managesPerson } from '../finance/timeclock.ts';
import { AppError, ForbiddenError } from '../shared/errors.ts';

export type HomeSelection = { person?: string; date?: string; department?: string };
export type HomeTarget = HomeSelection & { module: string; tab?: string; section?: string };
export type WidgetDefinition = { id: string; title: string; group: string; target?: HomeTarget };
export type WidgetPlacement = { id: string; size: 'Standard' | 'Wide'; span?: 0 | 1 | 2 | 3 | 4; height?: 'Short' | 'Medium' | 'Tall'; widthUnits?: number; heightPx?: number };
export type HomeItem = { id: string; title: string; detail?: string; value?: string; target?: HomeTarget };
export type HomeChart = { type: 'bar' | 'line' | 'pie' | 'doughnut'; data: Record<string, unknown>[]; xKey?: string; yKey?: string; nameKey?: string; valueKey?: string; color?: string };
export type WidgetContent = { metric?: string; detail?: string; status?: string; items: HomeItem[]; empty?: string; href?: string; action?: string; chart?: HomeChart; };
export type HomeData = {
  viewer: Viewer; title: string; timeZone: string; grid: import('./layout').HomeGrid; widgets: WidgetDefinition[]; defaults: WidgetPlacement[];
  layout: WidgetPlacement[]; version: number; updatedAt: string | null;
  content: Record<string, WidgetContent>;
};

export function availableWidgets(v: Viewer, records: FinRecord[]): WidgetDefinition[] {
  const result: WidgetDefinition[] = [{ id: 'inbox', title: 'Email inbox', group: 'My day' }];
  const add = (id: string, title: string, group: string, module: string, tab?: string, section?: string) => {
    if (canAccess(v, module, tab)) result.push({ id, title, group, target: { module, tab, section } });
  };
  add('slack', 'Slack', 'My day', 'Slack', 'workspace');
  add('shifts', 'My upcoming shifts', 'My day', 'Timeclock', 'Schedule');
  add('hours', 'My hours & clock status', 'My day', 'Timeclock', 'Today');
  add('time_off', 'My time off', 'My day', 'Timeclock', 'Time off');
  add('open_shifts', 'Available shifts', 'My day', 'Timeclock', 'Open shifts');
  add('pay', 'My paystubs', 'My day', 'Finance', 'My pay', 'My pay');
  add('spending', 'My spending report', 'My day', 'Finance', 'My spending', 'My spending');
  const hasTeam = v.owner || records.some(p => p.kind === 'person' && p.status === 'Active' && p.id !== v.person && managesPerson(v, p.id, records));
  if (hasTeam) {
    if (canAccess(v, 'Timeclock', 'Requests', true) || canAccess(v, 'Finance', 'Outflows', true)) {
      result.push({ id: 'approvals', title: 'Needs my approval', group: 'My team' });
    }
    add('coverage', 'Department coverage', 'My team', 'Timeclock', 'Schedule');
    add('team_time', 'Team hours & overtime', 'My team', 'Timeclock', 'Timesheets');
  }
  if (canAccess(v, 'Finance', 'Payroll')) add('payroll', 'Payroll forecast', 'Money', 'Finance', 'Overview');
  add('bills', 'Bills due', 'Money', 'Finance', 'Outflows', 'Bills & renewals');
  add('taxes', 'Tax deadlines', 'Money', 'Finance', 'Reports & Taxes', 'Taxes & deadlines');
  add('account_tools', 'Account work', 'Work tools', 'Account Management', 'accounts');
  add('sales_tools', 'Sales follow-up', 'Work tools', 'Sales CRM', 'activity');
  add('dispatch_tools', 'Dispatch tools', 'Work tools', 'Accounts', 'overview');
  add('work_orders', 'Repairs & work orders', 'Work tools', 'Work Orders', 'orders');
  add('vehicle_sales', 'Vehicle sales', 'Work tools', 'Vehicle Disposition & Sales', 'queue');
  add('sops', 'My required reading', 'Work tools', 'SOP Library', 'assigned');
  result.push({ id: 'workspaces', title: 'My workspaces', group: 'Work tools' });
  return result;
}

export function defaultLayout(v: Viewer, available: WidgetDefinition[]): WidgetPlacement[] {
  const role = v.owner ? ['work_orders', 'approvals', 'payroll', 'coverage', 'bills', 'inbox', 'slack', 'taxes', 'workspaces']
    : ['Supervisor', 'Department Head'].includes(v.role) ? ['work_orders', 'approvals', 'coverage', 'team_time', 'shifts', 'inbox', 'slack', 'account_tools']
    : v.department === 'Account Managers' ? ['inbox', 'account_tools', 'sales_tools', 'shifts', 'spending', 'slack', 'hours', 'pay']
    : v.department === 'Dispatch' ? ['shifts', 'hours', 'dispatch_tools', 'open_shifts', 'inbox', 'slack', 'spending', 'pay']
    : ['work_orders', 'shifts', 'hours', 'open_shifts', 'pay', 'spending', 'inbox', 'slack', 'workspaces'];
  const ids = new Set(available.map(w => w.id));
  const selected = role.filter(id => ids.has(id)).slice(0, 8);
  if (!selected.length) selected.push('inbox', 'workspaces');
  return selected.map(id => id === 'work_orders' ? { id, size: 'Wide', span: 2 } : { id, size: 'Standard', span: 1 });
}

export function validateLayout(value: unknown, available: WidgetDefinition[]): WidgetPlacement[] {
  if (!Array.isArray(value) || value.length > 24) throw new AppError('Choose up to 24 widgets.');
  const allowed = new Set(available.map(w => w.id)), seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new AppError('Choose a valid widget.');
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).some(key => !['id', 'size', 'span', 'height', 'widthUnits', 'heightPx'].includes(key)) || typeof item.id !== 'string' || !['Standard', 'Wide'].includes(String(item.size))) throw new AppError('Choose a valid widget and size.');
    if (item.span !== undefined && (!Number.isInteger(item.span) || ![0,1,2,3,4].includes(Number(item.span)))) throw new AppError('Choose a valid widget width.');
    if (item.height !== undefined && !['Short','Medium','Tall'].includes(String(item.height))) throw new AppError('Choose a valid widget height.');
    if (item.widthUnits !== undefined && (!Number.isInteger(item.widthUnits) || Number(item.widthUnits) < 1 || Number(item.widthUnits) > 12)) throw new AppError('Choose a valid widget width.');
    if (item.heightPx !== undefined && (!Number.isInteger(item.heightPx) || Number(item.heightPx) < 128 || Number(item.heightPx) > 960)) throw new AppError('Choose a widget height between 128 and 960 pixels.');
    if (!allowed.has(item.id)) throw new ForbiddenError('Your access to a widget changed. Refresh Home before saving.');
    if (seen.has(item.id)) throw new AppError('Each widget can appear only once.');
    seen.add(item.id);
    return { id: item.id, size: item.size as WidgetPlacement['size'], ...(item.span !== undefined ? {span:item.span as WidgetPlacement['span']} : {}), ...(item.height !== undefined ? {height:item.height as WidgetPlacement['height']} : {}), ...(item.widthUnits !== undefined ? {widthUnits:Number(item.widthUnits)} : {}), ...(item.heightPx !== undefined ? {heightPx:Number(item.heightPx)} : {}) };
  });
}

export function restoreLayout(value: unknown, available: WidgetDefinition[]): WidgetPlacement[] {
  if (!Array.isArray(value)) throw new AppError('Your saved Home layout could not be read.', 503);
  const allowed = new Set(available.map(w => w.id));
  return validateLayout(value.filter(entry => entry && typeof entry === 'object' && allowed.has(entry.id)), available);
}
