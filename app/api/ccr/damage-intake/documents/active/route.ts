import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {findDamageActive} from '@/lib/ccr/damage-active-stage';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:NextRequest){try{if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();const v=await requestViewer(req.headers),b=await readPayload(req);return NextResponse.json(await findDamageActive(v,b.candidates),{headers});}catch(e){const f=safeFailure(e,'ccr.damage.selected-active');return NextResponse.json(f.body,{status:f.status,headers});}}
