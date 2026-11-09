import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {ingestPerson,personnelIndex} from '@/lib/source-records/hr-server';
import {safeFailure,ForbiddenError,readPayload} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);return json(await ingestPerson(v,b.action,b.record));}catch(e){const f=safeFailure(e,'hr.source.transfer');return json(f.body,f.status);}}
export async function GET(req:NextRequest){try{const v=await requestViewer(req.headers),q=req.nextUrl.searchParams;return json(await personnelIndex(v,q.get('person')||'',q.get('history')==='1'));}catch(e){const f=safeFailure(e,'hr.source.index');return json(f.body,f.status);}}
