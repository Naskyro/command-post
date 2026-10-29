import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { uploadEvidence, listEvidence } from '@/lib/ccr';
import { AppError, safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (e: unknown) => { const f = safeFailure(e, 'ccr.evidence'); return response(f.body, f.status); };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;

    const form = await request.formData();
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) throw new AppError('No file provided', 400);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadEvidence(v, id, bytes, {
      caption: (form.get('caption') as string) ?? undefined,
      source: (form.get('source') as string) ?? undefined,
      classification: (form.get('classification') as string) ?? 'public',
      filename: (form.get('filename') as string) ?? (file as unknown as { name?: string }).name ?? 'unknown',
      type: file.type || 'application/octet-stream',
    });
    return response(result, 201);
  } catch (e) { return failure(e); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const evidence = await listEvidence(v, id);
    return response({ evidence, count: evidence.length });
  } catch (e) { return failure(e); }
}
