import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { completeCashWithdrawal } from '@/lib/finance-extras';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.cash-complete'); return response(f.body, f.status); };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && v.role !== 'COO') throw new AppError('Finance only', 403);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    if (typeof body.receipt_amount !== 'number' || typeof body.returned_cash !== 'number') throw new AppError('receipt_amount and returned_cash required');
    const result = await completeCashWithdrawal(v, id, { receiptAmount: Number(body.receipt_amount), returnedCash: Number(body.returned_cash) });
    return response(result);
  } catch (e) { return failure(e); }
}
