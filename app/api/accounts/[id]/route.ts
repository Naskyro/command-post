import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany, projection } from '@/lib/accounts/server';
import { canEdit, canRead, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, ConflictError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// ─── GET /api/accounts/[id] ────────────────────────────────────────────────
// Returns a single account with all related records:
// contacts, affiliations, activities, agreements, courtesy releases, files.
// Permission: 'accounts' view access required.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    if (!access(viewer, 'accounts')) throw new ForbiddenError();

    // Filter to records visible to this viewer (manager surface = full record)
    const visible = projection(all, viewer, 'manager');

    const account = visible.find(r => r.kind === 'account' && r.id === id);
    if (!account) {
      return json({ error: 'Account not found', status: 404 }, 404);
    }

    const contacts     = visible.filter(r => r.kind === 'contact'     && r.accountId === id);
    const affiliations = visible.filter(r => r.kind === 'affiliation' && r.accountId === id);
    const agreements   = visible.filter(r => r.kind === 'file'        && r.accountId === id && r.category === 'Agreement');
    const activities   = visible
      .filter(r => r.kind === 'activity' && r.accountId === id)
      .slice(0, 100);
    const courtesy     = visible.filter(r => r.kind === 'courtesy'    && r.accountId === id);
    const files        = visible.filter(r => r.kind === 'file'        && r.accountId === id && r.category !== 'Agreement');

    return json({
      account,
      contacts,
      affiliations,
      agreements,
      activities,
      courtesy_releases: courtesy,
      files,
    });
  } catch (e) {
    const f = safeFailure(e, 'accounts.get');
    return json(f.body, f.status);
  }
}

// ─── PATCH /api/accounts/[id] ─────────────────────────────────────────────
// Updates account fields with optimistic concurrency control.
// Request body: { version: number, changes: Record<string, unknown> }
// writeMany() handles version increment, updated_at/by, and audit atomically.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) {
      return json({ error: 'Account not found', status: 404 }, 404);
    }

    // canEdit checks both access rights and assignment scope
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const body = await readPayload(request);
    const { version, changes } = body as { version?: number; changes?: Record<string, unknown> };

    if (typeof version !== 'number') {
      throw new AppError('version is required and must be a number');
    }
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new AppError('changes must be an object');
    }

    // Optimistic concurrency: version must match or request is stale
    if (account.version !== version) {
      return json(
        { error: 'Stale write: account was modified. Your version is outdated.', status: 409, current_version: account.version },
        409
      );
    }

    const changedFields = Object.keys(changes).join(', ');
    const action = `Updated ${changedFields}`;

    // writeMany atomically: increments version, sets updated_at/updated_by, writes audit row
    const [saved] = await writeMany(
      [{ old: account, next: { ...account, ...changes } as Row }],
      viewer,
      action
    );

    return json({ account: saved });
  } catch (e) {
    if (e instanceof ConflictError) {
      return json({ error: e.message, status: 409 }, 409);
    }
    const f = safeFailure(e, 'accounts.patch');
    return json(f.body, f.status);
  }
}
