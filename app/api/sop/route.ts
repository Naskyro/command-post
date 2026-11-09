import {NextResponse} from 'next/server';
import {context,library,change} from '@/lib/sop/server';
import {readPayload,safeFailure,ForbiddenError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
function failed(e:unknown){const f=safeFailure(e,'sop.library');return json(f.body,f.status);}
export async function GET(r:Request){try{return json(await library(await context(r)));}catch(e){return failed(e);}}
export async function POST(r:Request){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ForbiddenError();return json(await change(await context(r),await readPayload(r)));}catch(e){return failed(e);}}
