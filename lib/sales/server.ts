import {context,writeMany} from '@/lib/accounts/server';
import {clean,canEdit,access,head} from '@/lib/accounts/policy';
import {canAccess} from '@/lib/finance/access';
import {onboardingTasks} from '@/lib/accounts/onboarding';
import {today,type Row} from '@/lib/accounts/model';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
export const salesAccess=(v:Viewer,edit=false)=>['pipeline','opportunities','record'].some(tab=>canAccess(v,'Sales CRM',tab,edit))||access(v,'opportunities',edit)&&canAccess(v,'Account Management','opportunities',edit);
type Context=Awaited<ReturnType<typeof context>>;
export function salesProjection(ctx:Context) {
 if(!canAccess(ctx.viewer,'Sales CRM')&&!access(ctx.viewer,'opportunities'))throw new ForbiddenError();
 const leads=ctx.all.filter(r=>r.kind==='opportunity');
 return {records:leads.concat(ctx.all.filter(r=>r.kind==='salesActivity'&&leads.some(l=>l.id===r.opportunityId))),
   contacts:ctx.all.filter(r=>r.kind==='contact').map(r=>({id:r.id,name:r.name,email:r.email,phone:r.personalPhone})),
   companies:ctx.all.filter(r=>r.kind==='company').map(r=>({id:r.id,name:r.name})),
   staff:ctx.staff.filter(r=>r.kind==='person'&&r.status==='Active').map(r=>({id:r.id,name:r.name,department:r.department})),viewer:ctx.viewer,
   editable:leads.filter(r=>salesAccess(ctx.viewer,true)&&canEdit(ctx.viewer,r,ctx.all,ctx.staff)).map(r=>r.id),canCreate:salesAccess(ctx.viewer,true),
   canAssign:head(ctx.viewer,ctx.staff),canHandoff:canAccess(ctx.viewer,'Sales CRM','compliance',true)||access(ctx.viewer,'accounts',true)};
}
export async function saveSales(body:Record<string,unknown>,ctx:Context) {
 const {all,viewer:v,staff}=ctx;
 if(!salesAccess(v,true))throw new ForbiddenError();
 const action=String(body.action||'save');
 if(action==='save') {
   const input=body.record as Row;
   if(!input||input.kind!=='opportunity')throw new AppError('Save a sales opportunity.');
   const old=all.find(r=>r.id===input.id);
   if(old&&old.version!==input.version)throw new ConflictError();
   const next=clean(input,old,v,all,staff);
   if(old?.onboardingAccountId&&next.stage!=='Won')throw new AppError('This property has been handed off. Manage its service status in Account Management.');
   if(!head(v,staff)&&next.assignee!==v.person)throw new ForbiddenError('Assign this opportunity to yourself.');
   if(!old)next.createdAt=new Date().toISOString();
   if(next.stage!==old?.stage){next.stageChangedAt=new Date().toISOString();if(['Won','Lost'].includes(String(next.stage)))next.closedDate=today();}
   const changes:{old?:Row;next:Row}[]=[{old,next}];
   if(old&&old.stage!==next.stage)changes.push({next:{id:crypto.randomUUID(),kind:'salesActivity',version:0,name:'Stage changed',opportunityId:next.id,date:today(),channel:'Note',details:`${old.stage} → ${next.stage}`}});
   return writeMany(changes,v,old?'Updated sales opportunity':'Created sales opportunity');
 }
 const lead=all.find(r=>r.kind==='opportunity'&&r.id===body.id);
 if(!lead||!canEdit(v,lead,all,staff))throw new ForbiddenError();
 if(action==='handoff'&&lead.onboardingAccountId)return [lead,...all.filter(r=>r.id===lead.onboardingAccountId)];
 if(body.version!==lead.version)throw new ConflictError();
 if(action==='activity') {
   const input={id:crypto.randomUUID(),kind:'salesActivity',version:0,name:body.channel||'Sales activity',opportunityId:lead.id,date:body.date||today(),channel:body.channel,details:body.details,outcome:body.outcome||''};
   const activity=clean(input,undefined,v,all,staff);
   if(!activity.details)throw new AppError('Record what happened.');
   if(String(activity.date)>today())throw new AppError('Log completed contact; use next follow-up for a future date.');
   const next=clean({id:lead.id,kind:'opportunity',version:lead.version,dueDate:body.dueDate||'',nextAction:body.nextAction||''},lead,v,all,staff);
   if(!!next.dueDate!==!!next.nextAction)throw new AppError('Add both a next action and follow-up date, or leave both empty.');
   if(activity.channel!=='Note')next.lastContact=activity.date;
   return writeMany([{next:activity},{old:lead,next}],v,'Logged sales contact and next follow-up');
 }
 if(action==='handoff') {
   if(!canAccess(v,'Sales CRM','compliance',true)&&!access(v,'accounts',true))throw new ForbiddenError();
   if(lead.stage!=='Won')throw new AppError('Mark the opportunity Won before sending it to onboarding.');
   if(!lead.address)throw new AppError('Add the property address before handoff.');
   const assignee=staff.find(r=>r.kind==='person'&&r.id===body.assignee&&r.status==='Active'&&r.department==='Account Managers');
   if(!assignee)throw new AppError('Choose an active account manager.');
   if(all.some(r=>r.kind==='account'&&r.name.trim().toLowerCase()===lead.name.trim().toLowerCase()))throw new AppError('An account with this property name already exists. Open that account to avoid a duplicate.');
   const account:Row={id:crypto.randomUUID(),kind:'account',version:0,name:lead.name,address:lead.address,propertyType:lead.propertyType,units:lead.units,parkingSpaces:lead.parkingSpaces,service:lead.service||'Unconfirmed',companyId:lead.companyId,assignee:assignee.id,status:'Onboarding',sourceOpportunityId:lead.id,onboardingStartedAt:new Date().toISOString()};
   const changes:{old?:Row;next:Row}[]=[];
   if(!account.companyId&&lead.companyName) {
     const company=all.find(r=>r.kind==='company'&&r.type==='Management company'&&r.name.toLowerCase()===String(lead.companyName).trim().toLowerCase());
     if(company)account.companyId=company.id;
     else {const next=clean({id:crypto.randomUUID(),kind:'company',version:0,name:lead.companyName,type:'Management company'},undefined,v,all,staff,true);changes.push({next});account.companyId=next.id;}
   }
   const existing=all.find(r=>r.kind==='contact'&&r.id===lead.contactId);
   if(existing||lead.contactName) {
     const contact=existing||{id:crypto.randomUUID(),kind:'contact' as const,version:0,name:String(lead.contactName)};
     if(!existing)changes.push({next:contact});
     account.primaryContactId=contact.id;
     changes.push({next:{id:crypto.randomUUID(),kind:'affiliation',version:0,name:String(lead.contactRole||'Property Manager'),accountId:account.id,contactId:contact.id,role:lead.contactRole||'Property Manager',workEmail:lead.email,workPhone:lead.phone}});
   }
   changes.push({next:account},...onboardingTasks(account,all).map(next=>({next})),{old:lead,next:{...lead,onboardingAccountId:account.id,handoffDate:today(),dueDate:'',nextAction:''}},
     {next:{id:crypto.randomUUID(),kind:'salesActivity',version:0,name:'Sent to onboarding',opportunityId:lead.id,date:today(),channel:'Note',details:'Pending account assigned to '+assignee.name}});
   if(lead.details)changes.push({next:{id:crypto.randomUUID(),kind:'activity',version:0,name:'Sales handoff',accountId:account.id,date:today(),channel:'Note',details:lead.details,assignee:assignee.id}});
   return writeMany(changes,v,'Handed won property to account onboarding');
 }
 throw new AppError('Choose a sales action.');
}
