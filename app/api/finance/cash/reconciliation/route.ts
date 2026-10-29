import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { canAccess } from '@/lib/finance/access';
import { FinanceAccessError } from '@/lib/finance/identity';
import { safeFailure, ForbiddenError } from '@/lib/shared/errors';
import { num, today } from '@/lib/finance/model';

export const dynamic = 'force-dynamic';

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

const failure = (e: unknown) => {
  if (e instanceof FinanceAccessError)
    return response({ error: e.message }, e.status);
  const f = safeFailure(e, 'cash.reconciliation');
  return response(f.body, f.status);
};

// GET /api/finance/cash/reconciliation?month=
export async function GET(request: NextRequest) {
  try {
    const records = await allRecords();
    const viewer  = identify(records, request.headers);

    if (!canAccess(viewer, 'Finance', 'Outflows') && !canAccess(viewer, 'Finance', 'Reports & Taxes') && !viewer.canManage) {
      throw new ForbiddenError('Access denied.');
    }

    const { searchParams } = request.nextUrl;
    const month = searchParams.get('month') || today().slice(0, 7); // "2026-09"

    // Book balance: all cleared cash movements
    const allMovements = records.filter(r =>
      (r.kind === 'cashMovement' || r.kind === 'transaction') &&
      ['Cleared', 'Approved'].includes(String(r.status))
    );

    const bookBalance = allMovements.reduce((s, r) => {
      const t = String(r.type || '').toLowerCase();
      return t === 'deposit' || t === 'transfer in' ? s + num(r.amount) : s - num(r.amount);
    }, 0);

    // Outstanding = pending transactions this month
    const outstanding = records
      .filter(r =>
        (r.kind === 'cashMovement' || r.kind === 'transaction') &&
        r.status === 'Pending' &&
        String(r.date || '').startsWith(month)
      )
      .map(r => ({
        id:          r.id,
        date:        r.date,
        type:        r.type,
        amount:      r.amount,
        status:      'pending_clearing',
        description: r.description || r.name,
      }));

    const lastReconciled = records
      .filter(r => r.kind === 'reconciliation' && r.status === 'Closed')
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .at(0)?.date || null;

    return response({
      book_balance:           Math.round(bookBalance * 100) / 100,
      bank_statement_balance: null, // requires bank import (Phase 3)
      difference:             null,
      outstanding_items:      outstanding,
      discrepancies:          [],
      last_reconciled:        lastReconciled,
      month,
    });
  } catch (e) {
    return failure(e);
  }
}
