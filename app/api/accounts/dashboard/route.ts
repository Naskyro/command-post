import {NextRequest,NextResponse} from 'next/server';
import {context} from '@/lib/accounts/server';
import {access,canRead} from '@/lib/accounts/policy';
import {importedPayments} from '@/lib/accounts/history';
import {portfolioRevenue} from '@/lib/accounts/dashboard';
import {ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const {all,viewer}=await context(req);
 if(!access(viewer,'accounts')||!access(viewer,'performance'))throw new ForbiddenError();
 const visible=all.filter(r=>r.kind==='account'&&canRead(viewer,r));
 return NextResponse.json(portfolioRevenue(visible,importedPayments,req.nextUrl.searchParams.get('assignee')||''),{headers:{'Cache-Control':'private, no-store'}});
}catch(e){const f=safeFailure(e,'accounts.dashboard');return NextResponse.json(f.body,{status:f.status});}}
