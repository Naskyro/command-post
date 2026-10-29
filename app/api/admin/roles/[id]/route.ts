import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { getRoleById } from '@/lib/admin';
import { AppError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'admin.role'); return response(f.body, f.status); };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const { id } = await params;
    const result = await getRoleById(v, id);
    if (!result) throw new AppError('Role not found', 404);
    return response(result);
  } catch (e) { return failure(e); }
}
