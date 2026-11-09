import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {safeFailure,ForbiddenError,AppError} from '@/lib/shared/errors';
import {docketAccess} from '@/lib/ccr/docket-model';
import {readDocumentForm} from '@/lib/ccr/document-input';
import {attachCourtDocument,readCourtDocument} from '@/lib/ccr/court-files-server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
export async function POST(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const v=await requestViewer(req.headers);if(!docketAccess(v,true))throw new ForbiddenError();
 const fd=await readDocumentForm(req,448*1024),file=fd.get('file');if(!(file instanceof File))throw new AppError('Choose the court document to upload.');
 return json(await attachCourtDocument(v,String(fd.get('id')||''),Number(fd.get('version')),file,fd.get('documentType'),fd.get('otherDocumentType')));
 }catch(e){const f=safeFailure(e,'ccr.court.document.upload');return json(f.body,f.status);}}
export async function GET(req:NextRequest){try{
 const v=await requestViewer(req.headers),q=req.nextUrl.searchParams,{doc,bytes}=await readCourtDocument(v,q.get('id')||'',q.get('file')||'');
 const name=encodeURIComponent(doc.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));return new Response(bytes as BodyInit,{headers:{...headers,'Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':"attachment; filename*=UTF-8''"+name,'Content-Type':doc.type,'Content-Length':String(doc.bytes)}});
 }catch(e){const f=safeFailure(e,'ccr.court.document.read');return json(f.body,f.status);}}
