import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, AppError } from '@/lib/shared/errors';
import { stripe } from '@/lib/stripe';
import type { FinRecord } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
  const f = safeFailure(e, 'employee.bank-account.verify');
  return NextResponse.json(f.body, { status: f.status, headers });
};

function bankAccountAccess(viewer: ReturnType<typeof identify>, employeeId: string) {
  return viewer.person === employeeId || canAccess(viewer, 'Finance', 'Payroll', true);
}

// POST /api/employees/{id}/bank-account/verify
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const viewer = identify(records, request.headers);
    const { id } = await params;
    if (!bankAccountAccess(viewer, id)) throw new FinanceAccessError('You cannot verify this employee\'s bank account.', 403);
    const person = records.find(r => r.kind === 'person' && r.id === id);
    if (!person) return response({ error: 'Employee not found' }, 404);
    if (!person.stripe_customer_id || !person.stripe_bank_account_id) return response({ error: 'No saved bank account to verify' }, 400);

    const body = await readPayload(request) as { amount_1?: number; amount_2?: number };
    if (body.amount_1 === undefined || body.amount_2 === undefined) throw new AppError('Both micro-deposit amounts are required.');

    const amounts = [Number(body.amount_1), Number(body.amount_2)];
    await stripe.verifySource(String(person.stripe_customer_id), String(person.stripe_bank_account_id), amounts);

    const next: FinRecord = { ...person, bank_verified: true };
    await persist(person, next, viewer, 'Verified bank account for Stripe payouts');

    return response({ message: 'Bank account verified successfully.', ready_for_payouts: true });
  } catch (e) { return failure(e); }
}
