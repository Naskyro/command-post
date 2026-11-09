import { NextRequest,NextResponse } from 'next/server';
import { allRecords } from '@/lib/finance/server';
import { financeIdentity } from '@/lib/finance/identity';
import { readHrRecords,mutateHr,auditHrAccess,secureStorageAvailable } from '@/lib/hr/server';
import { canUseHiring,canReadVacancy,canReadCandidate,canCreateVacancyInDepartment,hiringRecordView,prepareHiring } from '@/lib/hr/hiring';
import { writeHiringPlan } from '@/lib/hr/hiring-server';
import {assignmentPlan,getEdition,vacancyDescriptionInput} from '@/lib/hr/job-catalog-server';
import {departmentFor} from '@/lib/people/departments';
import { hrCan } from '@/lib/hr/permissions';
import { readPayload,safeFailure,ForbiddenError } from '@/lib/shared/errors';

export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(request:NextRequest){try{
 const people=await allRecords(),viewer=financeIdentity(request.headers,people,{allowOnboarding:true});
 if(!canUseHiring(viewer))throw new ForbiddenError('Hiring administration is not assigned to your account.');
 const hr=await readHrRecords(),vacancies=hr.filter(record=>canReadVacancy(viewer,record,people)),candidates=hr.filter(record=>canReadCandidate(viewer,record,people,hr));
 await Promise.all(candidates.map(record=>auditHrAccess(record,viewer,'Viewed Applicant Record')));
 const departments=people.filter(record=>canCreateVacancyInDepartment(viewer,record)).map(record=>({id:record.id,name:record.name}));
 return json({linkableEmployeeIds:people.filter(row=>row.kind==='person'&&['Active','Onboarding','Leave'].includes(String(row.status))&&hrCan(viewer,'manageOnboarding',row.id,people)&&!hr.some(candidate=>candidate.kind==='candidate'&&candidate.data.employeeId===row.id)).map(row=>row.id),vacancies:vacancies.map(record=>hiringRecordView(record,viewer,people,hr)),candidates:candidates.map(record=>hiringRecordView(record,viewer,people,hr)),departments,positions:hr.filter(record=>record.kind==='position'&&record.data.status==='Active').map(record=>({id:record.id,title:record.data.title,department:departmentFor(people,record.data.department)?.id||record.data.department})).filter(position=>!position.department||departments.some(d=>d.id===position.department||d.name===position.department)),canCreate:departments.length>0,canEdit:canUseHiring(viewer,true),secureStorageAvailable:secureStorageAvailable()});
}catch(error){const failure=safeFailure(error,'hr.hiring.read');return json(failure.body,failure.status);}}
export async function POST(request:NextRequest){try{
 if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError('Cross-origin request rejected.');
 const people=await allRecords(),viewer=financeIdentity(request.headers,people,{allowOnboarding:true});
 if(!canUseHiring(viewer,true))throw new ForbiddenError('Hiring administration is not assigned to your account.');
 const body=await readPayload(request),hr=await readHrRecords();if(body.action==='delete'){return json({record:await mutateHr(body,viewer,people,hr)});}const validated=await vacancyDescriptionInput(body,viewer,people,hr),plan=prepareHiring(validated.body,viewer,people,hr);
 if(plan.record.kind==='vacancy'&&(!plan.old||validated.edition))plan.record.data.catalogWorkflow=true;
 if(validated.edition)plan.record.data.jobDescriptionTitle=validated.edition.content.title;
 else if(plan.record.kind==='vacancy'&&!plan.record.data.jobDescriptionId)delete plan.record.data.jobDescriptionTitle;
 let extra:D1PreparedStatement[]=[],linkedSetup=plan.onboarding;
 if(plan.linking&&!plan.old?.data.employeeId){
  const vacancy=hr.find(r=>r.kind==='vacancy'&&r.id===plan.record.data.vacancyId);
  if(vacancy?.data.jobDescriptionId){
   const edition=await getEdition(vacancy.data.jobDescriptionId,vacancy.data.jobDescriptionVersion,viewer,people);
   const assign=await assignmentPlan(edition,plan.record.personId!,viewer,people,hr,{newSetup:plan.onboarding,pinnedVacancy:true});
   if(assign.statements.length){plan.onboarding=undefined;extra=assign.statements;linkedSetup=assign.setup;}
  }
 }
 const record=await writeHiringPlan(plan,viewer,extra);
 const updated=[...hr.filter(row=>row.id!==record.id&&row.id!==linkedSetup?.id),record,...(linkedSetup?[linkedSetup]:[])];
 return json({record:hiringRecordView(record,viewer,people,updated),onboardingId:linkedSetup?.id||null});
}catch(error){const failure=safeFailure(error,'hr.hiring.write');return json(failure.body,failure.status);}}
