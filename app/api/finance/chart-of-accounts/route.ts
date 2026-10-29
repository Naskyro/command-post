import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { listChartOfAccounts } from '@/lib/finance-extras';
import { safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.coa'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const accounts = await listChartOfAccounts(v);
    return response({ accounts, count: accounts.length });
  } catch (e) { return failure(e); }
}
