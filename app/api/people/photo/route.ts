import { NextRequest, NextResponse } from 'next/server';
import { allRecords } from '@/lib/finance/server';
import { financeIdentity } from '@/lib/finance/identity';
import { auditHrAccess, decryptBytes, encryptBytes, financeFiles, readHrRecord, recordId, writeHrRecord } from '@/lib/hr/server';
import type { HrRecord } from '@/lib/hr/model';
import { canEditProfilePhoto, canReadProfilePhoto, photoRecordId, prepareProfilePhoto, profilePhotoCategory, profilePhotoLimit } from '@/lib/people/photos';
import { AppError, ConflictError, ForbiddenError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };

async function context(request: NextRequest, personId: string) {
  const records = await allRecords(), viewer = financeIdentity(request.headers, records, { allowOnboarding: true });
  if (!canReadProfilePhoto(viewer, personId, records)) throw new ForbiddenError();
  const photo = await readHrRecord(photoRecordId(personId));
  if (photo && (photo.personId !== personId || photo.kind !== 'document' || photo.data.category !== profilePhotoCategory)) throw new AppError('Photo record requires administrator review.', 409);
  return { records, viewer, photo };
}

export async function GET(request: NextRequest) {
  try {
    const personId = recordId(request.nextUrl.searchParams.get('personId'));
    const { records, viewer, photo } = await context(request, personId);
    if (request.nextUrl.searchParams.get('metadata') === '1') return json({ version: photo?.version || 0, hasPhoto: Boolean(photo?.data.storageKey), updatedAt: photo?.updatedAt || null, canEdit: canEditProfilePhoto(viewer, personId, records) });
    if (!photo?.data.storageKey) return new Response(null, { status: 404, headers });
    const file = await financeFiles().get(String(photo.data.storageKey));
    if (!file) throw new AppError('Photo is temporarily unavailable.', 404);
    const bytes = await decryptBytes(new Uint8Array(await file.arrayBuffer()));
    await auditHrAccess(photo, viewer, 'Viewed Profile Photo');
    return new Response(bytes.buffer as ArrayBuffer, { headers: { ...headers, 'Content-Type': String(photo.data.mimeType), 'Content-Disposition': 'inline; filename="profile-photo"' } });
  } catch (error) { const failure = safeFailure(error, 'people.photo.read'); return json(failure.body, failure.status); }
}

async function uploadForm(request: NextRequest) {
  const type = request.headers.get('content-type') || '';
  if (!type.startsWith('multipart/form-data;')) throw new AppError('Choose a photo to upload.');
  const limit = profilePhotoLimit + 64 * 1024;
  if (Number(request.headers.get('content-length') || 0) > limit) throw new AppError('Choose a photo smaller than 5 MB.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Choose a photo to upload.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const result = await reader.read(); if (result.done) break; length += result.value.length; if (length > limit) { await reader.cancel(); throw new AppError('Choose a photo smaller than 5 MB.', 413); } chunks.push(result.value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new Response(bytes.buffer as ArrayBuffer, { headers: { 'Content-Type': type } }).formData();
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) throw new ForbiddenError('Cross-origin upload rejected.');
    // Authenticate before reading the potentially large multipart body.
    const records = await allRecords(), viewer = financeIdentity(request.headers, records, { allowOnboarding: true });
    const form = await uploadForm(request), personId = recordId(form.get('personId'));
    if (!canEditProfilePhoto(viewer, personId, records)) throw new ForbiddenError('You can change your own photo or a person within your assigned personnel responsibility.');
    const old = await readHrRecord(photoRecordId(personId)), version = Number(form.get('version'));
    if (!Number.isInteger(version) || version < 0 || version !== (old?.version || 0)) throw new ConflictError('This photo changed. Refresh before trying again.');
    if (old && (old.personId !== personId || old.kind !== 'document' || old.data.category !== profilePhotoCategory)) throw new AppError('Photo record requires administrator review.', 409);
    const action = String(form.get('action') || 'upload'), at = new Date().toISOString();
    const base: HrRecord = { id: photoRecordId(personId), kind: 'document', personId, version: (old?.version || 0) + 1, createdAt: old?.createdAt || at, createdBy: old?.createdBy || viewer.name, updatedAt: at, updatedBy: viewer.name, data: { category: profilePhotoCategory } };
    let storageKey = '';
    if (action === 'remove') {
      if (!old?.data.storageKey) throw new AppError('There is no profile photo to remove.');
      base.data = { category: profilePhotoCategory, status: 'Removed' };
    } else if (action === 'upload') {
      const file = form.get('file');
      if (!(file instanceof File)) throw new AppError('Choose a JPG, PNG, or WebP photo.');
      const prepared = prepareProfilePhoto(new Uint8Array(await file.arrayBuffer()), file.type);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prepared.bytes as BufferSource));
      storageKey = 'hr/profile-photos/' + crypto.randomUUID();
      base.data = { category: profilePhotoCategory, status: 'Active', storageKey, mimeType: prepared.mimeType, size: prepared.bytes.length, width: prepared.width, height: prepared.height, sha256: Array.from(digest).map(x => x.toString(16).padStart(2, '0')).join('') };
      await financeFiles().put(storageKey, await encryptBytes(prepared.bytes), { httpMetadata: { contentType: 'application/octet-stream' } });
    } else throw new AppError('Choose Upload Photo or Remove Photo.');
    try { await writeHrRecord(old, base, viewer, action === 'remove' ? 'Removed Profile Photo' : 'Updated Profile Photo'); }
    catch (error) { if (storageKey) await financeFiles().delete(storageKey); throw error; }
    // The new record is committed before the old image is removed. A stale save cannot delete it.
    if (old?.data.storageKey) { try { await financeFiles().delete(String(old.data.storageKey)); } catch { /* The active photo reference is already committed; orphan cleanup can retry later. */ } }
    return json({ version: base.version, hasPhoto: action === 'upload', updatedAt: at });
  } catch (error) { const failure = safeFailure(error, 'people.photo.write'); return json(failure.body, failure.status); }
}
