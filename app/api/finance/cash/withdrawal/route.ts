import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { withdrawCash } from '@/lib/finance-extras';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.cash-withdrawal'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && v.role !== 'COO') throw new AppError('Finance only', 403);
    const body = await readPayload(request) as Record<string, unknown>;
    if (typeof body.amount !== 'number' || !body.purpose) throw new AppError('amount and purpose required');
    const result = await withdrawCash(v, { amount: Number(body.amount), purpose: String(body.purpose) });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
