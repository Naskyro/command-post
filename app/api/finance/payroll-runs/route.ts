import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { listPayrollRuns } from '@/lib/finance-extras';
import { AppError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.payroll-runs'); return response(f.body, f.status); };

export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && v.role !== 'COO') throw new AppError('Finance only', 403);
    const { searchParams } = request.nextUrl;
    const result = await listPayrollRuns(v, {
      employeeId: searchParams.get('employee_id') ?? undefined,
      period: searchParams.get('period') ?? undefined,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 100,
    });
    return response({ payroll_runs: result, count: result.length });
  } catch (e) { return failure(e); }
}
