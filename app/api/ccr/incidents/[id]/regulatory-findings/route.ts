import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createRegulatoryFinding, listRegulatoryFindings } from '@/lib/ccr';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.regulatory-findings'); return response(f.body, f.status); };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    const result = await createRegulatoryFinding(v, id, {
      agency: body.agency ? String(body.agency) : undefined,
      finding: body.finding ? String(body.finding) : undefined,
      status: body.status ? String(body.status) : undefined,
      due_date: body.due_date ? String(body.due_date) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const result = await listRegulatoryFindings(v, id);
    return response({ findings: result, count: result.length });
  } catch (e) { return failure(e); }
}
