import {NextRequest,NextResponse} from 'next/server';
import {requestRoster} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {safeFailure} from '@/lib/shared/errors';
import {assertDeskDocket,deskCaseView,lookupDeskCase} from '@/lib/ccr/source-desk-lookup';
import {sourceDeskGrants} from '@/lib/ccr/source-desk-server';
export const dynamic='force-dynamic';
const json=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
export async function GET(req:NextRequest){try{
 const staff=await requestRoster(),v=financeIdentity(req.headers,staff),q=req.nextUrl.searchParams;
 if(!q.has('number')&&!q.has('id'))return json(await sourceDeskGrants(v,staff));
 assertDeskDocket(v);
 const {docket,matterById}=await import('@/lib/ccr/docket-server');
 if(q.has('id'))return json({record:deskCaseView(await matterById(q.get('id')||''))});
 return json(await lookupDeskCase(v,q.get('number')||'',docket));
 }catch(e){const f=safeFailure(e,'ccr.source-desk.read');return json(f.body,f.status);}}
