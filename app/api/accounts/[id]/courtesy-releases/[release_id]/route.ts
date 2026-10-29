import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { access } from '@/lib/accounts/policy';
import { safeFailure, ForbiddenError } from '@/lib/shared/errors';
import { canAccess } from '@/lib/finance/access';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// DELETE /api/accounts/[id]/courtesy-releases/[release_id]
// Revokes a courtesy release — Operations Director or Owner only
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; release_id: string }> }
) {
  try {
    const { id, release_id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    // Only Operations Director or Owner can revoke a courtesy release
    if (!canAccess(viewer, 'Finance', 'Payroll', true) && !viewer.owner && viewer.role !== 'Department Head') {
      throw new ForbiddenError();
    }

    const release = all.find(r => r.kind === 'courtesy' && r.id === release_id && r.accountId === id);
    if (!release) return json({ error: 'Release not found', status: 404 }, 404);

    // Soft-delete: mark as revoked
    await writeMany(
      [{ old: release, next: { ...release, status: 'Revoked', revokedBy: viewer.person, revokedAt: new Date().toISOString() } }],
      viewer,
      `Revoked courtesy release`
    );

    return json({ deleted: true });
  } catch (e) {
    const f = safeFailure(e, 'courtesy.delete');
    return json(f.body, f.status);
  }
}
