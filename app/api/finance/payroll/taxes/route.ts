import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { calculatePayrollTaxes } from '@/lib/finance-extras';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'finance.payroll-taxes'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const body = await readPayload(request) as Record<string, unknown>;
    if (typeof body.gross_pay !== 'number' || !body.payroll_run_id || !body.employee_id) throw new AppError('gross_pay, payroll_run_id, employee_id required');
    const result = await calculatePayrollTaxes(v, {
      grossPay: Number(body.gross_pay),
      allowances: body.allowances ? Number(body.allowances) : 0,
      payrollRunId: String(body.payroll_run_id),
      employeeId: String(body.employee_id),
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
