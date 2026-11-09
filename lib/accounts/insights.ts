import { current, today, type Row } from './model';

export const managerRoles = ['Property Manager', 'Facility Manager', 'Business Owner', 'Business Manager'];
export const healthFactors = [
  ['relationship', 'Relationship strength', 15], ['checkin', 'Check-in cadence', 10],
  ['onboarding', 'Onboarding', 10], ['signage', 'Signage & markings', 15],
  ['permits', 'Permit clarity / rejection trends', 10], ['pause', 'Pause risk (0 safe · 15 near pause)', 15],
  ['safety', 'Onsite Driver Safety', 10], ['revenue', 'Revenue / service health', 10], ['documentation', 'Documentation', 5],
] as const;

function applicableHealthFactors(account: Row) {
  return healthFactors.filter(([key]) => key !== 'permits' || account.service === 'Full Patrol');
}

/**
 * Health inputs are recorded on a 0-to-max scale. Every input is a positive
 * health signal except pause risk: that field is deliberately a risk score,
 * so 0 means no observed pause risk and 15 means the account is close to a
 * pause. The normalized value is therefore inverted before it contributes to
 * the overall health score.
 */
export function healthContribution(key: string, value: number, maximum: number) {
  const raw = Number.isFinite(value) ? Math.max(0, Math.min(maximum, value)) : 0;
  return key === 'pause' ? maximum - raw : raw;
}

export type HealthBreakdown = {
  key: string;
  label: string;
  max: number;
  raw: number;
  earned: number;
  percentOfMax: number;
  shareOfEarned: number;
};

export function healthBreakdown(account: Row): HealthBreakdown[] {
  const factors = applicableHealthFactors(account);
  const entered = factors.filter(([key]) => typeof account['health_' + key] === 'number');
  const earnedTotal = entered.reduce((sum, [key, , max]) => sum + healthContribution(key, Number(account['health_' + key]), max), 0);
  const breakdown = entered.map(([key, label, max]) => {
    const rawValue = Number(account['health_' + key]);
    const raw = Number.isFinite(rawValue) ? Math.max(0, Math.min(max, rawValue)) : 0;
    const earned = healthContribution(key, raw, max);
    return {
      key,
      label,
      max,
      raw,
      earned,
      percentOfMax: Math.round(raw / max * 100),
      shareOfEarned: earnedTotal ? Math.round(earned / earnedTotal * 100) : 0,
    };
  });
  // Make the displayed legend percentages add up to exactly 100 despite
  // rounding. Put the remainder on the largest earned slice so small factors
  // do not all appear inflated or disappear from the total.
  if (earnedTotal && breakdown.length) {
    const roundedTotal = breakdown.reduce((sum, item) => sum + item.shareOfEarned, 0);
    const remainder = 100 - roundedTotal;
    if (remainder) {
      const largest = breakdown.reduce((best, item, index) => item.earned > breakdown[best].earned ? index : best, 0);
      breakdown[largest].shareOfEarned += remainder;
    }
  }
  return breakdown;
}

export function healthScore(account: Row) {
  const factors = applicableHealthFactors(account);
  const entered = factors.filter(([key]) => typeof account['health_' + key] === 'number');
  const complete = entered.length === factors.length;
  const maximum = factors.reduce((s, [, , max]) => s + max, 0);
  const score = Math.round(entered.reduce((s, [key, , max]) => s + healthContribution(key, Number(account['health_' + key]), max), 0) / maximum * 100);
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
