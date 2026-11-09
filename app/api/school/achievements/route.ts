import {NextResponse} from 'next/server';
import {context,personnel} from '@/lib/school/server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const ctx=await context(r);return NextResponse.json(await personnel(ctx,new URL(r.url).searchParams.get('personId')||ctx.v.person),{headers:{'Cache-Control':'private, no-store'}});}catch(e){const f=safeFailure(e,'school.personnel');return NextResponse.json(f.body,{status:f.status});}}
