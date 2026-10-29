import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { canAccess } from '@/lib/finance/access';
import { isDispatchNote } from '@/lib/accounts/dispatch-notes';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import { today } from '@/lib/accounts/model';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// GET /api/accounts/[id]/dispatch-notes — ordered by timestamp desc
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    // Both Account Management and Dispatch (Accounts) can view notes
    if (!access(viewer, 'accounts') && !canAccess(viewer, 'Accounts')) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);

    const notes = all
      .filter(r => isDispatchNote(r) && r.accountId === id)
      .sort((a, b) => String(b.noteCreatedAt || b.date || '').localeCompare(String(a.noteCreatedAt || a.date || '')));

    return json({ dispatch_notes: notes });
  } catch (e) {
    const f = safeFailure(e, 'dispatch-notes.list');
    return json(f.body, f.status);
  }
}

// POST /api/accounts/[id]/dispatch-notes — create a dispatch note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    // Both Account Management and Dispatch can create notes
    if (!access(viewer, 'accounts', true) && !canAccess(viewer, 'Accounts')) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);

    const body = await readPayload(request);
    const { content, is_urgent = false } = body as { content?: string; is_urgent?: boolean };

    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new AppError('content is required');
    }

    const now = new Date();

    const note = {
      id: crypto.randomUUID(),
      kind: 'activity',
      version: 0,
      accountId: id,
      name: content.slice(0, 200),
      date: today(),
      details: content,
      channel: 'Dispatcher note',
      category: 'General note',
      priority: is_urgent ? 'Urgent' : 'Normal',
      authorId: viewer.person,
      authorName: viewer.name,
      noteCreatedAt: now.toISOString(),
      recipientIds: [String(account.assignee || '')].filter(Boolean),
    } as Row;

    const [saved] = await writeMany(
      [{ next: note }],
      viewer,
      `Added dispatch note`
    );

    return json({ dispatch_note: saved }, 201);
  } catch (e) {
    const f = safeFailure(e, 'dispatch-notes.create');
    return json(f.body, f.status);
  }
}
