import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { postTransactionToGl } from '@/lib/finance-extras';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.post-to-gl'); return response(f.body, f.status); };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.debit_account || !body.credit_account || typeof body.debit_amount !== 'number' || typeof body.credit_amount !== 'number') {
      throw new AppError('debit_account, debit_amount, credit_account, credit_amount required');
    }
    const result = await postTransactionToGl(v, {
      transactionId: id,
      debitAccount: String(body.debit_account),
      debitAmount: Number(body.debit_amount),
      creditAccount: String(body.credit_account),
      creditAmount: Number(body.credit_amount),
      description: body.description ? String(body.description) : '',
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
