import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { financeDb } from '@/db/finance';
import { canAccess, grantsFor } from '@/lib/finance/access';
import { managesPerson } from '@/lib/finance/timeclock';
import type { FinRecord } from '@/lib/finance/model';
import { profileFields, payFields, accessFields, personView, pickPerson, canReadPay, canEditAccess, boundedGrants, validateRole, sanitizeFields, validateProfile, safePersonHistory } from '@/lib/people/policy';
import { AppError, ForbiddenError, ConflictError, readPayload, safeFailure } from '@/lib/shared/errors';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(request: NextRequest) {
    try {
        const records = await allRecords(), v = identify(records, request.headers), surface = request.nextUrl.searchParams.get('surface') || 'hr';
        if (surface === 'admin' ? !canAccess(v, 'Admin') : !canAccess(v, 'People & HR') && !canAccess(v, 'Finance', 'Payroll'))
            throw new ForbiddenError();
        const people = records.filter(r => r.kind === 'person' && (surface === 'admin' || v.owner || surface === 'finance' && v.canRelease || r.id === v.person || managesPerson(v, r.id, records)));
        const historyId = request.nextUrl.searchParams.get('history');
        if (historyId) {
            const person = people.find(r => r.id === historyId);
            if (!person)
                throw new ForbiddenError();
            const audit = await financeDb().prepare('SELECT id,actor,at,reason,before,after FROM finance_audit WHERE record_id=? ORDER BY at DESC LIMIT 100').bind(historyId).all<Record<string, string>>();
            return json({ history: safePersonHistory(audit.results, v, records, surface) });
        }
        return json({ viewer: v, records: [...people.map(p => personView(p, v, records, surface)), ...records.filter(r => r.kind === 'department')], supervisors: records.filter(r => r.kind === 'person' && (v.owner || r.id === v.person || managesPerson(v, r.id, records))).map(p => pickPerson(p, ['name', 'title', 'department', 'status', 'supervisor'])) });
    }
    catch (e) {
        const f = safeFailure(e, 'people.read');
        return json(f.body, f.status);
    }
}
export async function POST(request: NextRequest) {
    try {
        const body = await readPayload(request), records = await allRecords(), v = identify(records, request.headers), action = String(body.action || ''), id = String(body.id || '');
        if (!/^[a-zA-Z0-9:_-]{1,150}$/.test(id))
            throw new AppError('Invalid person record.');
        const old = records.find(r => r.id === id && r.kind === (action === 'saveDepartment' ? 'department' : 'person'));
        if (old && old.version !== body.version)
            throw new ConflictError();
        if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields))
            throw new AppError('Submit the form fields.');
        const reason = String(body.reason || '').trim();
        if (old && !reason)
            throw new AppError('Enter the reason for this change.');
        const input = body.fields as Record<string, unknown>;
        let next: FinRecord;
        let surface = 'hr';
        if (action === 'saveDepartment') {
            if (!v.owner || !canAccess(v, 'Admin', 'departments', true))
                throw new ForbiddenError('Only an owner can assign Department Heads.');
            if (!old)
                throw new AppError('Department not found.', 404);
            const fields = sanitizeFields(input, ['head', 'backup', 'expires', 'coverageDays', 'coverageStart', 'coverageEnd']);
            for (const key of ['head', 'backup'])
                if (fields[key] && !records.some(r => r.kind === 'person' && r.id === fields[key] && r.status === 'Active'))
                    throw new AppError('Choose an active user.');
            if (fields.coverageDays && !/^([0-6],)*[0-6]$/.test(String(fields.coverageDays)))
                throw new AppError('Choose coverage days.');
            for (const k of ['coverageStart', 'coverageEnd'])
                if (fields[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(fields[k])))
                    throw new AppError('Enter valid coverage times.');
            for (const key of ['minimumDispatch', 'minimumDrivers'])
                if (fields[key] !== undefined && (!Number.isInteger(Number(fields[key])) || Number(fields[key]) < 0 || Number(fields[key]) > 50))
                    throw new AppError('Coverage must be a whole number between 0 and 50.');
            return json({ record: await persist(old, { ...old, ...fields }, v, reason) });
        }
        else if (action === 'createHire') {
            if (old)
                throw new ConflictError('This new hire was already saved. Refresh the directory.');
            if (!canAccess(v, 'People & HR', 'hiring', true))
                throw new ForbiddenError();
            const fields = sanitizeFields(input, [...profileFields, ...accessFields]);
            validateRole(fields.role || 'Employee', v, id);
            const access = boundedGrants(fields.access || [], v);
            next = { id, kind: 'person', version: 0, ...fields, role: fields.role || 'Employee', accessMode: 'Custom', access, status: 'Onboarding', accountStatus: 'Disabled', payType: 'Pending method', rate: 0, netTarget: 0, exempt: false, onboardingStatus: 'In progress' };
            validateProfile(next, undefined, v, records);
        }
        else {
            if (!old)
                throw new AppError('Person not found.', 404);
            if (action === 'saveAccess') {
                if (!canEditAccess(v, old, records))
                    throw new ForbiddenError('You can change access only for users in your reporting branch.');
                const fields = sanitizeFields(input, accessFields);
                validateRole(fields.role || old.role, v, id);
                const access = boundedGrants(fields.access || grantsFor(old), v);
                if (fields.accountStatus && !['Enabled', 'Disabled'].includes(String(fields.accountStatus)))
                    throw new AppError('Choose Enabled or Disabled.');
                if (old.role === 'Owner' && (fields.role !== 'Owner' || fields.accountStatus === 'Disabled'))
                    throw new ForbiddenError('Owner accounts must keep owner access.');
                if (fields.userId && records.some(r => r.kind === 'person' && r.id !== id && r.userId === fields.userId))
                    throw new AppError('That sign-in identity belongs to another user.');
                next = { ...old, ...fields, accessMode: 'Custom', access };
                surface = 'admin';
            }
            else if (action === 'savePay') {
                if (!(canAccess(v, 'Finance', 'Payroll', true) || canAccess(v, 'People & HR', 'pay', true)) || !canReadPay(v, old, records) || !v.owner && !v.canRelease && !managesPerson(v, id, records))
                    throw new ForbiddenError('Pay agreement editing is not assigned for this employee.');
                const fields = sanitizeFields(input, payFields);
                next = { ...old, ...fields };
                if (typeof next.exempt !== 'boolean')
                    throw new AppError('Choose the exemption status.');
                if (!['Hourly', 'Hourly + commission', 'Salary + commission', 'Salary exempt', 'Net salary', 'Per tow', 'Pending method', 'Owner payment'].includes(String(next.payType)))
                    throw new AppError('Choose a pay arrangement.');
                for (const k of ['rate', 'netTarget'])
                    if (typeof next[k] !== 'number' || !Number.isFinite(Number(next[k])) || Number(next[k]) < 0)
                        throw new AppError('Pay amounts must be zero or greater.');
                if (next.overtimeEstimateRate !== undefined && next.overtimeEstimateRate !== '' && (typeof next.overtimeEstimateRate !== 'number' || !Number.isFinite(next.overtimeEstimateRate) || next.overtimeEstimateRate < 0)) throw new AppError('Enter a valid verified overtime rate.');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.date || '')))
                    throw new AppError('Enter the agreement’s effective date.');
                surface = 'finance';
            }
            else if (action === 'saveProfile' || action === 'completeOnboarding') {
                if (!canAccess(v, 'People & HR', action === 'completeOnboarding' ? 'hiring' : 'people', true) || !v.owner && !managesPerson(v, id, records))
                    throw new ForbiddenError();
                next = { ...old, ...sanitizeFields(input, profileFields) };
                if (action === 'completeOnboarding') {
                    if (old.status !== 'Onboarding')
                        throw new AppError('This person is already onboarded.');
                    next.status = 'Active';
                    next.onboardingStatus = 'Complete';
                    next.accountStatus = 'Enabled';
                    next.onboardedBy = v.name;
                    next.onboardedAt = new Date().toISOString();
                }
                validateProfile(next, old, v, records);
            }
            else
                throw new AppError('Unknown people action.');
        }
        const saved = await persist(old, next, v, reason || 'Created new hire');
        return json({ record: personView(saved, v, [...records.filter(r => r.id !== id), saved], surface) });
    }
    catch (e) {
        const f = safeFailure(e, 'people.write');
        return json(f.body, f.status);
    }
}
