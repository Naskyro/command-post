import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createPayrollRunBatch } from '@/lib/finance-extras';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.payroll-run-batch'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;
    const items = body.items as Record<string, unknown>[] | undefined;
    if (!Array.isArray(items) || !items.length) throw new AppError('items array required');
    const result = await createPayrollRunBatch(v, items.map(i => ({
      employeeId: String(i.employee_id),
      grossPay: Number(i.gross_pay),
      allowances: typeof i.allowances === 'number' ? Number(i.allowances) : undefined,
      periodStart: i.period_start ? String(i.period_start) : undefined,
      periodEnd: i.period_end ? String(i.period_end) : undefined,
      payDate: i.pay_date ? String(i.pay_date) : undefined,
    })));
    return response({ runs: result, count: result.length }, 201);
  } catch (e) { return failure(e); }
}
