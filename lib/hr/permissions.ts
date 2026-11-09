import type { FinRecord, Viewer } from '../finance/model';
import { canAccess } from '../finance/access.ts';
import { ForbiddenError, AppError } from '../shared/errors.ts';

export const hrActions = {
  viewPersonnel: 'View Personnel Records',
  managePersonnel: 'Manage Personnel Records',
  manageMedicalReports: 'Manage Confidential Accident Reports',
  manageOnboarding: 'Manage Hiring & Onboarding',
  approveStart: 'Approve Start Readiness',
  verifyI9: 'Verify Form I-9',
  reviewScreening: 'Review Restricted Screening Results',
  manageTaxBank: 'Manage Tax & Banking Records',
  manageCompensation: 'Manage Compensation',
  manageBenefits: 'Manage Benefits',
  recordPerformance: 'Record Coaching & Verbal Warnings',
  issueCorrective: 'Issue Corrective Actions',
  managePositions: 'Manage Positions',
  managePolicies: 'Manage HR Policy References',
  manageOffboarding: 'Manage Offboarding',
  exportPersonnel: 'Export Personnel Records',
  manageTwc: 'Manage TWC Cases',
  manageSettings: 'Manage HR Settings',
} as const;
export type HrAction = keyof typeof hrActions;
export type HrScope = 'Self' | 'Team' | 'Department' | 'Company';
export type HrResponsibility = { action: HrAction; scope: HrScope };
export const hrScopes: HrScope[] = ['Self', 'Team', 'Department', 'Company'];
const aliases: Record<string, HrAction> = { approveOnboarding: 'approveStart', viewTaxBank: 'manageTaxBank', viewScreening: 'reviewScreening' };
const actionKey = (action: string) => aliases[action] || action as HrAction;

export function responsibilityGrants(person: FinRecord): HrResponsibility[] {
  return (Array.isArray(person.hrResponsibilities) ? person.hrResponsibilities : []).flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const grant = value as Record<string, unknown>, action = actionKey(String(grant.action));
    return Object.prototype.hasOwnProperty.call(hrActions, action) && hrScopes.includes(grant.scope as HrScope) ? [{ action, scope: grant.scope as HrScope }] : [];
  });
}

/** An explicit Team responsibility follows reporting relationships regardless of job title. */
export function hrTeamContains(viewer: Viewer, personId: string, records: FinRecord[]) {
  const seen = new Set<string>();
  let id = personId;
  while (id && !seen.has(id)) {
    if (id === viewer.person) return true;
    seen.add(id);
    id = String(records.find(r => r.kind === 'person' && r.id === id)?.supervisor || '');
  }
  return false;
}

export function hrCan(viewer: Viewer, requestedAction: string, personId: string | undefined, records: FinRecord[]): boolean {
  if (viewer.onboardingOnly) return false;
  const action = actionKey(requestedAction);
  if (!Object.prototype.hasOwnProperty.call(hrActions, action)) return false;
  if (action === 'verifyI9' && personId === viewer.person) return false;
  if (viewer.owner) return true;
  if (!canAccess(viewer, 'People & HR') && !(action === 'manageTaxBank' && canAccess(viewer, 'Finance', 'Payroll')) && !(action === 'manageSettings' && canAccess(viewer, 'Admin', 'departments'))) return false;
  // Authority to review a team never permits self-approval of employment decisions.
  if (personId === viewer.person && ['approveStart', 'issueCorrective', 'manageCompensation', 'manageBenefits', 'manageOffboarding', 'verifyI9'].includes(action)) return false;
  const target = personId ? records.find(r => r.kind === 'person' && r.id === personId) : undefined;
  return (viewer.hrResponsibilities || []).some(grant => {
    if (actionKey(grant.action) !== action) return false;
    if (grant.scope === 'Company') return !personId || !!target;
    // A catalog action is constrained at its mutation endpoint; only Company scopes may edit company-wide catalogs.
    if (!personId || !target) return false;
    if (grant.scope === 'Self') return personId === viewer.person;
    if (grant.scope === 'Team') return hrTeamContains(viewer, personId, records);
    return grant.scope === 'Department' && target.department === viewer.department;
  });
}

export function boundedHrResponsibilities(input: unknown, viewer: Viewer, target: FinRecord, records: FinRecord[]): HrResponsibility[] {
  if (!Array.isArray(input) || input.length > Object.keys(hrActions).length) throw new AppError('Choose valid HR responsibilities.');
  const seen = new Set<string>();
  return input.map(value => {
    if (!value || typeof value !== 'object') throw new AppError('Choose a valid HR responsibility.');
    const grant = value as Record<string, unknown>, action = actionKey(String(grant.action)), scope = grant.scope as HrScope;
    if (!(Object.prototype.hasOwnProperty.call(hrActions, action)) || !hrScopes.includes(scope) || seen.has(action)) throw new AppError('Invalid or duplicate HR responsibility.');
    seen.add(action);
    if (!viewer.owner) {
      const own = viewer.hrResponsibilities?.find(g => g.action === action);
      const permitted = own?.scope === 'Company' || own?.scope === 'Department' && ['Self', 'Department'].includes(scope) && target.department === viewer.department || own?.scope === 'Team' && ['Self', 'Team'].includes(scope) && hrTeamContains(viewer, target.id, records);
      if (!permitted) throw new ForbiddenError('You cannot delegate an HR responsibility beyond your own authority or scope.');
    }
    return { action, scope };
  });
}
