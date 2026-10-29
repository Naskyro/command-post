import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import { today } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// ─── POST /api/accounts/[id]/activities ───────────────────────────────────
// Creates a new activity/timeline note for the account.
// Request body: { action_type: string, description: string, internal_only?: boolean }
// Activity records use kind='activity' in the account_records store.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    // Need 'activity' write permission
    if (!access(viewer, 'activity', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) {
      return json({ error: 'Account not found', status: 404 }, 404);
    }

    // Only the assigned manager or a director/owner can log activity on this account
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const body = await readPayload(request);
    const {
      action_type = 'note',
      description,
      internal_only = false,
    } = body as {
      action_type?: string;
      description?: string;
      internal_only?: boolean;
    };

    if (!description || typeof description !== 'string' || !description.trim()) {
      throw new AppError('description is required');
    }

    // Map spec's action_type to the internal channel field
    const channelMap: Record<string, string> = {
      note: 'Note',
      call: 'Phone call',
      visit: 'Onsite visit',
      email: 'Email',
      status_change: 'Note',
    };
    const channel = channelMap[String(action_type)] ?? 'Note';

    const now = new Date();

    const activityRecord = {
      id: crypto.randomUUID(),
      kind: 'activity' as const,
      version: 0,
      accountId: id,
      name: description.slice(0, 200),
      date: today(),
      details: description,
      channel,
      authorId: viewer.person,
      noteCreatedAt: now.toISOString(),
      ...(internal_only ? { internalOnly: true } : {}),
    };

    const [saved] = await writeMany(
      [{ next: activityRecord }],
      viewer,
      `Logged ${action_type}`
    );

    return json(
      {
        activity: {
          id: saved.id,
          account_id: id,
          actor_id: viewer.person,
          actor_name: viewer.name,
          action_type: String(action_type),
          description,
          timestamp: now.toISOString(),
          internal_only: Boolean(internal_only),
        },
      },
      201
    );
  } catch (e) {
    const f = safeFailure(e, 'activities.create');
    return json(f.body, f.status);
  }
}
