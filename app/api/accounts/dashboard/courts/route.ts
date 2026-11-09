import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/accounts/server';
import {today} from '@/lib/accounts/model';
import {accountCourtBrief} from '@/lib/ccr/docket-server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const {viewer,all,staff}=await context(req),scope=req.nextUrl.searchParams.get('assignee')??viewer.person;
 return NextResponse.json(await accountCourtBrief(viewer,all,staff,scope,today()),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){const f=safeFailure(e,'account.dashboard.courts');return NextResponse.json(f.body,{status:f.status,headers:{'Cache-Control':'private, no-store'}});}}
