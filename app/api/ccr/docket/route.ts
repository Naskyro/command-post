import {NextRequest,NextResponse} from 'next/server';
import {requestViewer} from '@/lib/finance/server';
import {counselGrant} from '@/lib/ccr/court-counsel-server';
import {docketAccess} from '@/lib/ccr/docket-model';
import {docket,updateMatter,propertyOptions} from '@/lib/ccr/docket-server';
import {readPayload,safeFailure,ForbiddenError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{const v=await requestViewer(req.headers);const [rows,properties,counsel]=await Promise.all([docket(v),propertyOptions(v),counselGrant(v)]);return json({rows,canEdit:docketAccess(v,true),properties,counsel});}catch(e){const f=safeFailure(e,'ccr.docket.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();const v=await requestViewer(req.headers);return json(await updateMatter(v,await readPayload(req)));}catch(e){const f=safeFailure(e,'ccr.docket.write');return json(f.body,f.status);}}
