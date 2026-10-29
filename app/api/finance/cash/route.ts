import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, persist } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import { num, today } from '@/lib/finance/model';
import type { FinRecord } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError)
    return response({ error: e.message }, e.status);
  const f = safeFailure(e, 'cash.request');
  return response(f.body, f.status);
};

function cashAccess(viewer: Parameters<typeof canAccess>[0], edit = false) {
  if (!viewer) return false;
  return canAccess(viewer, 'Finance', 'Outflows', edit) ||
         canAccess(viewer, 'Finance', 'Overview', edit) ||
         viewer.canManage;
}

// GET /api/finance/cash?status=&days=
export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!cashAccess(viewer)) throw new FinanceAccessError('Cash tracking access is not assigned.', 403);

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const days   = parseInt(searchParams.get('days') || '30');

    const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    // Cash movements = kind 'cashMovement' or 'transaction' with type cash-related
    const transactions = records
      .filter(r =>
        (r.kind === 'cashMovement' || r.kind === 'transaction' || r.kind === 'cashBag') &&
        String(r.date || '') >= cutoff
      )
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const filtered = status && status !== 'all'
      ? transactions.filter(r => String(r.status).toLowerCase() === status.toLowerCase())
      : transactions;

    // Current balance = sum of all cleared movements
    const balance = filtered
      .filter(r => r.status === 'Cleared' || r.status === 'Approved')
      .reduce((s, r) => {
        const t = String(r.type || '').toLowerCase();
        const amt = num(r.amount);
        return t === 'deposit' || t === 'transfer in' ? s + amt : s - amt;
      }, 0);

    const todayStr = today();
    const todayTxns = filtered.filter(r => r.date === todayStr);
    const monthTxns = filtered.filter(r => String(r.date || '').startsWith(todayStr.slice(0, 7)));

    return response({
      cash_account: {
        id:              'cash_main',
        current_balance: Math.round(balance * 100) / 100,
        last_updated:    new Date().toISOString(),
      },
      transactions: filtered.slice(0, 100),
      summary: {
        deposits_today:      todayTxns.filter(r => String(r.type).toLowerCase() === 'deposit').reduce((s, r) => s + num(r.amount), 0),
        withdrawals_today:   todayTxns.filter(r => String(r.type).toLowerCase() === 'withdrawal').reduce((s, r) => s + num(r.amount), 0),
        net_today:           todayTxns.reduce((s, r) => {
          const t = String(r.type).toLowerCase();
          return t === 'deposit' || t === 'transfer in' ? s + num(r.amount) : s - num(r.amount);
        }, 0),
        deposits_this_month: monthTxns.filter(r => String(r.type).toLowerCase() === 'deposit').reduce((s, r) => s + num(r.amount), 0),
      },
    });
  } catch (e) {
    return failure(e);
  }
}

// POST /api/finance/cash — record a cash transaction
export async function POST(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!cashAccess(viewer, true)) throw new FinanceAccessError('Cash edit access required.', 403);

    const body = await readPayload(request);
    const { type, description, amount, date, account_reference, notes } = body as {
      type?: string; description?: string; amount?: number;
      date?: string; account_reference?: string; notes?: string;
    };

    if (!type || !['deposit', 'withdrawal', 'transfer', 'fee'].includes(String(type).toLowerCase())) {
      throw new AppError('type must be "deposit", "withdrawal", "transfer", or "fee"');
    }
    if (!description) throw new AppError('description is required');
    if (!amount || num(amount) <= 0) throw new AppError('amount must be a positive number');

    const txnId = crypto.randomUUID();
    const isLarge = num(amount) > 5000;

    const txn: FinRecord = {
      id:               txnId,
      kind:             'cashMovement',
      version:          0,
      date:             String(date || today()),
      type:             String(type),
      description:      String(description),
      amount:           num(amount),
      status:           isLarge ? 'Pending review' : 'Pending',
      accountReference: String(account_reference || ''),
      notes:            String(notes || ''),
      createdBy:        viewer.person,
      createdAt:        new Date().toISOString(),
    };

    await persist(undefined, txn, viewer, `Recorded ${type}: ${description}`);

    return response({
      transaction: txn,
      message: `Transaction recorded${isLarge ? ' — flagged for review (>$5,000)' : ''}.`,
    }, 201);
  } catch (e) {
    return failure(e);
  }
}

// PATCH /api/finance/cash — approve/reconcile/reject a transaction
export async function PATCH(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!cashAccess(viewer, true)) throw new FinanceAccessError('Cash edit access required.', 403);

    const body = await readPayload(request);
    const { txn_id, action, amount, description, notes } = body as {
      txn_id?: string; action?: string;
      amount?: number; description?: string; notes?: string;
    };

    const txn = records.find(r =>
      (r.kind === 'cashMovement' || r.kind === 'transaction') && r.id === txn_id
    );
    if (!txn) return response({ error: 'Transaction not found' }, 404);

    const now = new Date().toISOString();
    let next: FinRecord;
    let reason: string;

    if (action === 'approve' || action === 'reconcile') {
      next   = { ...txn, status: 'Cleared', clearedAt: now, clearedBy: viewer.person, notes: notes || txn.notes };
      reason = `${action === 'reconcile' ? 'Reconciled' : 'Approved'} cash transaction`;
    } else if (action === 'reject') {
      next   = { ...txn, status: 'Rejected', rejectedAt: now, rejectedBy: viewer.person, rejectionReason: notes || '' };
      reason = 'Rejected cash transaction';
    } else if (action === 'edit') {
      if (txn.status === 'Cleared') throw new AppError('Cannot edit a cleared transaction.');
      next = { ...txn };
      if (amount      !== undefined) next.amount      = num(amount);
      if (description !== undefined) next.description = String(description);
      if (notes       !== undefined) next.notes       = String(notes);
      reason = 'Edited cash transaction';
    } else {
      throw new AppError('action must be "approve", "reconcile", "reject", or "edit"');
    }

    await persist(txn, next, viewer, reason);
    return response({ transaction: next });
  } catch (e) {
    return failure(e);
  }
}
