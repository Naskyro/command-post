import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {startCourtStage,cancelCourtStage,putCourtPart,sealCourtGroup} from '@/lib/ccr/court-stage-server';
import {attachStagedCourtDocument} from '@/lib/ccr/court-files-server';
import {docketAccess} from '@/lib/ccr/docket-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
 const v=await requestViewer(req.headers);if(!v.person||v.id.startsWith('preview:')||!docketAccess(v,true))throw new ForbiddenError();
 if(req.nextUrl.searchParams.has('part')){const i=req.nextUrl.searchParams.get('part')||'';if(!/^\d{1,3}$/.test(i))throw new AppError('Invalid document part.');return json(await putCourtPart(v,req.nextUrl.searchParams.get('stage')||'',Number(i),req));}
 const b=await readPayload(req);if(b.action==='seal')return json(await sealCourtGroup(v,String(b.id||''),Number(b.group)));if(b.action==='start')return json(await startCourtStage(v,b));if(b.action==='cancel'){await cancelCourtStage(v,b.id);return json({ok:true});}
 if(b.action==='attach')return json(await attachStagedCourtDocument(v,String(b.matterId||''),Number(b.version),String(b.id||''),b.documentType,b.otherDocumentType));
 throw new AppError('Choose a valid upload action.');
 }catch(e){const f=safeFailure(e,'ccr.court.stage');return json(f.body,f.status);}}
