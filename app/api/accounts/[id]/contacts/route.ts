import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// GET /api/accounts/[id]/contacts
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

    const affiliationIds = new Set(
      all.filter(r => r.kind === 'affiliation' && r.accountId === id).map(r => String(r.contactId))
    );
    const contacts = all.filter(r => r.kind === 'contact' && affiliationIds.has(r.id));

    return json({ contacts });
  } catch (e) {
    const f = safeFailure(e, 'contacts.list');
    return json(f.body, f.status);
  }
}

// POST /api/accounts/[id]/contacts
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
    const { name, email, phone, role = 'Property Manager', is_primary = false } = body as {
      name?: string; email?: string; phone?: string; role?: string; is_primary?: boolean;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AppError('name is required');
    }

    const contactId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const contact = {
      id: contactId,
      kind: 'contact',
      version: 0,
      name: name.trim(),
      email: String(email || ''),
      phone: String(phone || ''),
      workPhone: String(phone || ''),
      title: String(role),
    } as Row;

    const affiliation = {
      id: crypto.randomUUID(),
      kind: 'affiliation',
      version: 0,
      name: String(role),
      contactId,
      accountId: id,
      role: String(role),
      startDate: today,
      workEmail: String(email || ''),
      workPhone: String(phone || ''),
    } as Row;

    const changes: { old?: Row; next: Row }[] = [
      { next: contact },
      { next: affiliation },
    ];

    if (is_primary) {
      changes.push({ old: account, next: { ...account, primaryContactId: contactId } });
    }

    const [saved] = await writeMany(changes, viewer, `Added contact: ${name}`);

    return json({ contact: saved }, 201);
  } catch (e) {
    const f = safeFailure(e, 'contacts.create');
    return json(f.body, f.status);
  }
}
