import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {courtImportReceipt} from '@/lib/ccr/docket-import-server';
import {docketAccess} from '@/lib/ccr/docket-model';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{
 if(req.nextUrl.search||req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError('Use the receipt check in Command.');
 const v=await requestViewer(req.headers);if(!v.person||v.id.startsWith('preview:')||!docketAccess(v,true))throw new ForbiddenError();
 const b=await readPayload(req);if(Object.keys(b).length!==1||!b.record)throw new AppError('Include one court manifest to verify.');
 return json(await courtImportReceipt(v,b.record));
 }catch(e){const f=safeFailure(e,'ccr.court.import.receipt');return json(f.body,f.status);}}
