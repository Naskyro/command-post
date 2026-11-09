import {NextRequest,NextResponse} from 'next/server';
import {requestRoster,identify} from '@/lib/finance/server';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
import {uploadRegisterFile,downloadRegisterFile} from '@/lib/ccr/register-server';
import {isRegisterSection,registerSections,sectionAccess} from '@/lib/ccr/register-model';
import {readDocumentForm,readLargeDocumentBody} from '@/lib/ccr/document-input';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
export async function GET(req:NextRequest){try{const staff=await requestRoster(),v=identify(staff,req.headers),q=req.nextUrl.searchParams,s=q.get('section');if(!isRegisterSection(s))throw new AppError('Choose a register.');const {bytes,f}=await downloadRegisterFile(v,s,q.get('id')||'',q.get('file')||'',staff),name=encodeURIComponent(f.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));return new Response(bytes as BodyInit,{headers:{...headers,'Content-Security-Policy':"sandbox; default-src 'none'",'Content-Type':f.type,'Content-Length':String(bytes.byteLength),'Content-Disposition':"attachment; filename*=UTF-8''"+name}});}catch(e){const f=safeFailure(e,'ccr.register.file.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const staff=await requestRoster(),v=identify(staff,req.headers);if(!registerSections.some(s=>sectionAccess(v,s,true)))throw new ForbiddenError();
 const form=await readDocumentForm(req),s=form.get('section'),file=form.get('file');
 if(!isRegisterSection(s)||!(file instanceof File))throw new AppError('Choose the register and file.');
 return json(await uploadRegisterFile(v,s,String(form.get('id')||''),Number(form.get('version')),file,staff,form.get('documentType'),form.get('otherDocumentType')));
 }catch(e){const f=safeFailure(e,'ccr.register.file.save');return json(f.body,f.status);}}

export async function PUT(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const staff=await requestRoster(),v=identify(staff,req.headers);if(!sectionAccess(v,'tdlr',true))throw new ForbiddenError();
 // Grant + owner, optimistic version and classification are validated before reading the request stream.
 const header=(name:string)=>decodeURIComponent(req.headers.get(name)||'');
 return json(await uploadRegisterFile(v,'tdlr',header('x-record-id'),Number(req.headers.get('x-record-version')),{name:header('x-document-name'),read:()=>readLargeDocumentBody(req)},staff,header('x-document-type'),header('x-document-type-other')));
}catch(e){const f=safeFailure(e,'ccr.register.file.save');return json(f.body,f.status);}}
