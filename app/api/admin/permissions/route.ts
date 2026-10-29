import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createPermission, listPermissions } from '@/lib/admin';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'admin.permissions'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const result = await listPermissions(v);
    return response({ permissions: result, count: result.length });
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner) throw new AppError('Admin only', 403);
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.role_id || !body.module || !body.actions) throw new AppError('role_id, module, actions required');
    const result = await createPermission(v, {
      role_id: String(body.role_id),
      module: String(body.module),
      tab: body.tab ? String(body.tab) : undefined,
      actions: String(body.actions),
      scope: body.scope ? String(body.scope) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
