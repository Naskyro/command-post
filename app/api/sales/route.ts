import {NextResponse} from 'next/server';
import {context} from '@/lib/accounts/server';
import {salesProjection,saveSales} from '@/lib/sales/server';
import {readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){try{return json(salesProjection(await context(req)));}catch(e){const f=safeFailure(e,'sales.read');return json(f.body,f.status);}}
export async function POST(req:Request){try{return json({records:await saveSales(await readPayload(req),await context(req))});}catch(e){const f=safeFailure(e,'sales.write');return json(f.body,f.status);}}
