import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist, visible } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import { today } from '@/lib/finance/model';
import type { FinRecord } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError)
    return response({ error: e.message, signInUrl: '/signin-with-chatgpt?return_to=/' }, e.status);
  const f = safeFailure(e, 'timeclock.request');
  return response(f.body, f.status);
};

// GET /api/finance/timeclock?week=&employee_id=&status=
export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!canAccess(viewer, 'Timeclock') && !canAccess(viewer, 'Finance')) {
      throw new FinanceAccessError('Timeclock access is not assigned to your account.', 403);
    }

    const { searchParams } = request.nextUrl;
    const employeeId = searchParams.get('employee_id');
    const status     = searchParams.get('status'); // pending | approved | all

    // Get all time entries visible to this viewer
    const visible_records = visible(viewer, records, 'timeclock');

    // Clock records (active) and derived time entries
    const clocks = visible_records.filter(r => r.kind === 'clock');
    const times  = visible_records.filter(r => r.kind === 'time');

    // People map for name lookup
    const people = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));

    const toEntry = (r: FinRecord) => ({
      id:            r.id,
      employee_id:   r.person,
      employee_name: people.get(String(r.person))?.name || r.person,
      date:          r.date || (r.startedAt ? String(r.startedAt).split('T')[0] : ''),
      started_at:    r.startedAt ? String(r.startedAt) : undefined,
      clock_in:      r.startedAt ? new Date(String(r.startedAt)).toTimeString().slice(0,5) : undefined,
      clock_out:     r.stoppedAt ? new Date(String(r.stoppedAt)).toTimeString().slice(0,5) : undefined,
      on_break:      r.kind === 'clock' ? ((r.breaks || []) as Record<string, unknown>[]).some(b => !b.end) : false,
      hours:         r.hours ?? 0,
      break_hours:   r.breakHours ?? 0,
      billable_hours:r.hours ?? 0,
      notes:         r.notes ?? '',
      status:        r.status ?? 'pending',
      approved_by:   r.approvedBy,
      approved_at:   r.approvedAt,
      is_overtime:   (Number(r.hours) || 0) > 8,
      created_at:    String(r.createdAt ?? r.updatedAt ?? ''),
    });

    let entries = [...clocks, ...times].map(toEntry);

    if (employeeId) entries = entries.filter(e => e.employee_id === employeeId);
    if (status === 'pending')  entries = entries.filter(e => e.status !== 'Approved');
    if (status === 'approved') entries = entries.filter(e => e.status === 'Approved');

    // Week summary
    const total_hours    = entries.reduce((s, e) => s + (Number(e.hours) || 0), 0);
    const overtime_hours = entries.filter(e => e.is_overtime).reduce((s, e) => s + (Number(e.hours) || 0) - 8, 0);

    return response({
      time_entries: entries,
      week_summary: {
        total_hours:    Math.round(total_hours * 100) / 100,
        billable_hours: Math.round(total_hours * 100) / 100,
        overtime_hours: Math.round(overtime_hours * 100) / 100,
        status:         entries.some(e => e.status !== 'Approved') ? 'pending' : 'approved',
      },
    });
  } catch (e) {
    return failure(e);
  }
}

// POST /api/finance/timeclock — clock in or out
export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!canAccess(viewer, 'Timeclock', undefined, true)) {
      throw new FinanceAccessError('Timeclock access is not assigned to your account.', 403);
    }

    const body = await readPayload(request);
    const {
      employee_id = viewer.person,
      action,
      timestamp,
      notes = '',
    } = body as {
      employee_id?: string;
      action?: string;
      timestamp?: string;
      notes?: string;
    };

    const targetPerson = String(employee_id);
    const isSelf = targetPerson === viewer.person;
    const canManage = canAccess(viewer, 'Finance', 'Payroll', true) || viewer.canManage;

    if (!isSelf && !canManage) {
      throw new ForbiddenError('You can only clock in/out for yourself.');
    }

    const at = timestamp ? new Date(timestamp) : new Date();
    const activeId = `clock-active:${targetPerson}`;
    const active   = records.find(r => r.id === activeId && r.kind === 'clock');

    if (action === 'clock_in') {
      if (active && active.status === 'Active') {
        throw new AppError('Already clocked in');
      }

      const clock: FinRecord = {
        id:        activeId,
        kind:      'clock',
        version:   0,
        person:    targetPerson,
        startedAt: at.toISOString(),
        status:    'Active',
        notes:     String(notes),
        breaks:    [],
      };

      await persist(undefined, clock, viewer, `Clocked in at ${at.toISOString()}`);

      const people = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));
      const empName = people.get(targetPerson)?.name || targetPerson;

      return response({
        time_entry: {
          id:            clock.id,
          employee_id:   targetPerson,
          employee_name: empName,
          clock_in:      at.toISOString(),
          status:        'pending',
        },
        message: `Clocked in at ${at.toTimeString().slice(0,5)}`,
      }, 201);
    }

    if (action === 'clock_out') {
      if (!active || active.status !== 'Active') {
        throw new AppError('Not clocked in');
      }

      const stopped = {
        ...active,
        stoppedAt: at.toISOString(),
        status:    'Stopped',
      };

      await persist(active, stopped as FinRecord, viewer, `Clocked out at ${at.toISOString()}`);

      const startMs  = Date.parse(String(active.startedAt));
      const hours    = Math.round((at.getTime() - startMs) / 360000) / 10;
      const people   = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));
      const empName  = people.get(targetPerson)?.name || targetPerson;

      return response({
        time_entry: {
          id:            active.id,
          employee_id:   targetPerson,
          employee_name: empName,
          clock_in:      active.startedAt,
          clock_out:     at.toISOString(),
          hours,
          status:        'pending',
        },
        message: `Clocked out. ${hours.toFixed(1)} hours logged.`,
      });
    }

    throw new AppError('action must be "clock_in" or "clock_out"');
  } catch (e) {
    return failure(e);
  }
}
