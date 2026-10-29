import { NextRequest, NextResponse } from 'next/server';
import { allRecords, identify, visible, persist } from '@/lib/finance/server';
import { canReadPay } from '@/lib/people/policy';
import { recordAccess } from '@/lib/finance/access';
import { financeFiles } from '@/db/finance';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) { try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
        throw new Error('Cross-site request rejected');
    const records = await allRecords(), v = identify(records, request.headers);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 15 * 1024 * 1024)
        throw new Error('Choose a file under 15 MB.');
    const parent = String(form.get('parent') || '');
    if (!visible(v, records).some(r => r.id === parent && recordAccess(v, r, true) && (r.kind !== 'person' || canReadPay(v, r, records))))
        throw new Error('Save the record before adding its attachment.');
    const id = crypto.randomUUID();
    await financeFiles().put(id, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
    const record = await persist(undefined, { id, kind: 'file', version: 0, name: file.name, size: file.size, parent, person: v.person, date: new Date().toISOString() }, v, 'Uploaded attachment');
    return NextResponse.json({ record });
}
catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
} }
export async function GET(request: NextRequest) { try {
    const records = await allRecords(), v = identify(records, request.headers);
    const file = records.find(r => r.kind === 'file' && r.id === request.nextUrl.searchParams.get('id'));
    if (!file)
        throw new Error('Attachment not found');
    const allowed = visible(v, records);
    if (!allowed.some(r => (r.id === file.parent || r.fileId === file.id) && (r.kind !== 'person' || canReadPay(v, r, records))))
        throw new Error('Access denied');
    const object = await financeFiles().get(file.id);
    if (!object)
        throw new Error('Attachment not found');
    return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${String(file.name).replace(/[^a-zA-Z0-9._ -]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
} }
