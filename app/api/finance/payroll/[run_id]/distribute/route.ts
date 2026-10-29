import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, AppError } from '@/lib/shared/errors';
import { financeDb } from '@/db/finance';
import { stripe } from '@/lib/stripe';
import { num } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
  const f = safeFailure(e, 'payroll.distribute');
  return NextResponse.json(f.body, { status: f.status, headers });
};

// POST /api/finance/payroll/{id}/distribute
export async function POST(request: NextRequest, { params }: { params: Promise<{ run_id: string }> }) {
  try {
    const records = await allRecords();
    const viewer = identify(records, request.headers);
    if (!canAccess(viewer, 'Finance', 'Payroll', true) && !viewer.owner && viewer.role !== 'Department Head')
      throw new FinanceAccessError('Payroll distribution access required.', 403);

    const { run_id: id } = await params;
    const run = records.find(r => r.kind === 'payrun' && r.id === id);
    if (!run) return response({ error: 'Payroll run not found' }, 404);
    if (run.status !== 'Approved') return response({ error: 'Payroll must be approved before distribution.' }, 400);

    const body = await readPayload(request) as { confirm?: boolean };
    if (!body.confirm) throw new AppError('Set confirm: true to distribute payouts.');

    const db = financeDb();
    const people = new Map(records.filter(r => r.kind === 'person').map(r => [r.id, r]));
    const lines = (Array.isArray(run.lines) ? run.lines as Record<string, unknown>[] : []);
    const now = new Date().toISOString();
    const payouts: Record<string, unknown>[] = [];

    for (const line of lines) {
      const personId = String(line.person || '');
      const person = people.get(personId);
      const amount = Math.round(num(line.net_pay) * 100);
      if (!person || !person.stripe_bank_account_id) {
        await db.prepare('INSERT INTO stripe_payout_errors (id, payrun_id, employee_id, error, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, personId, 'No bank account on file', now)
          .run();
        payouts.push({ employee_id: personId, employee_name: String(person?.name || personId), amount: num(line.net_pay), status: 'failed', error: 'No bank account on file' });
        continue;
      }

      try {
        const payout = await stripe.createPayout({
          amount,
          currency: 'usd',
          method: 'standard',
          destination: String(person.stripe_bank_account_id),
          description: `Payroll ${run.period} to ${run.periodEnd}`,
          metadata: { payrun_id: id, employee_id: personId, employee_name: String(person.name) },
        }) as Record<string, unknown>;

        await db.prepare('INSERT INTO stripe_payouts (id, payrun_id, employee_id, stripe_payout_id, amount_cents, status, arrival_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, personId, String(payout.id), amount, String(payout.status), String(payout.arrival_date || ''), now)
          .run();

        payouts.push({
          employee_id: personId,
          employee_name: String(person.name),
          amount: num(line.net_pay),
          status: String(payout.status),
          arrival_date: String(payout.arrival_date || ''),
          stripe_payout_id: String(payout.id),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Payout failed';
        await db.prepare('INSERT INTO stripe_payout_errors (id, payrun_id, employee_id, error, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), id, personId, message, now)
          .run();
        payouts.push({ employee_id: personId, employee_name: String(person.name), amount: num(line.net_pay), status: 'failed', error: message });
      }
    }

    const succeeded = payouts.filter(p => p.status === 'in_transit' || p.status === 'paid' || p.status === 'pending').length;
    const failed = payouts.filter(p => p.status === 'failed').length;
    const totalAmount = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);

    return response({
      summary: { total_distributed: payouts.length, total_amount: totalAmount, succeeded, failed },
      payouts,
    });
  } catch (e) { return failure(e); }
}
