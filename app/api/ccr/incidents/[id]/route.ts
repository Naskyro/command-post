import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { getIncident, updateIncident } from '@/lib/ccr';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.incident'); return response(f.body, f.status); };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const result = await getIncident(v, id);
    if (!result) throw new AppError('Incident not found', 404);
    return response(result);
  } catch (e) { return failure(e); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.assigned_to !== undefined) data.assigned_to = body.assigned_to;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.recovery_status !== undefined) data.recovery_status = body.recovery_status;
    if (body.location !== undefined) data.location = body.location;
    if (body.brief_description !== undefined) data.brief_description = body.brief_description;
    const result = await updateIncident(v, id, data);
    return response(result);
  } catch (e) { return failure(e); }
}
