import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { safeFailure } from '@/lib/shared/errors';
import { financeDb } from '@/db/finance';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
  const f = safeFailure(e, 'payroll.payouts');
  return NextResponse.json(f.body, { status: f.status, headers });
};

// GET /api/finance/payroll/{id}/payouts
export async function GET(request: NextRequest, { params }: { params: Promise<{ run_id: string }> }) {
  try {
    const records = await allRecords();
    const viewer = identify(records, request.headers);
    if (!canAccess(viewer, 'Finance', 'Payroll') && !viewer.owner && viewer.role !== 'Department Head')
      throw new FinanceAccessError('Payroll access required.', 403);

    const { run_id: id } = await params;
    const db = financeDb();
    const rows = await db.prepare('SELECT * FROM stripe_payouts WHERE payrun_id = ? ORDER BY created_at DESC').bind(id).all<Record<string, unknown>>();
    const errors = await db.prepare('SELECT * FROM stripe_payout_errors WHERE payrun_id = ? ORDER BY created_at DESC').bind(id).all<Record<string, unknown>>();

    const people = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));

    const payouts = [];
    if (rows.results) {
      for (const row of rows.results) {
        const person = people.get(String(row.employee_id));
        let status = String(row.status);
        try {
          const fresh = await stripe.retrievePayout(String(row.stripe_payout_id)) as Record<string, unknown>;
          if (fresh.status !== status) {
            status = String(fresh.status);
            await db.prepare('UPDATE stripe_payouts SET status = ? WHERE id = ?').bind(status, row.id).run();
          }
        } catch { /* leave cached status */ }
        payouts.push({
          employee_id: String(row.employee_id),
          employee_name: String(person?.name || row.employee_id),
          amount: Number(row.amount_cents) / 100,
          status,
          arrival_date: row.arrival_date,
          stripe_payout_id: String(row.stripe_payout_id),
          created_at: String(row.created_at),
        });
      }
    }

    const failed = errors.results ? errors.results.map(e => ({
      employee_id: String(e.employee_id),
      employee_name: String(people.get(String(e.employee_id))?.name || e.employee_id),
      error: String(e.error),
      created_at: String(e.created_at),
    })) : [];

    const succeeded = payouts.filter(p => ['pending','in_transit','paid'].includes(String(p.status))).length;
    const totalAmount = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);

    return response({
      payouts,
      failed,
      summary: {
        total_distributed: payouts.length + failed.length,
        total_amount: totalAmount,
        succeeded,
        failed: failed.length,
      }
    });
  } catch (e) { return failure(e); }
}
