import {NextRequest,NextResponse} from 'next/server';
import {financeIdentity} from '@/lib/finance/identity';
import {allRecords} from '@/lib/finance/server';
import {can,canUseHr} from '@/lib/hr/workflow';
import {isPendingNewHire} from '@/lib/hr/sop-readiness';
import {onboardingSopProgress} from '@/lib/sop/onboarding';
import {ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
/** Scope-checked counts and receipt labels only. Supervisors cannot sign or open restricted policy text via this endpoint. */
export async function GET(request:NextRequest){try{
 const people=await allRecords(),v=financeIdentity(request.headers,people),id=request.nextUrl.searchParams.get('person'),p=people.find(x=>x.kind==='person'&&x.id===id);
 if(!p||!canUseHr(v)||v.onboardingOnly||!isPendingNewHire(p)||!['manageOnboarding','approveStart'].some(a=>can(v,a,p.id,people)))throw new ForbiddenError();
 const s=await onboardingSopProgress(p,people);
 return json({required:s.required,signed:s.signed,policies:s.policies.map(x=>({id:x.id,version:x.version,code:x.code,content:{title:x.content.title},signature:x.signature?{signerName:x.signature.signerName,signedAt:x.signature.signedAt}:undefined}))});
}catch(e){const f=safeFailure(e,'hr.onboardingSop');return json(f.body,f.status);}}
