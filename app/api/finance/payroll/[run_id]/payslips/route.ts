import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { safeFailure, ForbiddenError } from '@/lib/shared/errors';
import { num } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError)
    return response({ error: e.message }, e.status);
  const f = safeFailure(e, 'payslips.read');
  return response(f.body, f.status);
};

// GET /api/finance/payroll/[run_id]/payslips
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ run_id: string }> }
) {
  try {
    const { run_id } = await params;
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!canAccess(viewer, 'Finance', 'Payroll') && !viewer.canManage) {
      throw new ForbiddenError('Payroll access is not assigned.');
    }

    const run = records.find(r => r.kind === 'payrun' && r.id === run_id);
    if (!run) return response({ error: 'Payroll run not found' }, 404);

    const people  = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));
    const lines   = (run.lines as Record<string, unknown>[]) || [];

    const payslips = lines.map(line => {
      const p = people.get(String(line.person));
      const gross = num(line.gross_pay);
      const taxes = num(line.taxes);
      return {
        employee_id:    line.person,
        employee_name:  line.employee_name || p?.name || line.person,
        period:         `${run.period} to ${run.periodEnd}`,
        hours_worked:   num(line.hours),
        hourly_rate:    num(line.hourly_rate),
        gross_pay:      gross,
        taxes: {
          total: taxes,
        },
        deductions:  [],
        net_pay:      num(line.net_pay ?? (gross - taxes)),
        pay_method:   p?.payMethod || 'Direct deposit',
        status:       run.status,
      };
    });

    return response({ payslips });
  } catch (e) {
    return failure(e);
  }
}
