import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/accounts/server';
import {access,canRead,head} from '@/lib/accounts/policy';
import {importedPayments} from '@/lib/accounts/history';
import {portfolioRevenue} from '@/lib/accounts/dashboard';
import {ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const {all,viewer,staff}=await context(req);
 if(!access(viewer,'accounts')||!access(viewer,'performance'))throw new ForbiddenError();
 const scope=req.nextUrl.searchParams.get('assignee')??viewer.person;
 if(!head(viewer,staff)&&scope!==viewer.person)throw new ForbiddenError();
 const visible=all.filter(r=>r.kind==='account'&&canRead(viewer,r));
 return NextResponse.json(portfolioRevenue(visible,importedPayments,scope),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){const f=safeFailure(e,'accounts.dashboard');return NextResponse.json(f.body,{status:f.status});}}
