import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { listCashWithdrawals } from '@/lib/finance-extras';
import { safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.cash-withdrawals'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50');
    const result = await listCashWithdrawals(v, limit);
    return response({ withdrawals: result, count: result.length });
  } catch (e) { return failure(e); }
}
