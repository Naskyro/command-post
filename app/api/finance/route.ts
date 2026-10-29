import { visibleOvertime } from '@/lib/finance/overtime';
import { validatePayrollPolicy, type PayrollPolicy } from '@/lib/finance/payroll-calendar';
import { today } from '@/lib/finance/model';
import { safePersonHistory } from '@/lib/people/policy';
import { safeFailure, readPayload } from '@/lib/shared/errors';
import { billAction } from '@/lib/finance/bills';
import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, visible, persist, validate, runSnapshot } from '@/lib/finance/server';
import { sourceDates, sourceTransactions } from '@/lib/finance/seed';
import { financeDb } from '@/db/finance';
import { FinRecord, workweek } from '@/lib/finance/model';
import { clockSegments, coverageGaps, localInstant, managesPerson } from '@/lib/finance/timeclock';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { if (e instanceof FinanceAccessError)
    return response({ error: e.message, signInUrl: e.status === 401 ? '/signin-with-chatgpt?return_to=/' : undefined }, e.status); const f = safeFailure(e, 'finance.request'); return response(f.body, f.status); };
export async function GET(request: NextRequest) { try {
    const records = await allRecords(), viewer = identify(records, request.headers);
    if (request.nextUrl.searchParams.get('surface') === 'slack') {
        if (!canAccess(viewer, 'Slack'))
            throw new FinanceAccessError('Slack access is not assigned.', 403);
        return response({ viewer, records: [{ id: 'company', kind: 'settings', version: 0, slackUrl: records.find(r => r.id === 'company')?.slackUrl || '' }], transactions: [], ...sourceDates });
    }
    if (!canAccess(viewer, 'Finance') && !canAccess(viewer, 'Timeclock'))
        throw new FinanceAccessError('This module is not assigned to your account.', 403);
    const history = request.nextUrl.searchParams.get('history');
    if (history) {
        if (!visible(viewer, records).some(r => r.id === history) && !(viewer.canManage && sourceTransactions.some(r => r.id === history)))
            return response({ error: 'Access denied' }, 403);
        const audit = await financeDb().prepare('SELECT * FROM finance_audit WHERE record_id=? ORDER BY at DESC LIMIT 100').bind(history).all();
        return response({ history: records.find(r => r.id === history)?.kind === 'person' ? safePersonHistory(audit.results as Record<string, string>[], viewer, records, 'finance') : audit.results });
    }
    return response({ overtime: request.nextUrl.searchParams.get('surface') === 'timeclock' ? visibleOvertime(viewer, records) : undefined, records: visible(viewer, records, request.nextUrl.searchParams.get('surface') === 'timeclock' ? 'timeclock' : 'finance'), transactions: ['Overview', 'Outflows', 'Reports & Taxes'].some(t => canAccess(viewer, 'Finance', t)) && request.nextUrl.searchParams.get('surface') !== 'timeclock' ? [...sourceTransactions.map(t => records.find(r => r.kind === 'transaction' && r.id === t.id) || t), ...records.filter(r => r.kind === 'transaction' && !sourceTransactions.some(t => t.id === r.id))] : [], viewer, ...sourceDates });
}
catch (e) {
    return failure(e);
} }
export async function POST(request: NextRequest) {
    try {
        if (request.headers.get('sec-fetch-site') === 'cross-site')
            return response({ error: 'Cross-site request rejected' }, 403);
        const body = await readPayload(request);
        const records = await allRecords(), viewer = identify(records, request.headers);
        if (body.action === 'savePayrollCalendar') {
            if (!viewer.owner || !canAccess(viewer, 'Finance', 'Settings', true))
                throw new Error('Only owners can change the payroll calendar.');
            const old = records.find(r => r.id === 'company')!;
            if (old.version !== body.version)
                throw new Error('The calendar changed. Refresh before saving.');
            if (!body.policy || typeof body.policy !== 'object' || Array.isArray(body.policy))
                throw new Error('Choose valid calendar settings.');
            const policy = body.policy as PayrollPolicy;
            validatePayrollPolicy(policy, old, records, today());
            if (!String(body.reason || '').trim())
                throw new Error('Enter the reason for this change.');
            return response({ record: await persist(old, { ...old, payrollPolicies: [...(old.payrollPolicies || []) as Record<string, unknown>[], { ...policy, changedBy: viewer.name, changedAt: new Date().toISOString() }] }, viewer, String(body.reason)) });
        }
        if (['approveBill', 'recordBillPayment'].includes(String(body.action))) {
            const old = records.find(r => r.id === body.id && r.kind === 'bill');
            if (!old)
                throw new Error('Bill not found.');
            if (old.version !== body.version)
                throw new Error('This bill changed. Reload it before continuing.');
            const next = billAction(old, String(body.action), body, viewer);
            return response({ record: await persist(old, next, viewer, body.action === 'approveBill' ? 'Approved bill payment' : 'Recorded bill payment') });
        }
        if (['clockIn', 'clockOut', 'breakStart', 'breakEnd'].includes(String(body.action))) {
            if (!canAccess(viewer, 'Timeclock', 'Today', true))
                throw new Error('Clock actions are not assigned to your account.');
            const person = viewer.canManage ? String(body.person || viewer.person) : viewer.person;
            if (person !== viewer.person && !String(body.reason || '').trim())
                throw new Error('Explain why you are recording time for this worker.');
            if (!records.some(r => r.kind === 'person' && r.id === person && r.status === 'Active'))
                throw new Error('Select an active worker.');
            const active = records.find(r => r.kind === 'clock' && r.person === person && r.status === 'Running');
            const now = new Date();
            if (['clockIn', 'clockOut'].includes(String(body.action))) {
                const recent = records.filter(r => r.kind === 'clock' && r.person === person).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
                if (recent && (now.getTime() - Date.parse(String(recent.updatedAt))) < 60000)
                    throw new Error('Wait one minute between clock in / out actions.');
            }
            if (body.action === 'clockIn') {
                if (active)
                    throw new Error('This person is already clocked in.');
                const day = new Date().toISOString();
                const slot = records.find(r => r.id === 'clock-active:' + person);
                if (slot && slot.status === 'Running')
                    throw new Error('Already clocked in.');
                return response({ record: await persist(slot, { id: 'clock-active:' + person, kind: 'clock', version: slot?.version || 0, person, status: 'Running', startedAt: day, breaks: [] }, viewer, String(body.reason || 'Clocked in')) });
            }
            if (!active)
                throw new Error('No open timeclock entry found.');
            const breaks = (active.breaks || []) as Record<string, unknown>[];
            const openBreak = breaks.find(b => !b.end);
            if (body.action === 'breakStart') {
                if (openBreak)
                    throw new Error('A break is already running.');
                const unpaid = body.unpaid === true;
                return response({ record: await persist(active, { ...active, breaks: [...breaks, { start: now.toISOString(), paid: !unpaid, unpaid, dutyFree: body.dutyFree === true }] }, viewer, unpaid ? 'Started meal break' : 'Started paid break') });
            }
            if (body.action === 'breakEnd') {
                if (!openBreak)
                    throw new Error('No break is running.');
                return response({ record: await persist(active, { ...active, breaks: breaks.map(b => b.end ? b : { ...b, end: now.toISOString() }) }, viewer, 'Ended break') });
            }
            const next = { ...active, status: 'Stopped', stoppedAt: now.toISOString(), breaks: breaks.map(b => b.end ? b : { ...b, end: now.toISOString() }) };
            return response({ record: await persist(active, { ...next, segments: clockSegments(next) }, viewer, String(body.reason || 'Clocked out; hours sent for payroll review')) });
        }
        if (body.action === 'publishSchedule') {
            if (!canAccess(viewer, 'Timeclock', 'Schedule', true))
                throw new Error('Schedule editing is not assigned to your account.');
            const start = String(body.start), period = workweek(start, records.find(r => r.id === 'company'));
            if (start !== period.start)
                throw new Error('Choose the first day of the configured workweek.');
            const end = new Date(start + 'T12:00:00Z');
            end.setUTCDate(end.getUTCDate() + 7);
            const endDay = end.toISOString().slice(0, 10);
            const shifts = records.filter(r => r.kind === 'shift' && r.status === 'Draft' && (viewer.owner || managesPerson(viewer, String(r.person), records)) && (!body.department || body.department === 'All' || r.department === body.department) && localInstant(r.start) < localInstant(endDay + 'T00:00') && localInstant(r.end) > localInstant(start + 'T00:00'));
            if (!shifts.length)
                throw new Error('No draft shifts to publish.');
            if (shifts.some(r => !r.person || !managesPerson(viewer, String(r.person), records)))
                throw new Error('Assign every shift and ask a manager with access to this schedule to publish it.');
            const publishedDepartments = new Set(shifts.map(r => String(r.department)));
            const gaps = coverageGaps(records, start, endDay).filter(g => publishedDepartments.has(g.role === 'Dispatcher' ? 'Dispatch' : 'Drivers'));
            if (gaps.length)
                throw new Error('Cover all dispatcher and driver gaps before publishing this week.');
            const db = financeDb(), at = new Date().toISOString();
            const statements = [];
            for (const old of shifts) {
                const next = { ...old, status: 'Published', version: old.version + 1, updatedAt: at, updatedBy: viewer.name }, audit = crypto.randomUUID();
                statements.push(old.version ? db.prepare('UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(next), next.version, viewer.name, at, next.id, old.version) : db.prepare('INSERT OR IGNORE INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(next.id, next.kind, JSON.stringify(next), next.version, viewer.name, at));
                // NOT NULL constraint aborts the whole batch if any version changed.
                statements.push(db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,CASE WHEN changes()=1 THEN ? ELSE NULL END,?,?,?,?,?,?)').bind(audit, next.id, viewer.name, viewer.id, at, 'Published weekly schedule', JSON.stringify(old), JSON.stringify(next)));
            }
            await db.batch(statements);
            return response({ published: shifts.length });
        }
        if (body.action === 'submitWeek' || body.action === 'approveWeek') {
            if (!canAccess(viewer, 'Timeclock'))
                throw new Error('Timeclock access is not assigned to your account.');
            const personId = String(body.person);
            const start = String(body.week), period = workweek(start, records.find(r => r.id === 'company'));
            if (start !== period.start)
                throw new Error('Choose the first day of the configured workweek.');
            if (personId !== viewer.person && !managesPerson(viewer, personId, records))
                throw new Error('You can only submit or approve your own timesheet or a worker you manage.');
            const isSubmit = body.action === 'submitWeek';
            const targets = records.filter(r => r.kind === 'time' && r.person === personId && String(r.date) >= period.start && String(r.date) <= period.end && r.status !== 'Voided' && r.status !== 'Approved' && !(isSubmit && r.status === 'Submitted'));
            const nextStatus = isSubmit ? 'Submitted' : 'Approved';
            for (const old of targets) {
                const next = { ...old, status: nextStatus };
                await persist(old, next as FinRecord, viewer, `${nextStatus} timesheet for ${start}`);
            }
            return response({ updated: targets.length });
        }
        if (body.action === 'reviewPayroll' || body.action === 'releasePayroll') {
            if (!viewer.canRelease || !canAccess(viewer, 'Finance', 'Payroll', true))
                throw new Error('Only owners and the assigned Operations Department Head can release payroll.');
            const old = records.find(r => r.id === body.id);
            if (old && old.version !== body.version)
                throw new Error('Payroll changed. Reload and review again.');
            if (old?.status === 'Released')
                throw new Error('Payroll already released. Create an adjustment run.');
            const start = String(body.start), end = String(body.end), people = body.people as string[];
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !Array.isArray(people) || !people.length)
                throw new Error('Choose a pay period and at least one worker.');
            const calendar = workweek(start, records.find(r => r.id === 'company'));
            if (calendar.start !== start || calendar.end !== end)
                throw new Error('Payroll must match the configured workweek.');
            if (String(body.payday) !== calendar.payday)
                throw new Error('Payday does not match the payroll calendar.');
            if (records.some(r => r.kind === 'payrun' && r.status === 'Released' && String(r.period) <= end && String(r.periodEnd) >= start && ((r.people || []) as string[]).some(p => people.includes(p))))
                throw new Error('This period was already released for one or more selected workers. Record a linked correction instead of paying the same period again.');
            const lines = runSnapshot(records, start, end, people);
            if (lines.some(l => l.issues.length))
                throw new Error('Resolve every payroll review item before approving this run.');
            const snapshot = JSON.stringify(lines);
            if (body.action === 'releasePayroll' && (!old || old.status !== 'Approved' || JSON.stringify(old.lines) !== snapshot))
                throw new Error('The payroll calculation changed. Review and approve the updated run first.');
            const next = { id: body.id || crypto.randomUUID(), kind: 'payrun', version: old?.version || 0, name: body.name || `Payroll ${start}`, date: body.payday, period: start, periodEnd: end, status: body.action === 'releasePayroll' ? 'Released' : 'Approved', lines, people, approvalBy: viewer.name, approvalAt: new Date().toISOString() } as unknown as FinRecord;
            return response({ record: await persist(old, next, viewer, body.action === 'releasePayroll' ? 'Released for payment; no bank transfer sent' : 'Reviewed exact payroll calculation') });
        }
        const next = body.record as FinRecord;
        if (!next || typeof next.id !== 'string' || typeof next.kind !== 'string')
            throw new Error('Invalid record.');
        const old = records.find(r => r.id === next.id) || sourceTransactions.find(r => r.id === next.id);
        if (old && old.version !== next.version)
            throw new Error('Someone changed this record. Reload before saving.');
        if (old && !String(body.reason || '').trim())
            throw new Error('Add a reason for this change.');
        validate(next, old, viewer, records);
        return response({ record: await persist(old, next, viewer, String(body.reason || 'Created record')) });
    }
    catch (e) {
        return failure(e);
    }
}
