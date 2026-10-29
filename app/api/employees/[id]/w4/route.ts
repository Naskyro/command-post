import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { getW4, setW4 } from '@/lib/finance/w4';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'employees.w4'); return response(f.body, f.status); };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    if (!v.owner && v.person !== id) throw new AppError('Access denied', 403);
    const w4 = await getW4(id);
    return response(w4);
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    if (!v.owner && v.person !== id) throw new AppError('Access denied', 403);
    const body = await readPayload(request) as Record<string, unknown>;
    const result = await setW4(id, {
      filingStatus: body.filing_status ? String(body.filing_status) : undefined,
      federalAllowances: typeof body.federal_allowances === 'number' ? Number(body.federal_allowances) : undefined,
      stateAllowances: typeof body.state_allowances === 'number' ? Number(body.state_allowances) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
