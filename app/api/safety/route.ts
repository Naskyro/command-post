import {NextRequest,NextResponse} from 'next/server';
import {safetyContext,safetyData,saveSafety} from '@/lib/safety/server';
import {readPayload,safeFailure,ForbiddenError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:NextRequest){try{return json(safetyData(await safetyContext(req),req.nextUrl.searchParams.get('mode')==='alerts'));}catch(e){const f=safeFailure(e,'safety.read');return json(f.body,f.status);}}
export async function POST(req:NextRequest){try{if(req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();const body=await readPayload(req),ctx=await safetyContext(req);return json({records:await saveSafety(body,ctx)});}catch(e){const f=safeFailure(e,'safety.write');return json(f.body,f.status);}}
