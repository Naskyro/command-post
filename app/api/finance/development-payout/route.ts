import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { isConfigured, stripe } from '@/lib/stripe';
import { financeDb } from '@/db/finance';
import { canAccess } from '@/lib/finance/access';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'development.payout'); return response(f.body, f.status); };

export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    if (!v.owner && !canAccess(v, 'Finance', 'Payroll', true)) throw new AppError('Not allowed.', 403);

    const body = await readPayload(request) as { amount_cents?: number; confirm?: boolean };
    if (!body.confirm) throw new AppError('Set confirm: true to send this live transfer.');
    if (typeof body.amount_cents !== 'number' || !Number.isInteger(body.amount_cents) || body.amount_cents < 1 || body.amount_cents > 99) {
      throw new AppError('Amount must be 1–99 cents.');
    }
    if (!isConfigured()) throw new AppError('Stripe is not configured.', 400);

    const person = records.find(r => r.kind === 'person' && r.id === v.person);
    const connectedId = person?.stripe_connected_account_id ? String(person.stripe_connected_account_id) : '';
    if (!connectedId || connectedId.startsWith('local_')) {
      throw new AppError('Re-link your bank using Stripe Connect before testing.', 400);
    }

    const account = await stripe.retrieveAccount(connectedId) as Record<string, unknown>;
    if (account.payouts_enabled !== true) {
      throw new AppError('Stripe Connect onboarding is not complete. Finish it before sending a test transfer.', 400);
    }

    const idempotencyKey = `dev_transfer_${v.person}_${body.amount_cents}_${Date.now()}`;
    const transfer = await stripe.createTransfer({
      amount: body.amount_cents,
      currency: 'usd',
      destination: connectedId,
    }, idempotencyKey) as Record<string, unknown>;

    const now = new Date().toISOString();
    const transferId = String(transfer.id);
    const status = String(transfer.status || 'paid');

    await financeDb().prepare('INSERT INTO stripe_payouts (id, payrun_id, employee_id, stripe_payout_id, amount_cents, status, arrival_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), 'development', v.person, transferId, body.amount_cents, status, now, now).run();

    return response({
      transfer_id: transferId,
      status,
      amount_cents: body.amount_cents,
      message: `Transfer of ${(body.amount_cents / 100).toFixed(2)} USD sent to the connected account. It will be paid out to the bank by Stripe.`,
    });
  } catch (e) { return failure(e); }
}
