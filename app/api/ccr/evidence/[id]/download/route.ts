import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify } from '@/lib/finance/server';
import { downloadEvidence } from '@/lib/ccr';
import { safeFailure } from '@/lib/shared/errors';

export const dynamic = 'force-dynamic';
const failure = (e: unknown) => {
  const f = safeFailure(e, 'ccr.evidence-download');
  return NextResponse.json(f.body, { status: f.status, headers: { 'Cache-Control': 'private, no-store' } });
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const records = await allRecords();
    const v = identify(records, request.headers);
    const { id } = await params;
    const { bytes, fileType, filename, sha256 } = await downloadEvidence(v, id);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': fileType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-File-Hash': sha256,
      },
    });
  } catch (e) { return failure(e); }
}
