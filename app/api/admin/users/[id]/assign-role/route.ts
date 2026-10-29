import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { assignRole } from '@/lib/admin';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'admin.assign-role'); return response(f.body, f.status); };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.role_id) throw new AppError('role_id required');
    const result = await assignRole(v, {
      user_id: id,
      role_id: String(body.role_id),
      department_id: body.department_id ? String(body.department_id) : undefined,
      effective_date: body.effective_date ? String(body.effective_date) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
