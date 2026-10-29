import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import { num } from '@/lib/finance/model';
import type { FinRecord } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError)
    return response({ error: e.message }, e.status);
  const f = safeFailure(e, 'payroll.request');
  return response(f.body, f.status);
};

function payrollAccess(viewer: Parameters<typeof canAccess>[0], edit = false) {
  if (!viewer) return false;
  return canAccess(viewer, 'Finance', 'Payroll', edit) || viewer.canManage;
}

// GET /api/finance/payroll?status=&period=
export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!payrollAccess(viewer)) throw new FinanceAccessError('Payroll access is not assigned.', 403);

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const period = searchParams.get('period');

    let runs = records.filter(r => r.kind === 'payrun');

    if (status && status !== 'all') runs = runs.filter(r => String(r.status).toLowerCase() === status.toLowerCase());
    if (period) runs = runs.filter(r => String(r.period || '').startsWith(period));

    return response({ payroll_runs: runs });
  } catch (e) {
    return failure(e);
  }
}

// POST /api/finance/payroll — create a payroll run
export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!payrollAccess(viewer, true)) throw new FinanceAccessError('Payroll edit access required.', 403);

    const body = await readPayload(request);
    const { period_start, period_end, employees = [], auto_calculate = true } = body as {
      period_start?: string; period_end?: string;
      employees?: string[]; auto_calculate?: boolean;
    };

    if (!period_start || !period_end) throw new AppError('period_start and period_end are required');

    const people = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));
    const targetIds = employees.length ? employees : [...people.keys()].filter(id => {
      const p = people.get(id)!;
      return p.status === 'Active';
    });

    // Gather approved time entries for the period
    const timeEntries = records.filter(r =>
      r.kind === 'time' &&
      targetIds.includes(String(r.person)) &&
      r.status === 'Approved' &&
      String(r.date || '') >= period_start &&
      String(r.date || '') <= period_end
    );

    // Build line items
    const lineItems = targetIds.map(personId => {
      const person  = people.get(personId);
      const entries = timeEntries.filter(r => r.person === personId);
      const hours   = entries.reduce((s, r) => s + num(r.hours), 0);
      const rate    = num(person?.rate);
      const ot      = Math.max(0, hours - 40);
      const gross   = (40 * rate) + (ot * rate * 1.5);
      const taxRate = num(person?.taxRate ?? 0.12);
      const taxes   = gross * taxRate;
      return {
        id:            crypto.randomUUID(),
        kind:          'earning',
        version:       0,
        person:        personId,
        employee_name: String(person?.name || personId),
        hours:         Math.round(hours * 100) / 100,
        hourly_rate:   rate,
        gross_pay:     Math.round(gross * 100) / 100,
        taxes:         Math.round(taxes * 100) / 100,
        net_pay:       Math.round((gross - taxes) * 100) / 100,
        status:        'Pending',
      };
    });

    const totalGross = lineItems.reduce((s, l) => s + num(l.gross_pay), 0);
    const totalTaxes = lineItems.reduce((s, l) => s + num(l.taxes), 0);
    const totalNet   = lineItems.reduce((s, l) => s + num(l.net_pay), 0);

    const runId = `payrun:${period_start}:${period_end}`;
    const run: FinRecord = {
      id:             runId,
      kind:           'payrun',
      version:        0,
      period:         period_start,
      periodEnd:      period_end,
      status:         'Pending',
      employee_count: targetIds.length,
      total_gross:    Math.round(totalGross * 100) / 100,
      total_taxes:    Math.round(totalTaxes * 100) / 100,
      total_net:      Math.round(totalNet * 100) / 100,
      lines:          lineItems,
      createdBy:      viewer.person,
      createdAt:      new Date().toISOString(),
    };

    await persist(undefined, run, viewer, `Created payroll run for ${period_start} to ${period_end}`);

    return response({ payroll_run: run, line_items: lineItems }, 201);
  } catch (e) {
    return failure(e);
  }
}

// PATCH /api/finance/payroll — approve, reject, or mark paid
// (PATCH on collection route since run_id is in the body)
export async function PATCH(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!payrollAccess(viewer, true)) throw new FinanceAccessError('Payroll edit access required.', 403);

    const body = await readPayload(request);
    const { run_id, action, notes } = body as { run_id?: string; action?: string; notes?: string };

    const run = records.find(r => r.kind === 'payrun' && r.id === run_id);
    if (!run) return response({ error: 'Payroll run not found' }, 404);

    const now = new Date().toISOString();
    let next: FinRecord;
    let reason: string;

    if (action === 'approve') {
      next   = { ...run, status: 'Approved', approvedBy: viewer.person, approvedAt: now, notes: notes || '' };
      reason = 'Approved payroll run';
    } else if (action === 'reject') {
      if (!viewer.owner && viewer.role !== 'Department Head') throw new ForbiddenError();
      next   = { ...run, status: 'Pending', rejectedBy: viewer.person, rejectionReason: notes || '' };
      reason = 'Rejected payroll run';
    } else if (action === 'mark_paid') {
      if (!viewer.owner && viewer.role !== 'Department Head') throw new ForbiddenError();
      next   = { ...run, status: 'Paid', paidAt: now, paidBy: viewer.person };
      reason = 'Marked payroll as paid';
    } else {
      throw new AppError('action must be "approve", "reject", or "mark_paid"');
    }

    await persist(run, next, viewer, reason);
    return response({ payroll_run: next });
  } catch (e) {
    return failure(e);
  }
}
