import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {hrCan} from './permissions.ts';
import type {HrRecord} from './model';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors.ts';

export const educationLevels=['Less Than High School','High School Diploma / GED','Some College (No Degree)','Trade / Vocational Certificate','Associate Degree','Bachelor’s Degree','Master’s Degree','Doctoral / Professional Degree','Other / Unclassified'] as const;
export const educationStatuses=['Completed','In Progress','Not Completed'] as const;
export type EducationCredential={id:string;level:string;status:typeof educationStatuses[number];fieldOfStudy?:string;school?:string;degree?:string;completedOn?:string};
export const educationRecordId=(personId:string)=>'education:'+personId;
function scope(v:Viewer,id:string,people:FinRecord[],write:boolean){
 if(!people.some(p=>p.kind==='person'&&p.id===id))return false;
 if(v.onboardingOnly)return v.person===id;
 if(!canAccess(v,'People & HR'))return false;
 if(v.person===id)return true;
 return (write?['managePersonnel','manageOnboarding']:['viewPersonnel','managePersonnel','manageOnboarding']).some(action=>hrCan(v,action,id,people));
}
export const canReadEducation=(v:Viewer,id:string,records:FinRecord[])=>scope(v,id,records,false);
export const canEditEducation=(v:Viewer,id:string,records:FinRecord[])=>scope(v,id,records,true);
const recognized=(x:unknown):x is EducationCredential=>!!x&&typeof x==='object'&&!Array.isArray(x)&&typeof (x as EducationCredential).id==='string'&&educationLevels.some(l=>l===(x as EducationCredential).level)&&educationStatuses.some(s=>s===(x as EducationCredential).status);
export function readEducationEntries(data:Record<string,unknown>):EducationCredential[]{return Array.isArray(data.entries)?data.entries.filter(recognized):[];}
/** Unclassified credentials cannot outrank a known level. In-progress study never counts as attained. */
export function highestCompletedEducation(entries:EducationCredential[]):string|null{
 const rank=(level:string)=>level==='Other / Unclassified'?-1:educationLevels.findIndex(v=>v===level);
 return entries.filter(e=>e.status==='Completed').sort((a,b)=>rank(b.level)-rank(a.level))[0]?.level||null;
}
const clean=(s:unknown,max:number)=>{if(s===undefined)return '';if(typeof s!=='string'||s.length>max)throw new AppError('Check the education details and field length.');return s.trim();};
export function prepareEducation(body:Record<string,unknown>,old:HrRecord|undefined,v:Viewer,people:FinRecord[],at=new Date().toISOString(),newId=crypto.randomUUID()):{record:HrRecord;action:string}{
 const personId=clean(body.personId,130);
 if(!/^[a-zA-Z0-9:_-]{1,130}$/.test(personId)||!canEditEducation(v,personId,people))throw new ForbiddenError('You do not have permission to update this education record.');
 if(old&&(old.id!==educationRecordId(personId)||old.personId!==personId||old.kind!=='education'))throw new AppError('This personnel record requires administrator review.',409);
 if(!Number.isSafeInteger(body.version)||body.version!==(old?.version||0))throw new ConflictError('Education changed while this form was open. Reload the education record before saving.');
 const entries=readEducationEntries(old?.data||{}),id=clean(body.entryId,100),index=entries.findIndex(e=>e.id===id);
 if(id&&index<0)throw new AppError('This education entry is no longer available.',404);
 let operation:string,reason='';
 if(body.action==='remove'){
  if(!id||index<0)throw new AppError('Choose an education entry to remove.');
  reason=clean(body.reason,350);if(!reason)throw new AppError('Enter a reason to remove this education entry.');
  entries.splice(index,1);operation='Removed Education Entry';
 }else if(body.action==='save'){
  const x=body.entry;
  if(!x||typeof x!=='object'||Array.isArray(x))throw new AppError('Enter the education details.');
  const input=x as Record<string,unknown>;if(Object.keys(input).some(k=>!['level','status','school','fieldOfStudy','degree','completedOn'].includes(k)))throw new AppError('An education field is not recognized.');
  const level=educationLevels.find(l=>l===input.level),status=educationStatuses.find(s=>s===input.status);
  if(!level||!status)throw new AppError('Select an education level and completion status.');
  const credential:EducationCredential={id:id||newId,level,status};
  for(const field of ['school','fieldOfStudy','degree'] as const){const value=clean(input[field],160);if(value)credential[field]=value;}
  const date=clean(input.completedOn,10);
  if(date){const iso=/^\d{4}-\d\d-\d\d$/.test(date)&&Date.parse(date+'T12:00:00Z');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
   if(status!=='Completed'||!iso||new Date(iso).toISOString().slice(0,10)!==date||date>today)throw new AppError('Use a valid completion date on or before today, only for completed education.');
   credential.completedOn=date;}
  if(index>=0){entries[index]=credential;operation='Updated Education Entry';}else{if(entries.length>=40)throw new AppError('An employee file can hold up to 40 education entries.');entries.push(credential);operation='Added Education Entry';}
 }else throw new AppError('Choose a valid education action.');
 return {action:operation,record:{id:educationRecordId(personId),kind:'education',personId,version:(old?.version||0)+1,createdAt:old?.createdAt||at,createdBy:old?.createdBy||v.name,updatedAt:at,updatedBy:v.name,data:{entries,...(reason?{removalReason:reason}:{})}}};
}
