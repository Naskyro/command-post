import {handleDocumentStage} from '@/lib/ccr/document-stage-server';
import {stagedFields,validPropertyBytes,propertyClaimLimit,type DamageOriginal} from '@/lib/ccr/damage-stage-input';
import { NextRequest, NextResponse } from 'next/server';
import { context, writeMany, fileBytes, fileTargetRows } from '@/lib/accounts/server';
import {classifyDocument} from '@/lib/ccr/document-types';
import {validatedDocumentFile} from '@/lib/ccr/document-input';
import {encryptBytes} from '@/lib/hr/server';
import {prepareProfilePhoto} from '@/lib/people/photos';
import {isPendingAccount} from '@/lib/accounts/onboarding';
import {access} from '@/lib/accounts/policy';
import { canReadFile } from '@/lib/accounts/policy';
import { mayUpload, uploadMime, photoCategories } from '@/lib/accounts/uploads';
import { financeFiles } from '@/db/finance';
import { AppError, ConflictError, ForbiddenError, safeFailure } from '@/lib/shared/errors';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { try {
    const { viewer, all } = await context(request), f = all.find(r => r.id === request.nextUrl.searchParams.get('id') && r.kind === 'file');
    if (!f || !canReadFile(viewer, f))
        throw new ForbiddenError();
    if(f.category==='Account photo'&&!access(viewer,'accounts')&&all.some(a=>a.kind==='account'&&a.id===f.accountId&&isPendingAccount(a)))throw new ForbiddenError();
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
    let key = '',claimCommit=false;
    try {
        if (request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin)
            throw new ForbiddenError();
        if (Number(request.headers.get('content-length') || 0) > 16 * 1024 * 1024)
            throw new AppError('Choose files under 15 MB.', 413);
        const staged=request.nextUrl.searchParams.get('damageStage')==='1',ctx=await context(request,!staged),{viewer:v,staff}=ctx;let all=ctx.all;
        async function save(data:FormData,original?:DamageOriginal){const incoming=data.get('file'),file=original||(incoming instanceof File?incoming:null), accountId = String(data.get('accountId') || ''), contactId=String(data.get('contactId')||''), category = String(data.get('category') || 'Other');
        const claimId=String(data.get('claimId')||'');
        if(claimId&&(category!=='Claim evidence'||!all.some(r=>r.kind==='claim'&&r.id===claimId&&r.accountId===accountId)))throw new ForbiddenError('Choose a claim on this property.');
        if(!mayUpload(v,all,staff,category,accountId,contactId)) throw new ForbiddenError();
        if (!['Signage', 'Agreement', 'Resident letter', 'Welcome letter', 'Timeline', 'Other', 'Release request', 'Release approval', 'Claim evidence',...photoCategories].includes(category)) throw new AppError('Choose a file category.');
        const size=file instanceof File?file.size:file?.bytes.length;
        if (!file|| !size || size > 15 * 1024 * 1024) throw new AppError('Choose a file under 15 MB.');
        const isClaim=category==='Claim evidence',classification=isClaim?classifyDocument('damage',data.get('documentType'),data.get('otherDocumentType')):undefined;
        const strict=original||(file instanceof File&&isClaim&&/\.docx$/i.test(file.name)?await validatedDocumentFile(file):undefined);
        const bytes=strict?.bytes||new Uint8Array(await (file as File).arrayBuffer()),mime=strict?.type||uploadMime(file,bytes,category);
        const fingerprint=isClaim?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(c=>c.toString(16).padStart(2,'0')).join(''):undefined;
        const id = String(data.get('id') || crypto.randomUUID()), existing = all.find(r => r.id === id), inspectionId = String(data.get('inspectionId') || '');
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(id))
            throw new AppError('Invalid upload ID.');
        if (existing) {
            if (existing.accountId === accountId && String(existing.contactId||'')===contactId && existing.category===category && existing.mimeType===mime && existing.kind === 'file' && existing.authorId === v.person && (!isClaim||(String(existing.claimId||'')===claimId&&existing.sha256===fingerprint&&existing.documentType===classification?.documentType&&existing.otherDocumentType===classification?.otherDocumentType)) && existing.name === file.name && existing.size === size)
                return { records: [existing] };
            throw new AppError('Upload ID already in use.', 409);
        }
        if (inspectionId && !all.some(r => r.id === inspectionId && r.kind === 'inspection' && r.accountId === accountId))
            throw new AppError('Choose an inspection on this account.');
        if (file.name.length > 250)
            throw new AppError('Shorten the file name.');
        // Shared account exteriors may also be displayed on a linked Sales lead.
        // Keep the original framing, validate the image container and strip metadata.
        const storedBytes=category==='Account photo'?prepareProfilePhoto(bytes,file.type,15*1024*1024).bytes:bytes;
        key = 'accounts/' + (isClaim||category==='Account photo'?crypto.randomUUID():id);
        await financeFiles().put(key, isClaim?await encryptBytes(storedBytes):storedBytes, { httpMetadata: { contentType: isClaim?'application/octet-stream':mime } });
        const replaced=photoCategories.includes(category)?all.filter(f=>f.kind==='file'&&f.category===category&&f.status==='Current'&&f.accountId===accountId&&String(f.contactId||'')===contactId).map(old=>({old,next:{...old,status:'Archived'}})):[];
        const accountLock=category==='Account photo'?all.find(a=>a.kind==='account'&&a.id===accountId):undefined;
        claimCommit=isClaim;
        const saved = await writeMany([...(accountLock?[{old:accountLock,next:{...accountLock}}]:[]),...replaced,{ next: { id, kind: 'file', version: 0, name: file.name, accountId, contactId, category, ...(isClaim?{...classification,claimId:claimId||undefined,encryptedEvidence:true,sha256:fingerprint,uploadedBy:v.name,uploadedAt:new Date().toISOString()}:{}), inspectionId, language: String(data.get('language') || '').slice(0, 30), location: String(data.get('location') || '').slice(0, 200), date: new Date().toISOString().slice(0, 10), dateConfirmed: false, status: 'Current', size, mimeType: mime, storageKey: key } }], v, 'Uploaded account file');
        key = '';
        return { records: saved };
        }
        if(staged){
         const result=await handleDocumentStage(request,v,'property-damage',{
          maxBytes:propertyClaimLimit,validate:validPropertyBytes,
          async authorize(fields){const {accountId,claimId,contactId,category,documentType,otherDocumentType}=fields;
           all=await fileTargetRows([accountId,claimId,fields.id,fields.inspectionId]);
           if(category!=='Claim evidence'||!mayUpload(v,all,staff,category,accountId,contactId)||claimId&&!all.some(r=>r.kind==='claim'&&r.id===claimId&&r.accountId===accountId))throw new ForbiddenError('Choose an authorized property or claim.');
           if(fields.id&&!/^[A-Za-z0-9_-]{1,100}$/.test(fields.id))throw new AppError('Invalid upload ID.');
           classifyDocument('damage',documentType,otherDocumentType);
          },attach:async(doc,fields,uploadId)=>{if(!fields.id)all.push(...await fileTargetRows([uploadId]));return save(stagedFields(fields,uploadId),doc);}});
         return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
        }
        return NextResponse.json(await save(await request.formData()));
    }
    catch (e) {
        if (key&&(!claimCommit||e instanceof ConflictError))
            await financeFiles().delete(key).catch(() => console.error(JSON.stringify({ event: 'accounts.file_cleanup_failed' })));
        const f = safeFailure(e, 'accounts.upload');
        return NextResponse.json(f.body, { status: f.status });
    }
}
