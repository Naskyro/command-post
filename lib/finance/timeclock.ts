import type { FinRecord, Viewer } from './model';
export const zone = 'America/Chicago';
const wallFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
export const localDate = (at: Date | string | number) => dateFormat.format(new Date(at));
export const hoursLabel = (hours: number) => `${Math.floor(Math.round(hours * 60) / 60)}h ${Math.round(hours * 60) % 60}m`;
export function localInstant(value: unknown): number {
    const s = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s))
        return NaN;
    const target = Date.parse(s + ':00Z');
    let result = target;
    const parts = wallFormat;
    for (let i = 0; i < 3; i++) {
        const wall = parts.format(new Date(result)).replace(' ', 'T');
        result += target - Date.parse(wall + ':00Z');
    }
    return parts.format(new Date(result)).replace(' ', 'T') === s ? result : NaN;
}
export function clockSegments(clock: FinRecord, until = Date.now()) {
    const start = Date.parse(String(clock.startedAt)), end = clock.stoppedAt ? Date.parse(String(clock.stoppedAt)) : until;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 31 * 86400000)
        return [];
    const unpaid = ((clock.breaks || []) as Record<string, unknown>[]).filter(b => b.unpaid === true && b.dutyFree === true && Date.parse(String(b.end || new Date(end).toISOString())) - Date.parse(String(b.start)) >= 30 * 60000);
    const portions: Record<string, number> = {};
    for (let t = start; t < end;) {
        const next = Math.min(end, Math.ceil((t + 1) / 60000) * 60000);
        let ms = next - t;
        for (const b of unpaid)
            ms -= Math.max(0, Math.min(next, Date.parse(String(b.end || new Date(end).toISOString()))) - Math.max(t, Date.parse(String(b.start))));
        const day = localDate(t);
        portions[day] = (portions[day] || 0) + Math.max(0, ms) / 3600000;
        t = next;
    }
    return Object.entries(portions).map(([date, hours]) => ({ date, hours }));
}
export function deriveTime(records: FinRecord[]): FinRecord[] {
    const result = new Map(records.map(r => [r.id, r]));
    for (const clock of records.filter(r => r.kind === 'clock' && r.status === 'Stopped' && !r.id.startsWith('clock-active:'))) {
        for (const s of clockSegments(clock)) {
            const id = clock.id + ':' + s.date;
            if (!result.has(id))
                result.set(id, { id, kind: 'time', version: 0, person: clock.person, ...s, status: 'Draft', source: 'Timeclock · ' + clock.id, clockStart: clock.startedAt, clockEnd: clock.stoppedAt });
        }
    }
    for (const c of records.filter(r => r.kind === 'timeCorrection' && r.status === 'Approved').sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))) {
        const id = String(c.timeId || 'correction:' + c.id);
        const previous = result.get(id);
        result.set(id, { ...previous, id, kind: 'time', version: previous?.version || 0, person: c.person, date: c.date, hours: c.hours, status: 'Approved', correctionId: c.id, source: 'Approved correction · ' + c.id, updatedAt: c.updatedAt, updatedBy: c.updatedBy });
    }
    return [...result.values()];
}
export const isExempt = (p: FinRecord) => p.workerType === 'Employee' && p.exempt === true && !String(p.payType).includes('Hourly');
export const overtimeEligible = (p: FinRecord) => p.workerType === 'Employee' && !isExempt(p);
export function managesPerson(v: Viewer, person: string, records: FinRecord[]): boolean {
    if (v.canManage)
        return true;
    if (v.person === person)
        return false;
    const department = records.find(r => r.kind === 'person' && r.id === person)?.department;
    if (records.some(r => r.kind === 'department' && r.name === department && (r.head === v.person || r.backup === v.person && String(r.expires) >= (localDate(Date.now())))))
        return true;
    if (!['Supervisor', 'Department Head'].includes(v.role))
        return false;
    const seen = new Set<string>();
    let current = person;
    while (current && !seen.has(current)) {
        seen.add(current);
        current = String(records.find(r => r.kind === 'person' && r.id === current)?.supervisor || '');
        if (current === v.person)
            return true;
    }
    return false;
}
export function leaveBalance(records: FinRecord[], person: string, type: string, asOf = localDate(Date.now())) {
    const credits = records.filter(r => r.kind === 'leaveCredit' && r.person === person && r.type === type && r.status === 'Approved' && String(r.date) <= asOf);
    const requests = records.filter(r => r.kind === 'leaveRequest' && r.person === person && r.type === type);
    const sum = (rows: FinRecord[]) => rows.reduce((n, r) => n + Number(r.hours || 0), 0);
    const used = sum(requests.filter(r => r.status === 'Approved' && String(r.date) <= asOf));
    const reserved = sum(requests.filter(r => r.status === 'Approved' && String(r.date) > asOf));
    return { known: credits.length > 0, credited: sum(credits), used, reserved, available: sum(credits) - used - reserved, pending: sum(requests.filter(r => r.status === 'Requested')) };
}
export function weekHours(records: FinRecord[], person: string, start: string, end: string, now = Date.now()) {
    const inWeek = (day: unknown) => String(day) >= start && String(day) <= end;
    const time = records.filter(r => r.kind === 'time' && r.person === person && inWeek(r.date) && !['Voided', 'Scheduled'].includes(String(r.status)));
    const active = records.find(r => r.kind === 'clock' && r.person === person && r.status === 'Running');
    const running = active ? clockSegments(active, now).filter(s => inWeek(s.date)).reduce((s, r) => s + r.hours, 0) : 0;
    const worked = time.reduce((s, r) => s + Number(r.hours || 0), 0) + running;
    const approved = time.filter(r => r.status === 'Approved').reduce((s, r) => s + Number(r.hours || 0), 0);
    // Remaining published shifts only; live clock time is already included in worked.
    const remaining = records.filter(r => r.kind === 'shift' && r.person === person && r.status === 'Published' && String(r.start).slice(0, 10) <= end && String(r.end).slice(0, 10) >= start).reduce((sum, r) => {
        const a = Math.max(localInstant(r.start), now), b = localInstant(r.end);
        if (!(b > a))
            return sum;
        return sum + clockSegments({ id: 'projection', kind: 'clock', version: 0, startedAt: new Date(a).toISOString(), stoppedAt: new Date(b).toISOString() }).filter(s => inWeek(s.date)).reduce((n, s) => n + s.hours, 0);
    }, 0);
    return { worked, approved, running, remaining, projected: worked + remaining, pending: time.filter(r => r.status !== 'Approved').length, active };
}
export function coverageGaps(records: FinRecord[], start: string, endExclusive: string) {
    const lower = localInstant(start + 'T00:00'), upper = localInstant(endExclusive + 'T00:00');
    const gaps: {
        role: string;
        start: number;
        end: number;
    }[] = [];
    for (const role of ['Dispatcher', 'Driver']) {
        const shifts = records.filter(r => r.kind === 'shift' && r.coverageRole === role && r.status !== 'Cancelled' && r.person && records.some(p => p.kind === 'person' && p.id === r.person && p.status === 'Active')).map(r => ({ start: Math.max(lower, localInstant(r.start)), end: Math.min(upper, localInstant(r.end)) })).filter(r => r.end > r.start).sort((a, b) => a.start - b.start);
        let cursor = lower;
        for (const s of shifts) {
            if (s.start > cursor)
                gaps.push({ role, start: cursor, end: s.start });
            cursor = Math.max(cursor, s.end);
        }
        if (cursor < upper)
            gaps.push({ role, start: cursor, end: upper });
    }
    return gaps;
}
export function departmentGaps(records: FinRecord[], start: string, endExclusive: string, department: string) {
    if (department === 'Dispatch' || department === 'Drivers')
        return coverageGaps(records, start, endExclusive).filter(g => g.role === (department === 'Dispatch' ? 'Dispatcher' : 'Driver'));
    const gaps: {
        role: string;
        start: number;
        end: number;
    }[] = [];
    const config = records.find(r => r.kind === 'department' && r.name === department);
    const days = String(config?.coverageDays || '1,2,3,4,5').split(',').map(Number);
    for (let ms = Date.parse(start + 'T12:00Z'); ms < Date.parse(endExclusive + 'T12:00Z'); ms += 86400000) {
        const day = new Date(ms);
        if (!days.includes(day.getUTCDay()))
            continue;
        const date = day.toISOString().slice(0, 10), a = localInstant(date + 'T' + String(config?.coverageStart || '09:00')), b = localInstant(date + 'T' + String(config?.coverageEnd || '17:00'));
        const assigned = records.filter(r => r.kind === 'shift' && r.department === department && r.person && r.status !== 'Cancelled').map(r => ({ start: Math.max(a, localInstant(r.start)), end: Math.min(b, localInstant(r.end)) })).filter(r => r.end > r.start).sort((x, y) => x.start - y.start);
        let cursor = a;
        for (const s of assigned) {
            if (s.start > cursor)
                gaps.push({ role: department, start: cursor, end: s.start });
            cursor = Math.max(cursor, s.end);
        }
        if (cursor < b)
            gaps.push({ role: department, start: cursor, end: b });
    }
    return gaps;
}
