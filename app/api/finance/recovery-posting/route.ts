import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { postRecoveryToFinance } from '@/lib/finance-extras';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.recovery-posting'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.recovery_id || !body.payroll_run_id) throw new AppError('recovery_id and payroll_run_id required');
    const result = await postRecoveryToFinance(v, String(body.recovery_id), String(body.payroll_run_id));
    return response(result, 201);
  } catch (e) { return failure(e); }
}
