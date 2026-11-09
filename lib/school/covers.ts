import type {SchoolCourse} from './model';
import type {Stored} from './store';
import {AppError,ForbiddenError} from '../shared/errors.ts';
export const courseCoverStyles=['command','dispatch','field','executive'] as const;
const validId=(s:unknown)=>typeof s==='string'&&/^cover-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(s);
export function coverKey(id:unknown){if(!validId(id))throw new ForbiddenError('Course cover unavailable.');return 'school/covers/'+id;}
export function isLiveStage(m:Stored,now=Date.now()){return m.kind==='courseCover'&&m.status==='Staged'&&Date.parse(String(m.expiresAt))>now;}
/** Bind an upload at the *same transaction* as its first course save. Editing other course
 * fields from an older client must not discard an existing cover. An unattached stage may
 * be claimed only once and only by its author. An old attached ID is not reusable. */
export function planCourseCover(raw:Record<string,unknown>,existing:SchoolCourse|undefined,next:SchoolCourse,rows:Stored[],actor:string,at=new Date().toISOString()){
 const style=Object.hasOwn(raw,'coverStyle')?raw.coverStyle:existing?.coverStyle;
 if(style!==undefined&&!(courseCoverStyles as readonly unknown[]).includes(style))throw new AppError('Choose a valid course title card.');
 if(style)next.coverStyle=style as NonNullable<SchoolCourse['coverStyle']>;
 const accent=Object.hasOwn(raw,'coverAccent')?raw.coverAccent:existing?.coverAccent;
 if(accent!==undefined&&accent!==''&&!['gold','mint','sky','coral'].includes(accent as string))throw new AppError('Choose a valid title card accent.');
 if(accent)next.coverAccent=accent as NonNullable<SchoolCourse['coverAccent']>;
 const ref=Object.hasOwn(raw,'coverMediaId')?raw.coverMediaId:existing?.coverMediaId;
 const changes:{before:Stored;after:Stored}[]=[];
 if(ref!==undefined&&ref!==''&&!validId(ref))throw new AppError('Choose an uploaded course cover.');
 if(typeof ref==='string'&&ref){
  const m=rows.find(r=>r.id===ref&&r.kind==='courseCover');
  if(!m)throw new ForbiddenError('Course cover unavailable.');
  if(m.status==='Attached'){
   if(ref!==existing?.coverMediaId||m.courseId!==next.id)throw new ForbiddenError('Course cover unavailable.');
  }else{
   if(!isLiveStage(m,Date.parse(at))||m.uploadedBy!==actor||m.targetCourse&&m.targetCourse!==next.id)throw new ForbiddenError('This upload is unavailable for this course.');
   changes.push({before:m,after:{...m,status:'Attached',courseId:next.id,version:m.version+1,attachedAt:at}});
  }
  next.coverMediaId=ref;
 }
 let retired:string|undefined;
 if(existing?.coverMediaId&&existing.coverMediaId!==ref){
  const old=rows.find(r=>r.kind==='courseCover'&&r.id===existing.coverMediaId&&r.courseId===next.id&&r.status==='Attached');
  if(old){retired=old.id;changes.push({before:old,after:{...old,status:'Retired',version:old.version+1,retiredAt:at}});}
 }
 return {changes,retired};
}
