import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { FinRecord } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError)
    return response({ error: e.message }, e.status);
  const f = safeFailure(e, 'timeclock.entry');
  return response(f.body, f.status);
};

function canManageEntry(viewer: { person: string; canManage: boolean; role: string }, entry: FinRecord) {
  return viewer.canManage || viewer.role === 'Department Head' ||
         canAccess(viewer as never, 'Finance', 'Payroll', true) ||
         entry.person === viewer.person;
}

// PATCH /api/finance/timeclock/[entry_id] — approve, reject, or edit
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entry_id: string }> }
) {
  try {
    const { entry_id } = await params;
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!canAccess(viewer, 'Timeclock') && !canAccess(viewer, 'Finance')) {
      throw new FinanceAccessError('Access denied.', 403);
    }

    const entry = records.find(r =>
      (r.kind === 'time' || r.kind === 'clock' || r.kind === 'timeCorrection') && r.id === entry_id
    );
    if (!entry) return response({ error: 'Entry not found' }, 404);

    const isSelf  = entry.person === viewer.person;
    const isAdmin = canManageEntry(viewer, entry);
    if (!isSelf && !isAdmin) throw new ForbiddenError();

    const body = await readPayload(request);
    const { action, clock_in, clock_out, break_hours, notes, reason_for_change } = body as {
      action?: string; clock_in?: string; clock_out?: string;
      break_hours?: number; notes?: string; reason_for_change?: string;
    };

    const now = new Date().toISOString();
    let next: FinRecord;
    let reason: string;

    if (action === 'approve') {
      if (!isAdmin) throw new ForbiddenError('Only managers can approve time entries.');
      next   = { ...entry, status: 'Approved', approvedBy: viewer.person, approvedAt: now };
      reason = 'Approved time entry';
    } else if (action === 'reject') {
      if (!isAdmin) throw new ForbiddenError('Only managers can reject time entries.');
      next   = { ...entry, status: 'Rejected', rejectedBy: viewer.person, rejectedAt: now, rejectionReason: reason_for_change || '' };
      reason = 'Rejected time entry';
    } else if (action === 'edit') {
      // Employee can edit own pending entries; managers can edit any
      if (!isSelf && !isAdmin) throw new ForbiddenError();
      if (entry.status === 'Approved' && !isAdmin) throw new ForbiddenError('Cannot edit an approved entry.');
      next = { ...entry };
      if (clock_in    !== undefined) next.startedAt  = clock_in;
      if (clock_out   !== undefined) next.stoppedAt  = clock_out;
      if (break_hours !== undefined) next.breakHours = break_hours;
      if (notes       !== undefined) next.notes      = notes;
      next.status  = 'Draft'; // back to pending after edit
      reason = `Edited time entry${reason_for_change ? ': ' + reason_for_change : ''}`;
    } else {
      throw new AppError('action must be "approve", "reject", or "edit"');
    }

    await persist(entry, next, viewer, reason);
    return response({ time_entry: next });
  } catch (e) {
    return failure(e);
  }
}

// DELETE /api/finance/timeclock/[entry_id] — delete pending entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entry_id: string }> }
) {
  try {
    const { entry_id } = await params;
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!canAccess(viewer, 'Timeclock') && !canAccess(viewer, 'Finance')) {
      throw new FinanceAccessError('Access denied.', 403);
    }

    const entry = records.find(r =>
      (r.kind === 'time' || r.kind === 'clock') && r.id === entry_id
    );
    if (!entry) return response({ error: 'Entry not found' }, 404);

    const isSelf  = entry.person === viewer.person;
    const isAdmin = canManageEntry(viewer, entry);
    if (!isSelf && !isAdmin) throw new ForbiddenError();
    if (entry.status === 'Approved') throw new AppError('Cannot delete an approved entry.');

    // Soft-delete: mark as Voided
    await persist(entry, { ...entry, status: 'Voided' }, viewer, 'Deleted time entry');
    return response({ deleted: true });
  } catch (e) {
    return failure(e);
  }
}
