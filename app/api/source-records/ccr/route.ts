import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {routeCcrSource} from '@/lib/source-files/ccr-target';
export const dynamic='force-dynamic';
const json=(b:unknown,status=200)=>NextResponse.json(b,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);if(b.action!=='file'&&b.action!=='preview')throw new AppError('Choose a source filing action.');return json(await routeCcrSource(v,b.record,b.action==='file'));}catch(e){const f=safeFailure(e,'ccr.reviewed-source');return json(f.body,f.status);}}
