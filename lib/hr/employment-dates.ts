type CalendarDate = { iso: string; year: number; month: number; day: number; utc: number };

export type EmploymentDateInput = {
 startDate?: unknown;
 endDate?: unknown;
 status?: unknown;
 asOf: string;
 /** Recorded separation date, used when the profile does not have a valid end date. */
 separationDate?: unknown;
};

export type EmploymentDateSummary = {
 hireDate: string | null;
 tenureLabel: string | null;
 tenureThroughDate: string | null;
 completedYears: number | null;
 nextAnniversaryDate: string | null;
 nextAnniversaryLabel: string | null;
 anniversaryNote: string | null;
 isFutureStart: boolean;
};

function parseDate(value: unknown): CalendarDate | null {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const utc = Date.parse(value + 'T12:00:00Z');
 if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null;
 const [year, month, day] = value.split('-').map(Number);
 return { iso: value, year, month, day, utc };
}

function daysInMonth(year: number, month: number): number {
 if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
 return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function dateAt(year: number, month: number, day: number): CalendarDate {
 const iso = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
 return parseDate(iso)!;
}

/** Preserve the original day where possible, including February 29 → February 28. */
function addMonths(start: CalendarDate, months: number): CalendarDate {
 const monthIndex = start.month - 1 + months;
 const year = start.year + Math.floor(monthIndex / 12), month = monthIndex % 12 + 1;
 return dateAt(year, month, Math.min(start.day, daysInMonth(year, month)));
}

/**
 * Service dates come from the original hire date, not the account creation date.
 * Calendar arithmetic avoids DST drift and inaccurate 365-day "years".
 * An unrecorded former-worker end date never implies continuing employment.
 */
export function employmentDates(input: EmploymentDateInput): EmploymentDateSummary {
 const start = parseDate(input.startDate), asOf = parseDate(input.asOf);
 const result: EmploymentDateSummary = {
  hireDate: start?.iso || null, tenureLabel: null, tenureThroughDate: null, completedYears: null,
  nextAnniversaryDate: null, nextAnniversaryLabel: null, anniversaryNote: null,
  isFutureStart: !!start && !!asOf && start.utc > asOf.utc,
 };
 if (!start || !asOf || result.isFutureStart) return result;

 const status = String(input.status || '').trim().toLowerCase();
 const current = ['active', 'onboarding', 'leave'].includes(status);
 const end = status === 'former' ? parseDate(input.endDate) || parseDate(input.separationDate) : current ? asOf : null;
 if (!end || end.utc < start.utc || end.utc > asOf.utc) return result;

 let months = (end.year - start.year) * 12 + end.month - start.month;
 if (addMonths(start, months).utc > end.utc) months--;
 const anchor = addMonths(start, months);
 const years = Math.floor(months / 12), remainingMonths = months % 12;
 const days = Math.round((end.utc - anchor.utc) / 86_400_000);
 result.tenureLabel = [[years, 'Year'], [remainingMonths, 'Month'], [days, 'Day']]
  .filter(([value]) => Number(value) > 0)
  .map(([value, unit]) => value + ' ' + unit + (Number(value) === 1 ? '' : 's'))
  .join(', ') || 'Less Than 1 Day';
 result.tenureThroughDate = end.iso;
 result.completedYears = years;

 if (current) {
  let year = Math.max(asOf.year, start.year + 1);
  if (year > 9999) return result;
  let anniversary = dateAt(year, start.month, Math.min(start.day, daysInMonth(year, start.month)));
  if (anniversary.utc < asOf.utc) {
   year++;
   if (year > 9999) return result;
   anniversary = dateAt(year, start.month, Math.min(start.day, daysInMonth(year, start.month)));
  }
  result.nextAnniversaryDate = anniversary.iso;
  result.nextAnniversaryLabel = (year - start.year) + '-Year Anniversary';
  if (start.month === 2 && start.day === 29 && anniversary.day === 28) {
   result.anniversaryNote = 'February 29 Hire Date · February 28 in Non-Leap Years';
  }
 }
 return result;
}
