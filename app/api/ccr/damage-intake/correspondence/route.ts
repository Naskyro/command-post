import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {fileHistoricalGroup,historicalByCase} from '@/lib/ccr/damage-correspondence-server';
import {AppError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:NextRequest){try{const viewer=await requestViewer(req.headers);return json({messages:await historicalByCase(viewer,req.nextUrl.searchParams.get('id')||'')});}catch(e){const f=safeFailure(e,'ccr.damage.correspondence.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);if(!['file','check'].includes(String(b.action)))throw new AppError('Choose a correspondence action.');
 if(!Array.isArray(b.groups)||!b.groups.length||b.groups.length>4)throw new AppError('Check one to four claims per request.');
 const results=[];for(const g of b.groups){try{results.push(await fileHistoricalGroup(v,g,b.action==='file'));}catch(e){if(e instanceof ForbiddenError)throw e;const err=safeFailure(e,'ccr.damage.correspondence.case');results.push({error:err.body.error});}}return json({results});
}catch(e){const f=safeFailure(e,'ccr.damage.correspondence.write');return json(f.body,f.status);}}
