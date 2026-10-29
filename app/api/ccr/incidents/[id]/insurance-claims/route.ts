import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createInsuranceClaim, listInsuranceClaims } from '@/lib/ccr';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.insurance-claims'); return response(f.body, f.status); };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    const result = await createInsuranceClaim(v, id, {
      provider: body.provider ? String(body.provider) : undefined,
      claim_number: body.claim_number ? String(body.claim_number) : undefined,
      amount_claimed: typeof body.amount_claimed === 'number' ? Number(body.amount_claimed) : undefined,
      amount_paid: typeof body.amount_paid === 'number' ? Number(body.amount_paid) : undefined,
      status: body.status ? String(body.status) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const result = await listInsuranceClaims(v, id);
    return response({ claims: result, count: result.length });
  } catch (e) { return failure(e); }
}
