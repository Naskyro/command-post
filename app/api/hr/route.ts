import {correctiveRecordView} from '@/lib/hr/corrective-record-view';
import {canAccess} from '@/lib/finance/access';
import {canRemoveHr} from '@/lib/hr/record-removal';
import {orgChartNodes} from '@/lib/hr/org-chart';
import { buildHrDashboard } from '@/lib/hr/dashboard';
import type { FinRecord } from '@/lib/finance/model';
import { NextRequest,NextResponse } from 'next/server';
import { allRecords } from '@/lib/finance/server';
import { financeIdentity } from '@/lib/finance/identity';
import { personView, canReadPay, pickPerson, payFields } from '@/lib/people/policy';
import {liveOnboardingReadiness} from '@/lib/hr/sop-readiness-server';
import { hrActions } from '@/lib/hr/permissions';
import { canSeparatePerson } from '@/lib/hr/separation';
import { can,canReadRecord,listRecord,readiness,canUseHr,onboardingRecordView } from '@/lib/hr/workflow';
import { readHrRecords,mutateHr,secureStorageAvailable,hrHistory,auditHrAccess } from '@/lib/hr/server';
import { readPayload,safeFailure,ForbiddenError,AppError } from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){try{
 const finance=await allRecords(),viewer=financeIdentity(request.headers,finance,{allowOnboarding:true});if(!canUseHr(viewer))throw new ForbiddenError();const hr=await readHrRecords();
 const id=request.nextUrl.searchParams.get('id')||request.nextUrl.searchParams.get('history');
 if(id){const record=hr.find(r=>r.id===id);if(!record)throw new AppError('Record not found.',404);if(!canReadRecord(record,viewer,finance,hr))throw new ForbiddenError();if(request.nextUrl.searchParams.has('history')){if(!canAccess(viewer,'Admin','activity'))throw new ForbiddenError();if(!['viewPersonnel','managePersonnel','manageTwc','exportPersonnel'].some(action=>can(viewer,action,record.personId,finance)))throw new ForbiddenError('Audit history access is not assigned to you.');await auditHrAccess(record,viewer,'Viewed Audit History');return json({history:await hrHistory(id)});}await auditHrAccess(record,viewer,'Viewed Record');const person=finance.find(p=>p.kind==='person'&&p.id===record.personId);return json({record:record.kind==='document'?listRecord(record):record.kind==='onboarding'?onboardingRecordView({...record,data:{...record.data,readiness:person?await liveOnboardingReadiness(record,person,finance,hr):{ready:false,issues:['Employee Record']}}},viewer,finance):await correctiveRecordView(record,viewer,finance)});}
 const people=finance.filter(r=>r.kind==='person'&&(r.id===viewer.person||!viewer.onboardingOnly&&Object.keys(hrActions).some(action=>can(viewer,action,r.id,finance)))).map(p=>{const safe:FinRecord={...personView(p,viewer,finance,'hr'),...(canReadPay(viewer,p,finance)?pickPerson(p,payFields):{}),canSeparate:canSeparatePerson(viewer,p,finance)};if(can(viewer,'manageOffboarding',p.id,finance))safe.accountStatus=p.accountStatus;if(!can(viewer,'managePersonnel',p.id,finance)){delete safe.profileNotes;delete safe.onboardingChecks;}return safe;});
 const records=await Promise.all(hr.filter(r=>canReadRecord(r,viewer,finance,hr)).map(async r=>{const safe={...await correctiveRecordView(listRecord(r),viewer,finance)};safe.data={...safe.data,canDelete:canRemoveHr(viewer,r,finance,hr)};if(r.kind==='onboarding'){const p=finance.find(p=>p.id===r.personId);return onboardingRecordView({...safe,data:{...safe.data,readiness:p?await liveOnboardingReadiness(r,p,finance,hr):{ready:false,issues:['Employee Record']}}},viewer,finance);}return safe;}));
 return json({viewer,people,records,orgNodes:orgChartNodes(viewer,finance),departments:finance.filter(r=>r.kind==='department'),...buildHrDashboard(viewer,finance),permissions:Object.keys(hrActions).filter(action=>['managePositions','managePolicies','manageSettings'].includes(action)?can(viewer,action,undefined,finance):people.some(p=>can(viewer,action,p.id,finance))),secureStorageAvailable:secureStorageAvailable()});
}catch(e){const f=safeFailure(e,'hr.read');return json(f.body,f.status);}}
export async function POST(request:NextRequest){try{if(request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');const body=await readPayload(request),finance=await allRecords(),viewer=financeIdentity(request.headers,finance,{allowOnboarding:true}),records=await readHrRecords(),record=await mutateHr(body,viewer,finance,records);return json({record:record.kind==='onboarding'?onboardingRecordView(record,viewer,finance):await correctiveRecordView(listRecord(record),viewer,finance)});}catch(e){const f=safeFailure(e,'hr.write');return json(f.body,f.status);}}
