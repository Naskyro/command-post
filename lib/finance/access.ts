import type { FinRecord, Viewer } from './model';
export type AccessGrant = {
    module: string;
    tab: string;
    level: 'View' | 'Edit';
};
export const accessCatalog: Record<string, Record<string, string>> = {
    Home: { home: 'Home', fieldBriefing: 'Field Briefing: Service Status & Issued CTWs' },
    Accounts: {safety:'Trespass & Safety',overview:'Dispatch Instructions',agreement:'Towing Agreement',signage:'Signage Evidence',notes:'Account Notes',courtesy:'Courtesy & Reduced Releases'},
    'Account Management': {safety:'Trespass & Safety',today:'Today',accounts:'Accounts',relationships:'People & Companies',work:'Work Queue',email:'Google Email',team:'Department Playbook',setup:'Service Details',activity:'Activity & History',signage:'Signage Inspections',files:'Files & Letters',decisions:'Service Decisions',performance:'Property Results',opportunities:'Sales Opportunities',courtesy:'Courtesy & Reduced Releases',claims:'Damage Claim Investigations',courtHearings:'Property Court Hearings',courtesyApprove:'Approve Courtesy Releases',lifecycle:'Account Lifecycle',interactions:'Interactions',mileage:'Mileage Reports',notes:'Dispatcher Notes',summary:'Account Overview',agreement:'Agreement',compliance:'Compliance & Evidence'},
    'Sales CRM': { email:'Gmail History', dashboard:'Dashboard', relationships:'Relationships', settings:'Stage Settings', pipeline: 'Pipeline', opportunities: 'All Opportunities', record: 'Selected Record', routes: 'Route Planner', activity: 'Activity & Follow-Up', compliance: 'Compliance & Handoff', performance: 'Performance' },
    Finance: { Overview: 'Overview', Payroll: 'Payroll', Outflows: 'Outflows', Receivables: 'Receivables', Debts: 'Debts', 'Reports & Taxes': 'Reports & Taxes', Settings: 'Settings', 'My pay': 'My Pay', 'My spending': 'My Spending' },
    Timeclock: { Today: 'Today', Schedule: 'Schedule', 'Open shifts': 'Open Shifts', Timesheets: 'Timesheets', Requests: 'Requests', 'Time off': 'Time Off', History: 'History' },
    'People & HR': { reports:'Reports', pay: 'Pay Agreements', home: 'HR Home', people: 'People', hiring: 'Hiring & Onboarding', time: 'Scheduling & Time Off', performance: 'Performance', relations: 'Employee Relations', credentials: 'Credentials & Training', records: 'HR Records', org: 'Organization Chart', changes: 'Promotions & Role Changes', benefits: 'Benefits & Plans', rights: 'Legal Rights & Leave', offboarding: 'Offboarding', 'rights-reference': 'Rights & Guidance' },
    'Work Orders': { dashboard: 'Dashboard', orders: 'Work Orders', preventive: 'Preventive Maintenance', assets: 'Assets & Vendors', calendar: 'Calendar', completed: 'Completed' },
    'Compliance, Claims & Recovery': { command: 'Command Center', calendar: 'Compliance Calendar', people: 'Personnel Review', licenses: 'Licenses & Testing', hearings: 'Court Docket', 'court-counsel':'Confidential Counsel & Representation', 'court-directory':'Court & Judge Directory', damage: 'Damage Claims', tdlr: 'TDLR Complaints', recovery: 'Chargebacks & Recovery', legal: 'Legal Notices & Correspondence', reports: 'CCR Reports' },
    'Company Drive': { browse: 'Shared Files', manage: 'Manage All Folders & Sharing' },
    'Vehicle Disposition & Sales': { vehicles: 'Vehicle Dispositions' },
    Slack: { workspace: 'Workspace' }, 'SOP Library': { learning:'Learning Overview', 'assigned-learning':'Assigned Learning', courses:'Course Catalog & Cross-Training', history:'My Scores & Certificates', leaderboard:'Department Leaderboard', studio:'Course & Quiz Studio', scores:'Team Scores & Grading', assignments:'Learning Assignments', achievements:'External Achievements', library: 'Published Policy Library', assigned: 'My Policy Acknowledgments', workflow: 'Policy Editing & Publication', inbox: 'Policy Request Inbox' }, Admin: { 'password-resets':'Reset Staff Passwords', 'delegated-access':'Delegated Access', users: 'Users & Access', departments: 'Departments', announcements:'Announcements', 'site-themes':'Site Themes', activity:'Activity & Change History' }
};
export const schoolLearnerTabs=['learning','assigned-learning','courses','history','leaderboard'] as const;
export const schoolInstructorTabs=['studio','scores','assignments','achievements'] as const;
export function grantsFor(p: FinRecord): AccessGrant[] {
    if (p.accessMode === 'Custom') {
        const grants=((p.access || []) as Record<string, unknown>[]).filter(g => accessCatalog[String(g.module)]?.[String(g.tab)] && ['View', 'Edit'].includes(String(g.level))) as AccessGrant[];
        // Extend pre-School-House policy readers once. After access is explicitly saved,
        // every checkbox (including a cleared learning tab) remains authoritative.
        if(p.schoolAccessConfigured!==true&&grants.some(g=>g.module==='SOP Library'&&['library','assigned'].includes(g.tab)))return [...grants,...schoolLearnerTabs.filter(tab=>!grants.some(g=>g.module==='SOP Library'&&g.tab===tab)).map(tab=>({module:'SOP Library',tab,level:'View' as const}))];
        return grants;
    }
    const department = String(p.departmentKey || p.department);
    const all = (module: string, level: 'View' | 'Edit' = 'Edit') => Object.keys(accessCatalog[module]).map(tab => ({ module, tab, level }));
    if (p.role === 'Owner')
        return ['jerson', 'jendel', 'jeidy'].includes(p.id) ? Object.keys(accessCatalog).flatMap(m => all(m)) : [];
    const grants = [{module:'Company Drive',tab:'browse',level:'View' as const},...['home','people','hiring','performance','benefits','records'].map(tab => ({module:'People & HR',tab,level:'View' as const})), {module:'Home',tab:'home',level:'Edit' as const}, ...all('Timeclock'), ...all('Slack'), ...['library','assigned'].map(tab=>({module:'SOP Library',tab,level:'View' as const})), { module: 'Finance', tab: 'My pay', level: 'View' as const }, { module: 'Finance', tab: 'My spending', level: 'Edit' as const }];
    grants.push(...schoolLearnerTabs.map(tab=>({module:'SOP Library',tab,level:'View' as const})));
    if (['Supervisor','Department Head'].includes(String(p.role))||['Manager','Department Lead / Director','Department Lead','Director','Executive'].includes(String(p.authorityLevel||p.organizationalLevel||''))) grants.push(...schoolInstructorTabs.map(tab=>({module:'SOP Library',tab,level:'Edit' as const})));
    if (['Drivers','Dispatch'].includes(department)) grants.push({module:'Home',tab:'fieldBriefing',level:'View'});
    if (department === 'Operations') grants.push({module:'Work Orders',tab:'orders',level:'Edit'});
    if (p.role === 'Department Head') grants.push({module:'Accounts',tab:'safety',level:'Edit'});
    if (department === 'Dispatch')
        grants.push(...all('Accounts'));
    if (department === 'Account Managers')
        grants.push(...all('Account Management'), ...all('Sales CRM'));
    if (['Supervisor', 'Department Head'].includes(String(p.role)))
        grants.push(...all('People & HR'), { module: 'Finance', tab: 'Payroll', level: 'Edit' });
    if (p.role === 'Department Head' && department === 'Operations')
        grants.push(...all('Finance'), ...all('Work Orders'), ...all('Compliance, Claims & Recovery'));
    return grants;
}
export function canAccess(v: Viewer | undefined, module: string, tab?: string, edit = false) {
    if (!v)
        return false;
    if (v.onboardingOnly)
        return module === 'People & HR' && (!tab || tab === 'hiring') || module === 'SOP Library' && !edit && (!tab || (schoolLearnerTabs as readonly string[]).includes(tab));
    if (module === 'Home' && (!tab || tab === 'home'))
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
// These records have dedicated routes with narrower projections and per-user scope.
// Never expose or mutate them through Finance, even for an owner.
const privateAdminKinds = new Set(['siteAnnouncement', 'announcementReceipt', 'siteTheme', 'accessTemplate']);
export function recordAccess(v: Viewer, r: FinRecord, edit = false) { if (privateAdminKinds.has(r.kind)) return false; if (v.owner)
    return !['accessTicket', 'shiftClaim'].includes(r.kind); if (r.kind === 'file')
    return true; if (edit && r.kind === 'category')
    return canAccess(v, 'Finance', 'Settings', true) || canAccess(v, 'Finance', 'Outflows', true); if (edit && r.kind === 'transaction')
    return canAccess(v, 'Finance', 'Outflows', true); if (edit && r.kind === 'department')
    return v.owner && canAccess(v, 'Admin', 'departments', true); return (recordAreas[r.kind] || []).some(([m, t]) => canAccess(v, m, t, edit)); }
