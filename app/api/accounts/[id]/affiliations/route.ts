import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// GET /api/accounts/[id]/affiliations — ordered by start_date desc
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all } = ctx;

    if (!access(viewer, 'relationships')) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);

    const affiliations = all
      .filter(r => r.kind === 'affiliation' && r.accountId === id)
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));

    // Attach contact names for display
    const contacts = new Map(all.filter(r => r.kind === 'contact').map(r => [r.id, r]));
    const enriched = affiliations.map(aff => ({
      ...aff,
      person_name: contacts.get(String(aff.contactId))?.name || aff.name || '',
      person_id: aff.contactId,
    }));

    return json({ affiliations: enriched });
  } catch (e) {
    const f = safeFailure(e, 'affiliations.list');
    return json(f.body, f.status);
  }
}

// POST /api/accounts/[id]/affiliations
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    if (!access(viewer, 'relationships', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const body = await readPayload(request);
    const { person_id, person_name, role, start_date, end_date } = body as {
      person_id?: string; person_name?: string; role?: string;
      start_date?: string; end_date?: string;
    };

    if (!role || typeof role !== 'string') throw new AppError('role is required');
    if (!start_date) throw new AppError('start_date is required');

    const affiliation = {
      id: crypto.randomUUID(),
      kind: 'affiliation',
      version: 0,
      name: String(role),
      contactId: String(person_id || ''),
      accountId: id,
      role: String(role),
      startDate: String(start_date),
      ...(end_date ? { endDate: String(end_date) } : {}),
    } as Row;

    const [saved] = await writeMany([{ next: affiliation }], viewer, `Added affiliation: ${role}`);
    return json({ affiliation: saved }, 201);
  } catch (e) {
    const f = safeFailure(e, 'affiliations.create');
    return json(f.body, f.status);
  }
}
