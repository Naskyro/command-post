import {allRecords,identify} from '@/lib/finance/server';
import {records,writeMany} from '@/lib/accounts/server';
import {vehicles} from '@/lib/accounts/history';
import type {Row} from '@/lib/accounts/model';
import {today} from '@/lib/accounts/model';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import {safetyAccess,safetyReviewer,safetyKinds} from './access';
import {prepareCase,safetyAlerts,checkedText,checkedDate,normalizeVin,normalizePlate,validVin,exactVehicle} from './model';
export async function safetyContext(request:Request){const staff=await allRecords(),viewer=identify(staff,request.headers);if(!staff.some(r=>r.id===viewer.person&&r.kind==='person'&&r.status==='Active'))throw new ForbiddenError();return {staff,viewer,all:await records()};}
export function safetyData(ctx:Awaited<ReturnType<typeof safetyContext>>,alertsOnly=false){const {all,viewer:v,staff}=ctx;const alerts=safetyAlerts(all,vehicles(all));if(alertsOnly)return {alerts,canEdit:safetyAccess(v,true),canReview:safetyReviewer(v),canView:safetyAccess(v)};if(!safetyAccess(v))throw new ForbiddenError();return {alerts,canEdit:safetyAccess(v,true),canReview:safetyReviewer(v),canView:true,records:all.filter(r=>safetyKinds.includes(r.kind)||r.kind==='file'&&r.category==='Trespass evidence').map(r=>{const {storageKey,...rest}=r;return rest;}),accounts:all.filter(r=>r.kind==='account').map(r=>({id:r.id,name:r.name,assignee:r.assignee})),staff:staff.filter(r=>r.kind==='person').map(r=>({id:r.id,name:r.name}))};}
export async function saveSafety(body:Record<string,unknown>,ctx:Awaited<ReturnType<typeof safetyContext>>){
 const {all,viewer:v,staff}=ctx,action=String(body.action||''),c=all.find(r=>r.kind==='trespass'&&r.id===body.caseId),at=new Date().toISOString();
 if(!safetyAccess(v,true))throw new ForbiddenError();
 if(action==='save'){
  if(!body.record||typeof body.record!=='object'||Array.isArray(body.record))throw new AppError('Enter case details.');
  const input=body.record as Record<string,unknown>,old=all.find(r=>r.id===input.id);
  if(old&&old.kind!=='trespass')throw new ForbiddenError();
  const next=prepareCase(input,old,v,all);if(!old&&input.id){if(!/^[a-f0-9-]{36}$/i.test(String(input.id)))throw new AppError('Invalid case ID.');next.id=String(input.id);}
  if(next.assignee&&next.assignee!==old?.assignee&&!staff.some(r=>r.kind==='person'&&r.id===next.assignee&&r.status==='Active'&&r.nameHidden!==true))throw new AppError('Choose an active staff member.');
  const changes:{old?:Row;next:Row}[]=[{old,next}];
  const changed=old?Object.keys(next).filter(k=>!['id','version','kind','updatedBy','updatedAt'].includes(k)&&next[k]!==old[k]):[];
  changes.push({next:{id:crypto.randomUUID(),kind:'safetyUpdate',version:0,name:old?'Case details updated':'Case opened',caseId:next.id,accountId:next.accountId,date:today(),details:old?'Updated: '+changed.join(', '):'Incident recorded for '+next.incidentDate}});
  if(!old&&body.raiseAlert===true){const guidance=checkedText(body.staffGuidance,'staff safety guidance',500);if(!guidance)throw new AppError('Enter brief safety guidance for all employees.');changes.push({next:{id:crypto.randomUUID(),kind:'safetyEvent',version:0,name:'Initial safety alert',caseId:next.id,accountId:next.accountId,encounterDate:today(),recordedAt:at,staffGuidance:guidance,raiseAlert:true}});}
  return writeMany(changes,v,old?'Updated trespass case':'Created trespass case');
 }
 if(!c)throw new AppError('Choose a trespass record.');
 if(action==='clear'){
  if(!safetyReviewer(v))throw new ForbiddenError('Only an Account Manager or department head can clear a safety alert.');
  const alert=safetyAlerts(all,vehicles(all)).find(a=>a.id===body.alertId&&a.caseId===c.id);
  if(!alert){if(all.some(r=>r.kind==='safetyReview'&&r.alertId===body.alertId&&r.caseId===c.id))return [];throw new ConflictError('This alert changed. Refresh before reviewing.');}
  const reason=checkedText(body.reason,'review note');if(!reason)throw new AppError('Record why the active alert can be cleared.');
  return writeMany([{old:c,next:{...c,lastReviewedAt:at}},{next:{id:crypto.randomUUID(),kind:'safetyReview',version:0,name:'Safety alert acknowledged & cleared',caseId:c.id,accountId:c.accountId,alertId:alert.id,details:reason,date:today(),reviewedAt:at,reviewedBy:v.name,reviewerId:v.person}}],v,'Acknowledged and cleared safety alert');
 }
 if(action==='note'){
  const details=checkedText(body.details,'follow-up details'),date=checkedDate(body.date,'update date');if(!details||!date)throw new AppError('Enter the update date and details.');
  return writeMany([{next:{id:crypto.randomUUID(),kind:'safetyUpdate',version:0,name:body.category==='Property communication'?'Property communication':'Case follow-up',caseId:c.id,accountId:c.accountId,date,details}}],v,'Added trespass follow-up');
 }
 if(action==='encounter'){
  const date=checkedDate(body.date,'encounter date'),guidance=checkedText(body.staffGuidance,'staff guidance',500),details=checkedText(body.details,'encounter details'),vin=normalizeVin(body.vin),plate=normalizePlate(body.plate),state=checkedText(body.plateState,'plate state',3).toUpperCase();
  if(!date||!details)throw new AppError('Enter the encounter date and details.');if(vin&&!validVin(vin))throw new AppError('Enter a complete 17-character VIN.');if(plate&&(!state||!/^[A-Z]{2,3}$/.test(state))||plate.length>12)throw new AppError('Enter the complete plate and state.');if(body.raiseAlert===true&&!guidance)throw new AppError('Enter brief safety guidance for staff.');
  // A real, explicitly recorded encounter can alert staff even when historical automatic monitoring is disabled.
  return writeMany([{next:{id:crypto.randomUUID(),kind:'safetyEvent',version:0,name:'Return / new encounter',caseId:c.id,accountId:c.accountId,encounterDate:date,recordedAt:at,vin,plate,plateState:state,details,staffGuidance:guidance,raiseAlert:body.raiseAlert===true,towbookReference:checkedText(body.towbookReference,'Towbook reference',100)}}],v,'Recorded trespass encounter');
 }
 throw new AppError('Choose a supported safety action.');
}
