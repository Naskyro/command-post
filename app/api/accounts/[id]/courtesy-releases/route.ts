import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// GET /api/accounts/[id]/courtesy-releases — ordered by approval date desc
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    if (!access(viewer, 'courtesy')) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);

    const courtesy = all
      .filter(r => r.kind === 'courtesy' && r.accountId === id)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    return json({ courtesy_releases: courtesy });
  } catch (e) {
    const f = safeFailure(e, 'courtesy.list');
    return json(f.body, f.status);
  }
}

// POST /api/accounts/[id]/courtesy-releases — approve a courtesy release
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    if (!access(viewer, 'courtesy', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const body = await readPayload(request);
    const { reason, authorized_callers_at_time } = body as {
      reason?: string; authorized_callers_at_time?: string[];
    };

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      throw new AppError('reason is required');
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Snapshot the authorized callers at time of approval
    const currentCallers = authorized_callers_at_time ??
      all.filter(r => r.kind === 'affiliation' && r.accountId === id && !r.endDate)
         .map(r => String(r.name || ''))
         .filter(Boolean);

    const release = {
      id: crypto.randomUUID(),
      kind: 'courtesy',
      version: 0,
      name: `Courtesy release — ${today}`,
      accountId: id,
      date: today,
      reason: reason.trim(),
      approverId: viewer.person,
      approverName: viewer.name,
      authorizedCallersAtTime: currentCallers,
      status: 'Approved',
    } as Row;

    const [saved] = await writeMany(
      [{ next: release }],
      viewer,
      `Approved courtesy release`
    );

    return json({ courtesy_release: saved }, 201);
  } catch (e) {
    const f = safeFailure(e, 'courtesy.create');
    return json(f.body, f.status);
  }
}
