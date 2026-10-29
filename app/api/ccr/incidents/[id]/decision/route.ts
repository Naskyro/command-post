import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { approveRecovery } from '@/lib/ccr';
import { AppError, readPayload, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.decision'); return response(f.body, f.status); };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const body = await readPayload(request) as Record<string, unknown>;

    if (!body.responsibility_finding || !body.collection_method || typeof body.recoverable_amount !== 'number' || typeof body.recovery_approved_amount !== 'number') {
      throw new AppError('responsibility_finding, recoverable_amount, recovery_approved_amount, collection_method are required.');
    }

    const result = await approveRecovery(v, id, {
      responsibility_finding: String(body.responsibility_finding),
      recoverable_amount: Number(body.recoverable_amount),
      recovery_approved_amount: Number(body.recovery_approved_amount),
      collection_method: String(body.collection_method),
      reason: body.reason ? String(body.reason) : '',
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}
