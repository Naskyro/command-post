import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {propertyCases,savePropertyCase} from '@/lib/ccr/property-court-server';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:NextRequest){try{return json(await propertyCases(await requestViewer(req.headers),req.nextUrl.searchParams.get('accountId')));}catch(e){const f=safeFailure(e,'account.court.list');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();return json(await savePropertyCase(await requestViewer(req.headers),await readPayload(req)));}catch(e){const f=safeFailure(e,'account.court.write');return json(f.body,f.status);}}
