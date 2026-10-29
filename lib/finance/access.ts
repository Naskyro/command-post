import type { FinRecord, Viewer } from './model';
export type AccessGrant = {
    module: string;
    tab: string;
    level: 'View' | 'Edit';
};
export const accessCatalog: Record<string, Record<string, string>> = {
    Home: { home: 'Home' },
    Accounts: {safety:'Trespass & safety',overview:'Dispatch instructions',agreement:'Towing agreement',signage:'Signage evidence',notes:'Account notes',courtesy:'Courtesy & reduced releases'},
    'Account Management': {safety:'Trespass & safety',today:'Today',accounts:'Accounts',relationships:'People & companies',work:'Work queue',email:'Google email',team:'Department playbook',setup:'Service details',activity:'Activity & history',signage:'Signage inspections',files:'Files & letters',decisions:'Service decisions',performance:'Property results',opportunities:'Sales opportunities',courtesy:'Courtesy & reduced releases',claims:'Damage claim investigations',courtesyApprove:'Approve courtesy releases',lifecycle:'Account lifecycle',interactions:'Interactions',mileage:'Mileage reports',notes:'Dispatcher notes',summary:'Account overview',agreement:'Agreement',compliance:'Compliance & evidence'},
    'Sales CRM': { pipeline: 'Pipeline', opportunities: 'All opportunities', record: 'Selected record', routes: 'Route planner', activity: 'Activity & follow-up', compliance: 'Compliance & handoff', performance: 'Performance' },
    Finance: { Overview: 'Overview', Payroll: 'Payroll', Outflows: 'Outflows', Receivables: 'Receivables', Debts: 'Debts', 'Reports & Taxes': 'Reports & Taxes', Settings: 'Settings', 'My pay': 'My pay', 'My spending': 'My spending' },
    Timeclock: { Today: 'Today', Schedule: 'Schedule', 'Open shifts': 'Open shifts', Timesheets: 'Timesheets', Requests: 'Requests', 'Time off': 'Time off', History: 'History' },
    'People & HR': { pay: 'Pay agreements', home: 'HR home', people: 'People', hiring: 'Hiring & onboarding', time: 'Scheduling & time off', performance: 'Performance', relations: 'Employee relations', credentials: 'Credentials & training', records: 'HR records', org: 'Organization chart', changes: 'Promotions & role changes', benefits: 'Benefits & plans', rights: 'Legal rights & leave', offboarding: 'Offboarding', 'rights-reference': 'Rights & guidance' },
    'Work Orders': { dashboard: 'Dashboard', orders: 'Work orders', preventive: 'Preventive maintenance', assets: 'Assets & vendors', calendar: 'Calendar', completed: 'Completed' },
    'Compliance, Claims & Recovery': { command: 'Command center', calendar: 'Compliance calendar', people: 'Personnel review', licenses: 'Licenses & testing', hearings: 'Tow hearings', damage: 'Damage claims', tdlr: 'TDLR complaints', recovery: 'Chargebacks & recovery', evidence: 'Inspection & evidence' },
    'Vehicle Disposition & Sales': { queue: 'Vehicle queue', notices: 'Notification timeline', vtr: 'VTR-265 & title', condition: 'Condition & listing', buyers: 'Buyers & sales', sale: 'Sale readiness', library: 'Compliance library' },
    Slack: { workspace: 'Workspace' }, 'SOP Library': { library: 'Library', assigned: 'My acknowledgments', workflow: 'Drafts & approvals', calendar: 'Review calendar', templates: 'Forms & templates', archive: 'Archive' }, Admin: { users: 'Users & access', departments: 'Departments' }
};
export function grantsFor(p: FinRecord): AccessGrant[] {
    if (p.accessMode === 'Custom')
        return ((p.access || []) as Record<string, unknown>[]).filter(g => accessCatalog[String(g.module)]?.[String(g.tab)] && ['View', 'Edit'].includes(String(g.level))) as AccessGrant[];
    const all = (module: string, level: 'View' | 'Edit' = 'Edit') => Object.keys(accessCatalog[module]).map(tab => ({ module, tab, level }));
    if (p.role === 'Owner')
        return ['jerson', 'jendel', 'jeidy'].includes(p.id) ? Object.keys(accessCatalog).flatMap(m => all(m)) : [];
    const grants = [...all('Home'), ...all('Timeclock'), ...all('Slack'), ...all('SOP Library', 'View'), ...all('Work Orders', 'View'), { module: 'Finance', tab: 'My pay', level: 'View' as const }, { module: 'Finance', tab: 'My spending', level: 'Edit' as const }];
    if (p.department === 'Operations') grants.push({module:'Work Orders',tab:'orders',level:'Edit'});
    if (p.role === 'Department Head') grants.push({module:'Accounts',tab:'safety',level:'Edit'});
    if (p.department === 'Dispatch')
        grants.push(...all('Accounts'));
    if (p.department === 'Account Managers')
        grants.push(...all('Account Management'), ...all('Sales CRM'));
    if (['Supervisor', 'Department Head'].includes(String(p.role)))
        grants.push(...all('People & HR'), { module: 'Finance', tab: 'Payroll', level: 'Edit' });
    if (p.role === 'Department Head' && p.department === 'Operations')
        grants.push(...all('Finance'), ...all('Work Orders'), ...all('Compliance, Claims & Recovery'), ...all('Vehicle Disposition & Sales'));
    return grants;
}
export function canAccess(v: Viewer | undefined, module: string, tab?: string, edit = false) {
    if (!v)
        return false;
    if (module === 'Home')
        return true;
    if (v.owner)
        return true;
    const grants = v.access || grantsFor({ id: v.person, kind: 'person', version: 0, role: v.role, department: v.department });
    return grants.some(g => g.module === module && (!tab || g.tab === tab) && (!edit || g.level === 'Edit'));
}
export const recordAreas: Record<string, [
    string,
    string
][]> = {
    shift: [['Timeclock', 'Schedule'], ['Timeclock', 'Open shifts']], shiftTemplate: [['Timeclock', 'Schedule']], shiftRequest: [['Timeclock', 'Open shifts'], ['Timeclock', 'Requests']], clock: [['Timeclock', 'Today'], ['Timeclock', 'Timesheets'], ['Timeclock', 'History'], ['Finance', 'Payroll']], time: [['Timeclock', 'Today'], ['Timeclock', 'Timesheets'], ['Timeclock', 'History'], ['Finance', 'Payroll']], timeCorrection: [['Timeclock', 'Requests'], ['Timeclock', 'Timesheets'], ['Timeclock', 'Today']], leaveCredit: [['Timeclock', 'Time off'], ['Timeclock', 'Today']], leaveRequest: [['Timeclock', 'Time off'], ['Timeclock', 'Requests'], ['Timeclock', 'Today'], ['Finance', 'Payroll']], overtime: [['Timeclock', 'Today'], ['Timeclock', 'Requests'], ['Finance', 'Payroll']],
    person: [['Finance', 'My pay'], ['Finance', 'My spending'], ['Finance', 'Payroll'], ['Finance', 'Settings'], ['Timeclock', 'Today'], ['Timeclock', 'Schedule'], ['Timeclock', 'Timesheets'], ['Timeclock', 'Requests'], ['Timeclock', 'Time off'], ['Timeclock', 'Open shifts'], ['Timeclock', 'History'], ['People & HR', 'people']], department: [['Finance', 'Settings'], ['Timeclock', 'Schedule'], ['Timeclock', 'Requests']],
    earning: [['Finance', 'Payroll']], taxInput: [['Finance', 'Payroll']], deduction: [['Finance', 'Payroll']], reimbursement: [['Finance', 'Payroll'], ['Finance', 'Outflows'], ['Finance', 'My spending']], payrun: [['Finance', 'Payroll'], ['Finance', 'My pay']], payment: [['Finance', 'Payroll'], ['Finance', 'Outflows'], ['Finance', 'My pay']], payIssue: [['Finance', 'Payroll'], ['Finance', 'My pay']], yearDocument: [['Finance', 'Reports & Taxes'], ['Finance', 'Payroll'], ['Finance', 'My pay']],
    expense: [['Finance', 'Outflows'], ['Finance', 'My spending']], expenseReport: [['Finance', 'Outflows'], ['Finance', 'My spending']], transaction: [['Finance', 'Outflows'], ['Finance', 'Overview'], ['Finance', 'Reports & Taxes']], account: [['Finance', 'Overview']], vendor: [['Finance', 'Outflows']], bill: [['Finance', 'Outflows']], subscription: [['Finance', 'Outflows']], ownerMoney: [['Finance', 'Outflows']], supply: [['Finance', 'Outflows']], journal: [['Finance', 'Outflows'], ['Finance', 'Reports & Taxes']], reconciliation: [['Finance', 'Outflows']], depositMatch: [['Finance', 'Outflows'], ['Finance', 'Receivables']],
    invoice: [['Finance', 'Receivables']], recovery: [['Finance', 'Receivables']], receipt: [['Finance', 'Receivables']], cashBag: [['Finance', 'Receivables']], cashMovement: [['Finance', 'Receivables']], debt: [['Finance', 'Debts']], debtPayment: [['Finance', 'Debts']], asset: [['Finance', 'Outflows'], ['Finance', 'Reports & Taxes']], tax: [['Finance', 'Reports & Taxes']], close: [['Finance', 'Reports & Taxes']], budget: [['Finance', 'Overview']], settings: [['Finance', 'Settings']], category: [['Finance', 'Settings'], ['Finance', 'Outflows'], ['Finance', 'My spending']], chart: [['Finance', 'Settings'], ['Finance', 'Outflows']], sourceIssue: [['Finance', 'Settings']], sourceImport: [['Finance', 'Settings']]
};
export function recordAccess(v: Viewer, r: FinRecord, edit = false) { if (v.owner)
    return !['accessTicket', 'shiftClaim'].includes(r.kind); if (r.kind === 'file')
    return true; if (edit && r.kind === 'category')
    return canAccess(v, 'Finance', 'Settings', true) || canAccess(v, 'Finance', 'Outflows', true); if (edit && r.kind === 'transaction')
    return canAccess(v, 'Finance', 'Outflows', true); if (edit && r.kind === 'department')
    return v.owner && canAccess(v, 'Admin', 'departments', true); return (recordAreas[r.kind] || []).some(([m, t]) => canAccess(v, m, t, edit)); }
