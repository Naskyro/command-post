import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createRole, listRoles } from '@/lib/admin';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'admin.roles'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const body = await readPayload(request) as { id?: string; name: string; description?: string };
    if (!body.name) throw new AppError('Role name is required');
    const result = await createRole(v, body);
    return response(result, 201);
  } catch (e) { return failure(e); }
}

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const result = await listRoles(v);
    return response({ roles: result, count: result.length });
  } catch (e) { return failure(e); }
}
