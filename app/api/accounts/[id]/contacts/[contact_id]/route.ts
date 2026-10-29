import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany } from '@/lib/accounts/server';
import { canEdit, access } from '@/lib/accounts/policy';
import { readPayload, safeFailure, ForbiddenError, AppError } from '@/lib/shared/errors';
import type { Row } from '@/lib/accounts/model';

export const dynamic = 'force-dynamic';

const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// PATCH /api/accounts/[id]/contacts/[contact_id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contact_id: string }> }
) {
  try {
    const { id, contact_id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    if (!access(viewer, 'relationships', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const contact = all.find(r => r.kind === 'contact' && r.id === contact_id);
    if (!contact) return json({ error: 'Contact not found', status: 404 }, 404);

    const body = await readPayload(request);
    const { name, email, phone, role, is_primary } = body as {
      name?: string; email?: string; phone?: string; role?: string; is_primary?: boolean;
    };

    const changes: { old?: Row; next: Row }[] = [];
    const next = { ...contact };

    if (name  !== undefined) next.name  = String(name);
    if (email !== undefined) next.email = String(email);
    if (phone !== undefined) { next.phone = String(phone); next.workPhone = String(phone); }
    if (role  !== undefined) next.title = String(role);

    changes.push({ old: contact, next });

    // Handle primary contact flag
    if (is_primary === true) {
      // Unset other primaries for this account
      for (const c of all.filter(r => r.kind === 'contact' && r.isPrimary === true && r.id !== contact_id)) {
        changes.push({ old: c, next: { ...c, isPrimary: false } });
      }
      // Update account primaryContactId
      changes.push({ old: account, next: { ...account, primaryContactId: contact_id } });
      next.isPrimary = true;
    }

    const [saved] = await writeMany(changes, viewer, `Updated contact: ${contact.name}`);
    return json({ contact: saved });
  } catch (e) {
    const f = safeFailure(e, 'contacts.update');
    return json(f.body, f.status);
  }
}

// DELETE /api/accounts/[id]/contacts/[contact_id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contact_id: string }> }
) {
  try {
    const { id, contact_id } = await params;
    const ctx = await context(request);
    const { viewer, all, staff } = ctx;

    if (!access(viewer, 'relationships', true)) throw new ForbiddenError();

    const account = all.find(r => r.kind === 'account' && r.id === id);
    if (!account) return json({ error: 'Account not found', status: 404 }, 404);
    if (!canEdit(viewer, account, all, staff)) throw new ForbiddenError();

    const contact = all.find(r => r.kind === 'contact' && r.id === contact_id);
    if (!contact) return json({ error: 'Contact not found', status: 404 }, 404);

    // End the affiliation instead of hard-deleting (preserves history)
    const affiliation = all.find(r =>
      r.kind === 'affiliation' && r.accountId === id && r.contactId === contact_id && !r.endDate
    );

    const changes: { old?: Row; next: Row }[] = [];
    if (affiliation) {
      changes.push({
        old: affiliation,
        next: { ...affiliation, endDate: new Date().toISOString().split('T')[0] },
      });
    }
    // Soft-delete the contact
    changes.push({ old: contact, next: { ...contact, isActive: false } });

    await writeMany(changes, viewer, `Removed contact: ${contact.name}`);
    return json({ deleted: true });
  } catch (e) {
    const f = safeFailure(e, 'contacts.delete');
    return json(f.body, f.status);
  }
}
