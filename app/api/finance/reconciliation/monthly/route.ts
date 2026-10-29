import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { getMonthlyReconciliation, postMonthlyReconciliation } from '@/lib/finance-extras';
import { AppError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.reconciliation'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const month = request.nextUrl.searchParams.get('month');
    const fund = request.nextUrl.searchParams.get('fund') ?? 'petty';
    if (!month) throw new AppError('month query param required (YYYY-MM)');
    const result = await getMonthlyReconciliation(v, month, fund);
    return response(result);
  } catch (e) { return failure(e); }
}

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const month = request.nextUrl.searchParams.get('month');
    const fund = request.nextUrl.searchParams.get('fund') ?? 'petty';
    if (!month) throw new AppError('month query param required (YYYY-MM)');
    const result = await postMonthlyReconciliation(v, month, fund);
    return response(result, 201);
  } catch (e) { return failure(e); }
}
