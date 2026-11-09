import {NextRequest,NextResponse} from 'next/server';
import {requestRoster,identify} from '@/lib/finance/server';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
import {registerSections,sectionAccess,isRegisterSection} from '@/lib/ccr/register-model';
import {authorizeRegisterDocument,attachStagedRegisterFile} from '@/lib/ccr/register-server';
import {ccrMaxFileBytes,ccrTdlrFileBytes} from '@/lib/ccr/document-input';
import {handleDocumentStage} from '@/lib/ccr/document-stage-server';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
 const staff=await requestRoster(),v=identify(staff,req.headers);
 if(!registerSections.some(s=>sectionAccess(v,s,true)))throw new ForbiddenError();
 const section=(s:unknown)=>{if(!isRegisterSection(s))throw new AppError('Choose a register.');return s;};
 return json(await handleDocumentStage(req,v,'ccr-register',{
  maxBytes:f=>f.section==='tdlr'?ccrTdlrFileBytes:ccrMaxFileBytes,
  authorize:async f=>{await authorizeRegisterDocument(v,section(f.section),f.id,Number(f.version),staff,f.documentType,f.otherDocumentType);},
  attach:(doc,f)=>attachStagedRegisterFile(v,section(f.section),f.id,Number(f.version),doc,staff,f.documentType,f.otherDocumentType)
 }));
 }catch(e){const f=safeFailure(e,'ccr.register.document.stage');return json(f.body,f.status);}}
