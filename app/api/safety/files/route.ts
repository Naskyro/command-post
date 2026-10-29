import {NextRequest,NextResponse} from 'next/server';
import {safetyContext} from '@/lib/safety/server';
import {safetyAccess} from '@/lib/safety/access';
import {evidenceMime} from '@/lib/safety/model';
import {writeMany,fileBytes} from '@/lib/accounts/server';
import {financeFiles} from '@/db/finance';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const fail=(e:unknown)=>{const f=safeFailure(e,'safety.file');return NextResponse.json(f.body,{status:f.status});};
export async function GET(req:NextRequest){try{const {all,viewer}=await safetyContext(req);if(!safetyAccess(viewer))throw new ForbiddenError();const f=all.find(r=>r.kind==='file'&&r.category==='Trespass evidence'&&r.id===req.nextUrl.searchParams.get('id'));if(!f)throw new AppError('Evidence file unavailable.',404);const result=await fileBytes(f);return new Response(result.body,{headers:{'Content-Type':result.mime,'Content-Disposition':'attachment; filename="'+f.name.replace(/[^a-z0-9._ -]/gi,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(e){return fail(e);}}
export async function POST(req:NextRequest){let key='';try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 if(Number(req.headers.get('content-length')||0)>26*1024*1024)throw new AppError('Files must be 25 MB or smaller.',413);
 const {all,viewer}=await safetyContext(req);if(!safetyAccess(viewer,true))throw new ForbiddenError();const form=await req.formData(),file=form.get('file'),c=all.find(r=>r.kind==='trespass'&&r.id===form.get('caseId'));
 if(!c)throw new AppError('Save the case before uploading evidence.');if(!(file instanceof File)||!file.size||file.size>25*1024*1024||file.name.length>250)throw new AppError('Choose a file up to 25 MB with a shorter file name.');
 const bytes=new Uint8Array(await file.arrayBuffer()),mime=evidenceMime(file.name,bytes),id=crypto.randomUUID();key='safety/'+id;await financeFiles().put(key,bytes,{httpMetadata:{contentType:mime}});
 const rows=await writeMany([{next:{id,kind:'file',version:0,name:file.name,category:'Trespass evidence',caseId:c.id,accountId:c.accountId,size:file.size,mimeType:mime,storageKey:key,date:new Date().toISOString().slice(0,10),status:'Current'}}],viewer,'Uploaded trespass evidence');key='';return NextResponse.json({records:rows.map(({storageKey,...rest})=>rest)});
 }catch(e){if(key)await financeFiles().delete(key).catch(()=>undefined);return fail(e);}}
