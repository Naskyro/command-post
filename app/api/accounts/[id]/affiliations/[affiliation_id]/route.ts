import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// PATCH /api/accounts/[id]/affiliations/[affiliation_id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; affiliation_id: string }> }
) {
  try {
    const { id, affiliation_id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    if (!access(viewer, 'relationships', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const affiliation = all.find(r => r.kind === 'affiliation' && r.id === affiliation_id && r.accountId === id);
    if (!affiliation) return json({ error: 'Affiliation not found', status: 404 }, 404);

    const body = await readPayload(request);
    const { role, start_date, end_date } = body as {
      role?: string; start_date?: string; end_date?: string;
    };

    const next = { ...affiliation };
    if (role       !== undefined) { next.role = String(role); next.name = String(role); }
    if (start_date !== undefined) next.startDate = String(start_date);
    if (end_date   !== undefined) next.endDate = String(end_date);

    const [saved] = await writeMany([{ old: affiliation, next }], viewer, `Updated affiliation: ${affiliation.name}`);
    return json({ affiliation: saved });
  } catch (e) {
    const f = safeFailure(e, 'affiliations.update');
    return json(f.body, f.status);
  }
}

// DELETE /api/accounts/[id]/affiliations/[affiliation_id]
// Soft-delete by setting end_date (preserves history)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; affiliation_id: string }> }
) {
  try {
    const { id, affiliation_id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    if (!access(viewer, 'relationships', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const affiliation = all.find(r => r.kind === 'affiliation' && r.id === affiliation_id && r.accountId === id);
    if (!affiliation) return json({ error: 'Affiliation not found', status: 404 }, 404);

    // Soft-delete: set end_date to today
    const today = new Date().toISOString().split('T')[0];
    await writeMany(
      [{ old: affiliation, next: { ...affiliation, endDate: today } }],
      viewer,
      `Ended affiliation: ${affiliation.name}`
    );

    return json({ deleted: true });
  } catch (e) {
    const f = safeFailure(e, 'affiliations.delete');
    return json(f.body, f.status);
  }
}
