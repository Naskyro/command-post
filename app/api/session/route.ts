import {authDestination} from '@/lib/auth/edge-identity';
import {NextRequest,NextResponse} from 'next/server';
import {requestRoster} from '@/lib/finance/server';
import {financeIdentity,FinanceAccessError,linkedPerson} from '@/lib/finance/identity';
import {financeDb} from '@/db/finance';
export const dynamic='force-dynamic';
async function event(v:ReturnType<typeof financeIdentity>,action:string,id:string){const at=new Date().toISOString();await financeDb().prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'session:'+id,v.name,v.id,at,action,null,JSON.stringify({kind:'session',person:v.person,action,at})).run();}
export async function GET(request:NextRequest){
  const headers={'Cache-Control':'private, no-store'};
  let records:Awaited<ReturnType<typeof requestRoster>>|undefined;
  try {
    records=await requestRoster();
    const viewer=financeIdentity(request.headers,records,{allowOnboarding:true});
    const response=NextResponse.json({viewer},{headers});
    if(!request.cookies.get('cp_activity_session')){
      const id=crypto.randomUUID();
      await event(viewer,'Authenticated Session Started',id);
      response.cookies.set('cp_activity_session',id,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:43200});
    }
    return response;
  }catch(e){
    let reportingOnly=false;
    // A disabled, positively linked employee can still report privately. Do not establish
    // an operational session, return personnel data, or offer the restricted inbox to a stranger.
    if(e instanceof FinanceAccessError && e.status===403 && records){
      try { reportingOnly=linkedPerson(request.headers,records).p.accountStatus==='Disabled'; }
      catch { /* Unlinked sign-ins have no access. */ }
    }
    return NextResponse.json({error:e instanceof Error?e.message:'Unable to load your account',email:request.headers.get('oai-authenticated-user-email')||'',signInUrl:authDestination(request.headers),...(reportingOnly?{reportingOnly:true}:{})},{status:e instanceof FinanceAccessError?e.status:400,headers});
  }
}
export async function POST(request:NextRequest){try{if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Cross-origin request rejected.'},{status:403});const viewer=financeIdentity(request.headers,await requestRoster(),{allowOnboarding:true});await event(viewer,'Sign-Out Requested',request.cookies.get('cp_activity_session')?.value||crypto.randomUUID());const response=NextResponse.json({redirect:authDestination(request.headers,true)});response.cookies.delete('cp_activity_session');return response;}catch{return NextResponse.json({error:'Could not record sign-out. Please retry.'},{status:400});}}
