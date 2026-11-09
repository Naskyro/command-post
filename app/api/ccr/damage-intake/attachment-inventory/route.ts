import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {indexDamageSources,readDamageSources} from '@/lib/ccr/damage-attachment-index-server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function GET(req:NextRequest){try{if(req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();return json({documents:await readDamageSources(await requestViewer(req.headers),req.nextUrl.searchParams.get('id')||'')});}catch(e){const f=safeFailure(e,'ccr.damage.inventory.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);if(!['check','file'].includes(String(b.action)))throw new AppError('Select an inventory action.');return json(await indexDamageSources(v,b.packet,b.action==='file'));}catch(e){const f=safeFailure(e,'ccr.damage.inventory.file');return json(f.body,f.status);}}
