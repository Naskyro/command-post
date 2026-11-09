import {NextRequest,NextResponse} from 'next/server';
import {loadPortfolioReport} from '@/lib/accounts/portfolio-reports-server';
import {safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(req:NextRequest){try{return NextResponse.json(await loadPortfolioReport(req,req.nextUrl.searchParams),{headers});}catch(e){const f=safeFailure(e,'accounts.portfolio-reports.read');return NextResponse.json(f.body,{status:f.status,headers});}}
