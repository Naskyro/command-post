import { current, today, type Row } from './model';

export const managerRoles = ['Property Manager', 'Facility Manager', 'Business Owner', 'Business Manager'];
export const healthFactors = [
  ['relationship', 'Relationship strength', 15], ['checkin', 'Check-in cadence', 10],
  ['onboarding', 'Onboarding', 10], ['signage', 'Signage & markings', 15],
  ['permits', 'Permit clarity / rejection trends', 10], ['pause', 'Pause risk', 15],
  ['safety', 'Safety', 10], ['revenue', 'Revenue / service health', 10], ['documentation', 'Documentation', 5],
] as const;
export function healthScore(account: Row) {
  const factors = healthFactors.filter(([key]) => key !== 'permits' || account.service === 'Full Patrol');
  const entered = factors.filter(([key]) => typeof account['health_' + key] === 'number');
  const complete = entered.length === factors.length;
  const maximum = factors.reduce((s, [, , max]) => s + max, 0);
  const score = Math.round(entered.reduce((s, [key]) => s + Number(account['health_' + key]), 0) / maximum * 100);
  return { score: complete ? score : null, entered: entered.length, total: factors.length,
    status: !complete ? 'Not assessed' : score >= 85 ? 'Healthy' : score >= 70 ? 'Watch' : score >= 55 ? 'At Risk' : 'Critical' };
}
export const vehicleKey = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function vehicleMatch(row: Row, query: string, state = '') {
  const q = vehicleKey(query);
  return !!q && (vehicleKey(row.vin) === q || vehicleKey(row.plate) === q && (!state || vehicleKey(row.plateState) === vehicleKey(state)));
}
export function tenureAt(all: Row[], accountId: string, date: string) {
  if (!date) return undefined;
  const matches = all.filter(r => r.kind === 'affiliation' && r.accountId === accountId && managerRoles.includes(String(r.role)) && r.startDate && current(r, date));
  return matches.length === 1 ? matches[0] : undefined;
}
export function relationshipLength(date: unknown, now = today()) {
  if (!date || String(date) > now) return 'Start date not recorded';
  const months = Math.floor((Date.parse(now) - Date.parse(String(date))) / 86400000 / 30.4375);
  return months < 1 ? 'Under one month' : `${Math.floor(months / 12) ? Math.floor(months / 12) + ' yr ' : ''}${months % 12} mo`;
}
export const serviceDescriptions: Record<string,string> = {
  'Basic Patrol': 'Handicap spaces, fire lanes, double parking, and blocked entrances or dumpsters.',
  'Full Patrol': 'Full Patrol',
  'Call In': 'Respond to authorized calls for service.',
};
