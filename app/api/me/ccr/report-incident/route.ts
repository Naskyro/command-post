import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createIncident } from '@/lib/ccr';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'me.ccr.report'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.category || !body.location) throw new AppError('category and location required');
    const result = await createIncident(v, {
      category: String(body.category),
      location: String(body.location),
      description: body.description ? String(body.description) : undefined,
      safety_concern: body.safety_concern === true,
      occurrence_date: body.occurrence_date ? String(body.occurrence_date) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
