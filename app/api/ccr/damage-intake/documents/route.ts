import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {createHash} from 'node:crypto';
import {validateDamageSourceBytes} from '@/lib/ccr/damage-source-image';
import {readDocumentForm} from '@/lib/ccr/document-input';
import {assertDamageIntakeAccess} from '@/lib/ccr/damage-intake-server';
import {AppError,safeFailure,ForbiddenError} from '@/lib/shared/errors';
import {attachDamageIntakeOriginal,readDamageIntakeOriginal} from '@/lib/ccr/damage-intake-documents';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(req:NextRequest){
 try{
  if(req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
  const viewer=await requestViewer(req.headers),q=req.nextUrl.searchParams;
  const {file,bytes}=await readDamageIntakeOriginal(viewer,q.get('id'),q.get('file'));
  const name=encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
  return new Response(bytes as BodyInit,{headers:{...headers,'Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':"attachment; filename*=UTF-8''"+name,'Content-Type':file.type,'Content-Length':String(file.bytes)}});
 }catch(e){const f=safeFailure(e,'ccr.damage-intake.document.read');return NextResponse.json(f.body,{status:f.status,headers});}
}

export async function POST(req:NextRequest){
 try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
  const viewer=await requestViewer(req.headers);assertDamageIntakeAccess(viewer,true);if(!viewer.owner)throw new ForbiddenError();
  const form=await readDocumentForm(req,400*1024),file=form.get('file'),expected=form.get('sha256'),fields:Record<string,string>={};
  if(!(file instanceof File)||typeof expected!=='string'||!/^([a-f0-9]{64})$/.test(expected))throw new AppError('Choose a reviewed source original and its full fingerprint.');
  for(const [k,val] of form.entries()){if(k==='file'||k==='sha256')continue;if(typeof val!=='string'||!['claimId','documentType','otherDocumentType','sourceMessageId'].includes(k)||k in fields)throw new AppError('Invalid document destination.');fields[k]=val;}
  if(!fields.sourceMessageId)throw new AppError('The direct evidence upload requires an original message reference.');if(!file.size||file.size>400*1024)throw new AppError('Choose a source original up to 400 KB.',413);const doc=validateDamageSourceBytes(new Uint8Array(await file.arrayBuffer()),file.name,400*1024);
  if(createHash('sha256').update(doc.bytes).digest('hex')!==expected)throw new AppError('The original file did not match its reviewed fingerprint. Nothing was attached.');
  const result=await attachDamageIntakeOriginal(viewer,fields,doc);return NextResponse.json(result,{headers});
 }catch(e){const f=safeFailure(e,'ccr.damage-intake.document.direct');return NextResponse.json(f.body,{status:f.status,headers});}
}
