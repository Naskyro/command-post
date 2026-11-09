import {NextResponse} from 'next/server';
import {readPractice} from '@/lib/sales/practice';
import {context} from '@/lib/accounts/server';
import {routeProjection,routeAction} from '@/lib/sales/routes';
import {readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(d:unknown,s=200)=>NextResponse.json(d,{status:s,headers:{'Cache-Control':'private, no-store'}});
export async function GET(r:Request){try{const ctx=await context(r);return json(routeProjection(ctx,(await readPractice(ctx.viewer.person,ctx.all)).dismissed));}catch(e){const f=safeFailure(e,'sales.routes.read');return json(f.body,f.status);}}
export async function POST(r:Request){try{return json(await routeAction(await readPayload(r),await context(r)));}catch(e){const f=safeFailure(e,'sales.routes.write');return json(f.body,f.status);}}
