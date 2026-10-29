import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { financeDb } from '@/db/finance';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.obligations'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.person) throw new AppError('Authentication required', 401);
    const db = financeDb();
    const { searchParams } = request.nextUrl;
    let query = 'SELECT * FROM compliance_obligations WHERE is_active = 1';
    const params: string[] = [];
    if (searchParams.get('status')) { query += ' AND status = ?'; params.push(searchParams.get('status')!); }
    query += ' ORDER BY due_date ASC, created_at ASC LIMIT 200';
    const result = await db.prepare(query).bind(...params).all();
    return response({ obligations: result.results || [], count: (result.results || []).length });
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && v.role !== 'COO' && v.role !== 'Manager') throw new AppError('Access denied', 403);
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.obligation) throw new AppError('Obligation name is required');
    if (!body.applies_to) throw new AppError('Applies to is required');
    const db = financeDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO compliance_obligations (id, obligation, applies_to, due_date, owner, evidence_required, work_effect, status, recurrence, notes, created_by, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      String(body.obligation),
      String(body.applies_to),
      body.due_date ? String(body.due_date) : null,
      body.owner ? String(body.owner) : null,
      body.evidence_required ? String(body.evidence_required) : null,
      body.work_effect ? String(body.work_effect) : null,
      body.status ? String(body.status) : 'Upcoming',
      body.recurrence ? String(body.recurrence) : null,
      body.notes ? String(body.notes) : null,
      v.person,
      now,
      now,
      v.person,
    ).run();
    return response({ id, created_at: now }, 201);
  } catch (e) { return failure(e); }
}
