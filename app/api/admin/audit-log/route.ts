import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { listAudit } from '@/lib/admin';
import { safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'admin.audit-log'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { searchParams } = request.nextUrl;
    const result = await listAudit(v, {
      entity_type: searchParams.get('entity_type') ?? undefined,
      entity_id: searchParams.get('entity_id') ?? undefined,
      actor_id: searchParams.get('actor_id') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 100,
    });
    return response({ events: result, count: result.length });
  } catch (e) { return failure(e); }
}
