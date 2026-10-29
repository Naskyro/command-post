import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany, fileBytes } from '@/lib/accounts/server';
import { canReadFile } from '@/lib/accounts/policy';
import { mayUpload, uploadMime, photoCategories } from '@/lib/accounts/uploads';
import { financeFiles } from '@/db/finance';
import { AppError, ForbiddenError, safeFailure } from '@/lib/shared/errors';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { try {
    const { viewer, all } = await context(request), f = all.find(r => r.id === request.nextUrl.searchParams.get('id') && r.kind === 'file');
    if (!f || !canReadFile(viewer, f))
        throw new ForbiddenError();
    if(f.sourceOnly&&typeof f.sourceUrl==='string') {
        const source=new URL(f.sourceUrl);
        if(source.protocol==='https:'&&source.hostname==='drive.google.com')return NextResponse.redirect(source,302);
    }
    const r = await fileBytes(f), inline = request.nextUrl.searchParams.get('preview') === '1' && ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(r.mime);
    return new Response(r.body, { headers: { 'Content-Type': r.mime, 'Content-Disposition': (inline ? 'inline' : 'attachment') + '; filename="' + f.name.replace(/[^A-Za-z0-9._ -]/g, '_') + '"', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
catch (e) {
    const f = safeFailure(e, 'accounts.file_read');
    return NextResponse.json(f.body, { status: f.status });
} }
export async function POST(request: NextRequest) {
    let key = '';
    try {
        if (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin)
            throw new ForbiddenError();
        if (Number(request.headers.get('content-length') || 0) > 16 * 1024 * 1024)
            throw new AppError('Choose files under 15 MB.', 413);
        const { viewer: v, all, staff } = await context(request), data = await request.formData(), file = data.get('file'), accountId = String(data.get('accountId') || ''), contactId=String(data.get('contactId')||''), category = String(data.get('category') || 'Other');
        if(!mayUpload(v,all,staff,category,accountId,contactId)) throw new ForbiddenError();
        if (!['Signage', 'Agreement', 'Resident letter', 'Welcome letter', 'Timeline', 'Other', 'Release request', 'Release approval', 'Claim evidence',...photoCategories].includes(category)) throw new AppError('Choose a file category.');
        if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024) throw new AppError('Choose a file under 15 MB.');
        const bytes = new Uint8Array(await file.arrayBuffer()), mime=uploadMime(file,bytes,category);
        const id = String(data.get('id') || crypto.randomUUID()), existing = all.find(r => r.id === id), inspectionId = String(data.get('inspectionId') || '');
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(id))
            throw new AppError('Invalid upload ID.');
        if (existing) {
            if (existing.accountId === accountId && String(existing.contactId||'')===contactId && existing.category===category && existing.mimeType===mime && existing.kind === 'file' && existing.authorId === v.person && existing.name === file.name && existing.size === file.size)
                return NextResponse.json({ records: [existing] });
            throw new AppError('Upload ID already in use.', 409);
        }
        if (inspectionId && !all.some(r => r.id === inspectionId && r.kind === 'inspection' && r.accountId === accountId))
            throw new AppError('Choose an inspection on this account.');
        if (file.name.length > 250)
            throw new AppError('Shorten the file name.');
        key = 'accounts/' + id;
        await financeFiles().put(key, bytes, { httpMetadata: { contentType: mime } });
        const replaced=photoCategories.includes(category)?all.filter(f=>f.kind==='file'&&f.category===category&&f.status==='Current'&&f.accountId===accountId&&String(f.contactId||'')===contactId).map(old=>({old,next:{...old,status:'Archived'}})):[];
        const saved = await writeMany([...replaced,{ next: { id, kind: 'file', version: 0, name: file.name, accountId, contactId, category, inspectionId, language: String(data.get('language') || '').slice(0, 30), location: String(data.get('location') || '').slice(0, 200), date: new Date().toISOString().slice(0, 10), dateConfirmed: false, status: 'Current', size: file.size, mimeType: mime, storageKey: key } }], v, 'Uploaded account file');
        key = '';
        return NextResponse.json({ records: saved });
    }
    catch (e) {
        if (key)
            await financeFiles().delete(key).catch(() => console.error(JSON.stringify({ event: 'accounts.file_cleanup_failed' })));
        const f = safeFailure(e, 'accounts.upload');
        return NextResponse.json(f.body, { status: f.status });
    }
}
