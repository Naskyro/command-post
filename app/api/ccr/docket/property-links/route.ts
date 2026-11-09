import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {manyPropertyLinks,reconcilePropertyCourt,reviewPropertyCourt} from '@/lib/ccr/property-link-reconcile';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);return json(b.action==='review'||b.action==='save-review'?await reviewPropertyCourt(v,b.action,b.record):b.records!==undefined?await manyPropertyLinks(v,b.action,b.records):await reconcilePropertyCourt(v,b.action,b.record));}catch(e){const f=safeFailure(e,'ccr.court.property-links');return json(f.body,f.status);}}
