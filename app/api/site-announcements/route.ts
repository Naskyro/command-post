import {NextResponse} from 'next/server';
import {context,feed,change} from '@/lib/site-announcements/server';
import {ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(r:Request){try{return json(feed(await context(r),new URL(r.url).searchParams.get('admin')==='1'));}catch(e){const f=safeFailure(e,'site-announcements.read');return json(f.body,f.status);}}
export async function POST(r:Request){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ForbiddenError();return json(await change(await context(r),await readPayload(r)));}catch(e){const f=safeFailure(e,'site-announcements.write');return json(f.body,f.status);}}
