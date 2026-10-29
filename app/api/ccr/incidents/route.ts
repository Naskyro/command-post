import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createIncident, listIncidents } from '@/lib/ccr';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.incidents'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.category) throw new AppError('Category is required.');

    const result = await createIncident(v, {
      category: String(body.category),
      location: body.location ? String(body.location) : undefined,
      description: body.description ? String(body.description) : undefined,
      safety_concern: body.safety_concern === true,
      property_id: body.property_id ? String(body.property_id) : undefined,
      employee_id: body.employee_id ? String(body.employee_id) : undefined,
      occurrence_date: body.occurrence_date ? String(body.occurrence_date) : undefined,
      priority: body.priority ? String(body.priority) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { searchParams } = request.nextUrl;
    const incidents = await listIncidents(v, {
      status: searchParams.get('status') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      assigned_to: searchParams.get('assigned_to') ?? undefined,
      employee_id: searchParams.get('employee_id') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
    });
    return response({ incidents, count: incidents.length });
  } catch (e) { return failure(e); }
}
