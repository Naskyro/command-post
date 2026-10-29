import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { financeDb } from '@/db/finance';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.obligations'); return response(f.body, f.status); };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.person) throw new AppError('Authentication required', 401);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    const db = financeDb();
    const sets: string[] = [];
    const vals: (string | null)[] = [];
    const now = new Date().toISOString();
    const allowed = ['obligation', 'applies_to', 'due_date', 'owner', 'evidence_required', 'work_effect', 'status', 'recurrence', 'notes'];
    for (const key of allowed) {
      if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(body[key] ? String(body[key]) : null); }
    }
    if (!sets.length) throw new AppError('No fields to update');
    sets.push('updated_at = ?', 'updated_by = ?');
    vals.push(now, v.person, id);
    await db.prepare(`UPDATE compliance_obligations SET ${sets.join(', ')} WHERE id = ? AND is_active = 1`).bind(...vals).run();
    return response({ id, updated_at: now });
  } catch (e) { return failure(e); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && v.role !== 'COO') throw new AppError('Access denied', 403);
    const { id } = await params;
    const db = financeDb();
    await db.prepare('UPDATE compliance_obligations SET is_active = 0 WHERE id = ?').bind(id).run();
    return response({ deleted: true });
  } catch (e) { return failure(e); }
}
