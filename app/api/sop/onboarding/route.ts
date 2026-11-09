import {NextResponse} from 'next/server';
import {onboardingViewer,onboardingSopProgress,assignedPolicy,signCurrent,recordPolicyOpened,bulkSignCurrent} from '@/lib/sop/onboarding';
import {safeFailure,readPayload,ForbiddenError} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(x:unknown,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'private, no-store'}});
function fail(e:unknown){const f=safeFailure(e,'sop.onboarding');return json(f.body,f.status);}
export async function GET(r:Request){try{const {p,records}=await onboardingViewer(r);return json(await onboardingSopProgress(p,records));}catch(e){return fail(e);}}
export async function POST(r:Request){try{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ForbiddenError();const {p,records,v}=await onboardingViewer(r),b=await readPayload(r);if(b.action==='opened')return json(await recordPolicyOpened(p,records,String(b.id),Number(b.version),true,b.accessEdition));if(b.action==='signAll')return json(await bulkSignCurrent(v,p,records,b,true));const doc=await assignedPolicy(p,records,String(b.id),Number(b.version));return json({signature:await signCurrent(v,p,doc,b),id:doc.id,version:doc.version});}catch(e){return fail(e);}}
