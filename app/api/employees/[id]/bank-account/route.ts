import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, AppError } from '@/lib/shared/errors';
import { stripe, isConfigured } from '@/lib/stripe';
import type { FinRecord } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
  const f = safeFailure(e, 'employee.bank-account');
  return NextResponse.json(f.body, { status: f.status, headers });
};

function bankAccountAccess(viewer: ReturnType<typeof identify>, employeeId: string) {
  return viewer.person === employeeId || canAccess(viewer, 'Finance', 'Payroll', true);
}

async function accountOnboardingUrl(connectedAccountId: string, origin: string) {
  const link = await stripe.createAccountLink({
    account: connectedAccountId,
    refresh_url: `${origin}/timeclock`,
    return_url: `${origin}/timeclock`,
    type: 'account_onboarding',
  }) as Record<string, unknown>;
  return String(link.url);
}

// GET /api/employees/{id}/bank-account
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const viewer = identify(records, request.headers);
    const { id } = await params;
    if (!bankAccountAccess(viewer, id)) throw new FinanceAccessError('You cannot view this employee\'s bank account.', 403);
    const person = records.find(r => r.kind === 'person' && r.id === id);
    if (!person) return response({ error: 'Employee not found' }, 404);

    const connectedId = person.stripe_connected_account_id ? String(person.stripe_connected_account_id) : '';
    const oldSource = !person.stripe_connected_account_id && person.stripe_bank_account_id && !String(person.stripe_bank_account_id).startsWith('local_');

    if (oldSource) {
      return response({
        bank_account: null,
        migration: true,
        message: 'This bank was saved on a customer, which cannot receive payouts. Re-link using Stripe Connect.',
      });
    }

    if (!connectedId) return response({ bank_account: null });

    if (String(connectedId).startsWith('local_')) {
      return response({
        bank_account: {
          last_4: person.bank_last_4,
          bank_name: person.bank_name,
          account_type: person.bank_account_type,
          verified: true,
          added_at: person.bank_account_added_at,
          status: 'ready',
        }
      });
    }

    let account: Record<string, unknown> | undefined;
    try { account = await stripe.retrieveAccount(connectedId); } catch { account = undefined; }

    if (!account) {
      return response({
        bank_account: null,
        error: 'Connected account not found. It may have been deleted.',
      });
    }

    const payoutsEnabled = account.payouts_enabled === true;
    const detailsSubmitted = account.details_submitted === true;
    const origin = request.headers.get('origin') || `http://${request.headers.get('host') || 'localhost:5173'}`;

    if (!payoutsEnabled) {
      const onboardingUrl = await accountOnboardingUrl(connectedId, origin);
      return response({
        bank_account: null,
        onboarding: { url: onboardingUrl, submitted: detailsSubmitted },
        message: detailsSubmitted
          ? 'Stripe is reviewing the account. Finish any remaining onboarding requirements.'
          : 'Stripe Connect onboarding is required before payouts.',
      });
    }

    const externalAccounts = (account.external_accounts as Record<string, unknown> | undefined)?.data as Record<string, unknown>[] | undefined;
    const primary = externalAccounts?.[0];

    return response({
      bank_account: {
        last_4: primary?.last4 || person.bank_last_4,
        bank_name: primary?.bank_name || person.bank_name,
        account_type: person.bank_account_type,
        verified: true,
        added_at: person.bank_account_added_at,
        status: 'ready',
      }
    });
  } catch (e) { return failure(e); }
}

// POST /api/employees/{id}/bank-account
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const viewer = identify(records, request.headers);
    const { id } = await params;
    if (!bankAccountAccess(viewer, id)) throw new FinanceAccessError('You cannot update this employee\'s bank account.', 403);
    const person = records.find(r => r.kind === 'person' && r.id === id);
    if (!person) return response({ error: 'Employee not found' }, 404);

    const body = await readPayload(request) as { account_holder_name?: string; account_number?: string; routing_number?: string; account_type?: string };
    if (!body.account_holder_name || !body.account_number || !body.routing_number) throw new AppError('Account holder, account number, and routing number are required.');

    const accountNumber = String(body.account_number);
    const last4 = accountNumber.slice(-4);
    let connectedAccountId: string;
    let connectedStatus = 'pending';

    if (isConfigured()) {
      const existingId = person.stripe_connected_account_id ? String(person.stripe_connected_account_id) : '';
      let account: Record<string, unknown> | undefined;
      if (existingId && !existingId.startsWith('local_')) {
        try { account = await stripe.retrieveAccount(existingId); } catch { account = undefined; }
      }

      if (!account && !existingId.startsWith('local_')) {
        account = await stripe.createAccount({
          type: 'express',
          country: 'US',
          capabilities: { transfers: { requested: true } },
          metadata: { employee_id: id, employee_name: String(person.name || '') },
        }) as Record<string, unknown>;
      }

      connectedAccountId = String(account?.id || existingId);
      connectedStatus = account?.payouts_enabled === true ? 'ready' : 'onboarding_required';
    } else {
      connectedAccountId = `local_${id}_${crypto.randomUUID()}`;
      connectedStatus = 'ready';
    }

    const origin = request.headers.get('origin') || `http://${request.headers.get('host') || 'localhost:5173'}`;
    const onboardingUrl = !connectedAccountId.startsWith('local_') && connectedStatus !== 'ready'
      ? await accountOnboardingUrl(connectedAccountId, origin)
      : undefined;

    const next: FinRecord = {
      ...person,
      stripe_customer_id: undefined,
      stripe_bank_account_id: undefined,
      bank_last_4: last4,
      bank_name: body.account_holder_name,
      bank_account_type: body.account_type || 'checking',
      bank_verified: true,
      bank_account_added_at: new Date().toISOString(),
      stripe_connected_account_id: connectedAccountId,
      stripe_connected_account_status: connectedStatus,
    };
    await persist(person, next, viewer, 'Saved bank account via Stripe Connect');

    return response({
      message: isConfigured() ? 'Stripe Connect account created. Complete onboarding to enable payouts.' : 'Bank account saved locally. Real payouts will be enabled once STRIPE_SECRET_KEY is added.',
      bank_info: {
        last_4: next.bank_last_4,
        account_type: next.bank_account_type,
        status: connectedStatus,
      },
      onboarding_url: onboardingUrl,
    }, 201);
  } catch (e) { return failure(e); }
}

// DELETE /api/employees/{id}/bank-account
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const viewer = identify(records, request.headers);
    const { id } = await params;
    if (!bankAccountAccess(viewer, id)) throw new FinanceAccessError('You cannot remove this employee\'s bank account.', 403);
    const person = records.find(r => r.kind === 'person' && r.id === id);
    if (!person) return response({ error: 'Employee not found' }, 404);

    const next: FinRecord = { ...person,
      stripe_customer_id: undefined,
      stripe_bank_account_id: undefined,
      stripe_connected_account_id: undefined,
      stripe_connected_account_status: undefined,
      bank_last_4: undefined,
      bank_name: undefined,
      bank_account_type: undefined,
      bank_verified: false,
      bank_account_added_at: undefined,
    };
    await persist(person, next, viewer, 'Removed bank account from Command Post');
    return response({ deleted: true });
  } catch (e) { return failure(e); }
}
