import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { access } from '@/lib/accounts/policy';
import { canAccess } from '@/lib/finance/access';
import { isDispatchNote } from '@/lib/accounts/dispatch-notes';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

function canModify(viewer: { person: string; role: string; owner: boolean }, note: Row) {
  // Creator can edit their own note; Operations Director / Owner can edit any
  return note.authorId === viewer.person || viewer.owner || viewer.role === 'Department Head';
}

// PATCH /api/accounts/[id]/dispatch-notes/[note_id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; note_id: string }> }
) {
  try {
    const { id, note_id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    if (!access(viewer, 'accounts', true) && !canAccess(viewer, 'Accounts')) throw new ForbiddenError();

    const note = all.find(r => isDispatchNote(r) && r.id === note_id && r.accountId === id);
    if (!note) return json({ error: 'Note not found', status: 404 }, 404);
    if (!canModify(viewer, note)) throw new ForbiddenError();

    const body = await readPayload(request);
    const { content, is_urgent } = body as { content?: string; is_urgent?: boolean };

    const next = { ...note };
    if (content !== undefined) { next.details = String(content); next.name = String(content).slice(0, 200); }
    if (is_urgent !== undefined) next.priority = is_urgent ? 'Urgent' : 'Normal';

    const [saved] = await writeMany([{ old: note, next }], viewer, 'Updated dispatch note');
    return json({ dispatch_note: saved });
  } catch (e) {
    const f = safeFailure(e, 'dispatch-notes.update');
    return json(f.body, f.status);
  }
}

// DELETE /api/accounts/[id]/dispatch-notes/[note_id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; note_id: string }> }
) {
  try {
    const { id, note_id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    if (!access(viewer, 'accounts', true) && !canAccess(viewer, 'Accounts')) throw new ForbiddenError();

    const note = all.find(r => isDispatchNote(r) && r.id === note_id && r.accountId === id);
    if (!note) return json({ error: 'Note not found', status: 404 }, 404);
    if (!canModify(viewer, note)) throw new ForbiddenError();

    // Soft-delete: mark as resolved/archived
    await writeMany(
      [{ old: note, next: { ...note, status: 'Resolved', resolvedBy: viewer.person, resolvedAt: new Date().toISOString() } }],
      viewer,
      'Removed dispatch note'
    );

    return json({ deleted: true });
  } catch (e) {
    const f = safeFailure(e, 'dispatch-notes.delete');
    return json(f.body, f.status);
  }
}
