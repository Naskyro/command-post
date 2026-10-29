import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { getGeneralLedger } from '@/lib/finance-extras';
import { AppError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.gl'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const account = request.nextUrl.searchParams.get('account');
    if (!account) throw new AppError('account query param required');
    const result = await getGeneralLedger(v, account);
    return response(result);
  } catch (e) { return failure(e); }
}
