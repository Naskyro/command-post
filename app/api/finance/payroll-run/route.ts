import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { createPayrollRun } from '@/lib/finance-extras';
import { getW4 } from '@/lib/finance/w4';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.payroll-run'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && v.role !== 'COO') throw new AppError('Finance only', 403);
    const body = await readPayload(request) as Record<string, unknown>;
    if (!body.employee_id || typeof body.gross_pay !== 'number') throw new AppError('employee_id and gross_pay required');
    const employeeId = String(body.employee_id);
    const allowances = typeof body.allowances === 'number' ? Number(body.allowances) : (await getW4(employeeId)).federalAllowances ?? 0;
    const result = await createPayrollRun(v, {
      employeeId,
      grossPay: Number(body.gross_pay),
      allowances,
      periodStart: body.period_start ? String(body.period_start) : undefined,
      periodEnd: body.period_end ? String(body.period_end) : undefined,
      payDate: body.pay_date ? String(body.pay_date) : undefined,
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
