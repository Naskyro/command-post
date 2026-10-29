import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { ensureBaseRoles } from '@/lib/admin';
import { AppError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'admin.seed'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const result = await ensureBaseRoles(v);
    return response({ seeded: result.length, roles: result }, 201);
  } catch (e) { return failure(e); }
}
