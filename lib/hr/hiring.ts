import { displayPersonName } from '../people/display-name.ts';
import type { FinRecord, Viewer } from '../finance/model';
import type { HrRecord } from './model';
import { blankOnboarding,onboardingStepsFor } from './model.ts';
import {getPayCatalog,resolvePayChoices,savedPayComponents,displayVacancyRate} from './vacancy-choices.ts';
import {departmentFor} from '../people/departments.ts';
import { hrCan, hrTeamContains } from './permissions.ts';
import { canAccess } from '../finance/access.ts';
import { readiness } from './workflow.ts';
import { AppError, ConflictError, ForbiddenError } from '../shared/errors.ts';

export const vacancyStatuses=['Draft','Open','On Hold','Filled','Closed'] as const;
export const applicantStages=['Applied','Interviewing','Offer','Declined','Withdrawn'] as const;
export const hiringPayTypes=['Hourly','Hourly + commission','Salary + commission','Salary exempt','Net salary','Per tow','Pending method','Owner payment'] as const;
export type HiringPlan={record:HrRecord;old?:HrRecord;onboarding?:HrRecord;linking:boolean};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const ownGrant=(viewer:Viewer)=>viewer.hrResponsibilities?.find(grant=>grant.action==='manageOnboarding');
export const canUseHiring=(viewer:Viewer,edit=false)=>!viewer.onboardingOnly&&canAccess(viewer,'People & HR','hiring',edit)&&(viewer.owner||!!ownGrant(viewer));

/** Hiring access follows an assigned responsibility, not a job title or a generic manager flag. */
export function canReadVacancy(viewer:Viewer,vacancy:Pick<HrRecord,'kind'|'data'>,people:FinRecord[],edit=false):boolean {
 if(vacancy.kind!=='vacancy'||!canUseHiring(viewer,edit))return false;
 if(viewer.owner)return true;
 const grant=ownGrant(viewer);if(!grant)return false;
 if(grant.scope==='Company')return true;
 if(grant.scope==='Department')return vacancy.data.departmentId===people.find(row=>row.kind==='department'&&row.name===viewer.department)?.id||vacancy.data.departmentName===viewer.department;
 if(grant.scope==='Team')return hrTeamContains(viewer,String(vacancy.data.ownerId||''),people);
 return grant.scope==='Self'&&vacancy.data.ownerId===viewer.person;
}
export function canCreateVacancyInDepartment(viewer:Viewer,department:FinRecord):boolean {
 if(department.kind!=='department'||department.status==='Retired'||!canUseHiring(viewer,true))return false;
 return viewer.owner||ownGrant(viewer)?.scope==='Company'||department.name===viewer.department;
}
export function canReadCandidate(viewer:Viewer,candidate:HrRecord,people:FinRecord[],hr:HrRecord[],edit=false):boolean {
 const vacancy=hr.find(record=>record.id===candidate.data.vacancyId&&record.kind==='vacancy');
 return candidate.kind==='candidate'&&!!vacancy&&canReadVacancy(viewer,vacancy,people,edit);
}
export function candidateStage(candidate:HrRecord,people:FinRecord[],hr:HrRecord[]):string {
 if(!candidate.data.employeeId)return String(candidate.data.stage||'Applied');
 const employee=people.find(person=>person.kind==='person'&&person.id===candidate.data.employeeId);
 const setup=hr.find(record=>record.kind==='onboarding'&&record.personId===candidate.data.employeeId);
 return employee?.onboardingClearedAt||setup?.data.status==='Cleared'?'Hired':'Onboarding';
}
export function hiringRecordView(record:HrRecord,viewer:Viewer,people:FinRecord[],hr:HrRecord[]):HrRecord {
 let progress:Record<string,unknown>={};
 if(record.kind==='candidate'&&record.data.employeeId){
  const employee=people.find(person=>person.kind==='person'&&person.id===record.data.employeeId),setup=hr.find(row=>row.kind==='onboarding'&&row.personId===record.data.employeeId),stage=candidateStage(record,people,hr),total=onboardingStepsFor(employee,setup?.data,people).length;
  const completed=stage==='Hired'?total:setup&&employee?Math.max(0,total-readiness(setup,employee,hr,people).issues.length):0;
  progress={employeeName:displayPersonName(employee),onboardingProgress:{completed,total,percent:Math.round(completed/total*100),status:stage}};
 }
 return {...record,data:{...record.data,...(record.kind==='candidate'?{stage:candidateStage(record,people,hr),...progress}:{department:record.data.departmentName}),canEdit:record.kind==='vacancy'?canReadVacancy(viewer,record,people,true):canReadCandidate(viewer,record,people,hr,true)}};
}
const vacancyFields=['title','positionId','departmentId','jobDescription','jobDescriptionDocumentId','jobDescriptionId','jobDescriptionVersion','payType','payChoiceIds','rate','payDetails','targetCloseDate','status'];
const candidateFields=['vacancyId','fullName','email','phone','resumeDocumentId','stage'];
function validateDate(value:unknown,label:string){if(!value)return;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new AppError('Enter a valid '+label+'.');}
function readInput(value:unknown,allowed:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('Submit the hiring details.');
 const input:Record<string,unknown>={};
 for(const [key,raw] of Object.entries(value)){
  if(!allowed.includes(key))throw new AppError('This hiring action cannot change '+key+'.');
  if(key==='jobDescriptionVersion'){if(!Number.isSafeInteger(raw)||Number(raw)<0)throw new AppError('Choose a valid job description edition.');input[key]=raw;continue;}
  if(key==='payChoiceIds'){input[key]=raw;continue;}
  if(key==='rate'){if(raw!==''&&raw!==null&&(typeof raw!=='number'||!Number.isFinite(raw)||raw<0))throw new AppError('Enter a valid offered pay amount.');input[key]=raw===''||raw===null?'':raw;continue;}
  if(typeof raw!=='string')throw new AppError('Enter text for '+key+'.');
  const limit=key==='jobDescription'?30000:key==='payDetails'?5000:250;
  if(raw.length>limit)throw new AppError('Shorten '+key+' to '+limit+' characters or fewer.');
  input[key]=raw.trim();
 }
 return input;
}
function baseRecord(id:string,kind:'vacancy'|'candidate',old:HrRecord|undefined,viewer:Viewer,at:string):HrRecord{return {id,kind,personId:old?.personId,version:(old?.version||0)+1,createdAt:old?.createdAt||at,createdBy:old?.createdBy||viewer.name,updatedAt:at,updatedBy:viewer.name,data:{...old?.data}};}
function requireVersion(body:Record<string,unknown>,old:HrRecord|undefined){if(!Number.isInteger(body.version)||Number(body.version)<0||body.version!==(old?.version||0))throw new ConflictError('This hiring record changed. Refresh before saving.');}
function documentReference(id:unknown,category:string,viewer:Viewer,people:FinRecord[],hr:HrRecord[]){
 if(!id)return;
 const record=hr.find(row=>row.id===id&&row.kind==='document'&&row.data.category===category);
 if(!record||!record.personId||!hrCan(viewer,'manageOnboarding',record.personId,people))throw new ForbiddenError('Choose an authorized '+category.toLowerCase()+' document.');
}

/** The offer's rate unit and the job description's pay classification use different catalogs. */
function onboardingPayTerms(data:Record<string,unknown>){
 const arrangement=text(data.payType),details=text(data.payDetails);
 const tracked=Array.isArray(data.payComponents)?savedPayComponents(data):[],unit=tracked[0]?.unit;
 const hourly=unit?unit==='Hour':arrangement==='Hourly'||arrangement==='Hourly + commission';
 const salaried=unit?unit==='Week':['Salary + commission','Salary exempt','Net salary'].includes(arrangement);
 const perTow=unit?unit==='Tow':arrangement==='Per tow';
 return {
  offerBasis:hourly?'Hour':salaried?'Week':perTow?'Tow':unit==='Percentage'?'Commission':'',
  regularRate:tracked.length&&!hourly&&!salaried&&!perTow?'':data.rate===undefined?'':String(data.rate),
  descriptionBasis:hourly?'Hourly':salaried?'Salaried':perTow||unit==='Percentage'?'Commission':'',
  terms:[tracked.length?tracked.map(c=>c.label).join(' · '):arrangement&&arrangement!=='Hourly'?arrangement:'',tracked.length&&!hourly&&!salaried&&!perTow?displayVacancyRate(data):'',details].filter(Boolean).join('\n'),
 };
}

export function prepareHiring(body:Record<string,unknown>,viewer:Viewer,people:FinRecord[],hr:HrRecord[],at=new Date().toISOString()):HiringPlan {
 if(!canUseHiring(viewer,true))throw new ForbiddenError('Hiring administration is not assigned to your account.');
 const action=text(body.action),id=text(body.id);
 if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(id))throw new AppError('Choose a valid hiring record.');
 const old=hr.find(record=>record.id===id);requireVersion(body,old);
 if(action==='saveVacancy'){
  if(old&&old.kind!=='vacancy')throw new AppError('Choose a job opening.');
  if(old&&!canReadVacancy(viewer,old,people,true))throw new ForbiddenError('This opening is outside your hiring responsibility.');
  const input=readInput(body.data,vacancyFields),next=baseRecord(id,'vacancy',old,viewer,at),data:Record<string,unknown>={...next.data,...input,ownerId:old?.data.ownerId||viewer.person};
  const department=people.find(row=>row.kind==='department'&&row.id===data.departmentId);
  if(!department||(!old||old.data.departmentId!==department.id)&&!canCreateVacancyInDepartment(viewer,department))throw new ForbiddenError('Choose an active department within your hiring responsibility.');
  if(!text(data.title))throw new AppError('Enter the position title.');
  if(!vacancyStatuses.includes(String(data.status||'Draft') as typeof vacancyStatuses[number]))throw new AppError('Choose a valid opening status.');
  if(data.positionId&&!hr.some(row=>row.kind==='position'&&row.id===data.positionId&&(row.data.status==='Active'||row.id===old?.data.positionId)))throw new AppError('Choose an active position from the catalog.');
  if(input.payChoiceIds!==undefined){
   const parts=resolvePayChoices(input.payChoiceIds,getPayCatalog(people),savedPayComponents(old?.data));
   data.payComponents=parts;data.payChoiceIds=parts.map(p=>p.id);data.payType=parts[0]?.legacy||parts[0]?.label||'';
  }else if(input.payType!==undefined&&old?.data.payComponents&&input.payType!==old.data.payType){throw new AppError('Edit the saved pay components to change this arrangement.');}
  const position=hr.find(r=>r.kind==='position'&&r.id===data.positionId);
  if(position?.data.department&&(!old||old.data.departmentId!==department.id||old.data.positionId!==position.id)){
   const positionDept=departmentFor(people,position.data.department);
   if(positionDept&&positionDept.id!==department.id)throw new AppError('Choose a position in the selected department.');
  }
  if(!Array.isArray(data.payComponents)&&data.payType&&!hiringPayTypes.includes(String(data.payType) as typeof hiringPayTypes[number]))throw new AppError('Choose a valid pay arrangement.');
  if(data.status==='Open'){
   if(!text(data.jobDescription))throw new AppError('Add the job description before opening this position.');
   if(!text(data.payType)||(Array.isArray(data.payComponents)?savedPayComponents(data).some(c=>c.id==='pending'):data.payType==='Pending method'))throw new AppError('Choose the pay arrangement before opening this position.');
   if((typeof data.rate!=='number'||!Number.isFinite(data.rate))&&!text(data.payDetails))throw new AppError('Enter the offered pay amount or compensation details before opening this position.');
   if(!data.targetCloseDate)throw new AppError('Enter the target close date before opening this position.');
  }
  validateDate(data.targetCloseDate,'target close date');documentReference(data.jobDescriptionDocumentId,'Job Description',viewer,people,hr);
  if(data.status==='Open'&&old?.data.status!=='Open'&&!data.openedAt)data.openedAt=at;
  if(data.status==='Filled'&&old?.data.status!=='Filled')data.filledAt=at;
  else if(old?.data.status==='Filled'&&data.status!=='Filled')delete data.filledAt;
  next.data={...data,departmentName:String(department.name),status:data.status||'Draft'};
  return {record:next,old,linking:false};
 }
 if(action==='saveCandidate'){
  if(old&&old.kind!=='candidate')throw new AppError('Choose an applicant.');
  if(old&&!canReadCandidate(viewer,old,people,hr,true))throw new ForbiddenError('This applicant is outside your hiring responsibility.');
  const input=readInput(body.data,candidateFields),next=baseRecord(id,'candidate',old,viewer,at),data={...next.data,...input};
  const vacancy=hr.find(row=>row.kind==='vacancy'&&row.id===data.vacancyId);
  if(!vacancy||!canReadVacancy(viewer,vacancy,people,true))throw new ForbiddenError('Choose an opening within your hiring responsibility.');
  if(!old&&['Filled','Closed'].includes(String(vacancy.data.status)))throw new AppError('Reopen this position before adding a candidate.');
  if(old?.data.employeeId&&data.vacancyId!==old.data.vacancyId)throw new AppError('A linked applicant stays with the original opening.');
  if(!text(data.fullName))throw new AppError('Enter the applicant’s full name.');
  data.email=text(data.email).toLowerCase();
  if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email)))throw new AppError('Enter a valid applicant email.');
  if(data.email&&hr.some(row=>row.kind==='candidate'&&row.id!==id&&row.data.vacancyId===data.vacancyId&&text(row.data.email).toLowerCase()===data.email))throw new AppError('This email already has an applicant record for this opening.');
  if(data.phone&&(!/^[+\d().\-\s#xext]+$/i.test(String(data.phone))||String(data.phone).replace(/\D/g,'').length<7))throw new AppError('Enter a valid applicant phone number.');
  if(old?.data.employeeId){if(input.stage!==undefined&&input.stage!==candidateStage(old,people,hr))throw new AppError('Onboarding progress determines the stage of a linked employee.');data.stage=candidateStage(old,people,hr);}
  else if(!applicantStages.includes(String(data.stage||'Applied') as typeof applicantStages[number]))throw new AppError('Onboarding and Hired stages require a linked employee and completed onboarding.');
  documentReference(data.resumeDocumentId,'Resume',viewer,people,hr);
  next.data={...data,stage:data.stage||'Applied'};
  return {record:next,old,linking:false};
 }
 if(action==='linkEmployee'){
  if(!old||old.kind!=='candidate'||!canReadCandidate(viewer,old,people,hr,true))throw new ForbiddenError('Choose an applicant within your hiring responsibility.');
  const input=readInput(body.data,['employeeId']),employeeId=text(input.employeeId),employee=people.find(row=>row.kind==='person'&&row.id===employeeId);
  if(!employee||employee.status==='Former'||!hrCan(viewer,'manageOnboarding',employeeId,people))throw new ForbiddenError('Choose a current employee within your onboarding responsibility.');
  if(old.data.employeeId&&old.data.employeeId!==employeeId)throw new AppError('This applicant is already linked to another employee.');
  if(hr.some(row=>row.kind==='candidate'&&row.id!==id&&row.data.employeeId===employeeId))throw new AppError('This employee is already linked to another applicant.');
  const vacancy=hr.find(row=>row.kind==='vacancy'&&row.id===old.data.vacancyId)!;
  if(old.data.employeeId!==employeeId&&(['Declined','Withdrawn'].includes(String(old.data.stage))||['Filled','Closed'].includes(String(vacancy.data.status))))throw new AppError('Reopen the applicant and position before starting onboarding.');
  const next=baseRecord(id,'candidate',old,viewer,at);next.personId=employeeId;
  next.data={...old.data,employeeId,linkedAt:old.data.linkedAt||at,linkedBy:old.data.linkedBy||viewer.name,vacancySnapshot:old.data.vacancySnapshot||{...vacancy.data,version:vacancy.version,openingId:vacancy.id},stage:'Onboarding'};
  let onboarding:HrRecord|undefined;
  if(!hr.some(row=>row.kind==='onboarding'&&row.personId===employeeId)&&!employee.onboardingClearedAt){
   const pay=onboardingPayTerms(vacancy.data),position=hr.find(row=>row.kind==='position'&&row.id===vacancy.data.positionId),jobDescription={title:vacancy.data.title,summary:vacancy.data.jobDescription||'',payBasis:pay.descriptionBasis,...(position?.data.flsaStatus?{flsaStatus:position.data.flsaStatus}:{})};
   onboarding={id:crypto.randomUUID(),kind:'onboarding',personId:employeeId,version:1,createdAt:at,createdBy:viewer.name,updatedAt:at,updatedBy:viewer.name,data:{...blankOnboarding(employee.onboardingRequired===true?'New Hire':'Existing Employee',employee,people),recruitmentCandidateId:old.id,recruitmentVacancyId:vacancy.id,jobDescription,jobDescriptionUpdatedAt:at,offer:{title:vacancy.data.title,department:vacancy.data.departmentName,regularRate:pay.regularRate,payBasis:pay.offerBasis,commissionTerms:pay.terms,startDate:employee.startDate||''},offerUpdatedAt:at}};
  }
  next.data.stage=candidateStage(next,people,onboarding?[...hr,onboarding]:hr);
  return {record:next,old,onboarding,linking:true};
 }
 throw new AppError('Choose a valid hiring action.');
}
