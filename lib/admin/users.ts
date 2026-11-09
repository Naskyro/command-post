import {canAssistPassword} from './password-reset-policy.ts';
import {stampDirectDelegation} from './delegated-grants.ts';
import type {FinRecord,Viewer} from '../finance/model';
import {canAccess,grantsFor} from '../finance/access.ts';
import {boundedHrResponsibilities} from '../hr/permissions.ts';
import {blankOnboarding,type HrRecord} from '../hr/model.ts';
import {applyAuthorityLevel,authorityAssignmentCapabilities,authorityRank,authorityTemplate,captureAuthorityOverrides} from '../people/authority.ts';
import {accessFields,authorityLevels,boundedGrants,canEditAccess,profileFields,sanitizeFields,validateProfile,validateRole} from '../people/policy.ts';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors.ts';
import {requireTemplate,templateAllowed} from './access-templates.ts';

export function userLifecycleCapabilities(v:Viewer,p:FinRecord,records:FinRecord[]){
 const canManage=canEditAccess(v,p,records), protectedUser=p.id===v.person||p.role==='Owner'||p.workerType==='Owner';
 const inactive=p.accountStatus==='Disabled',former=p.status==='Former';
 return {canManage,canResetPassword:canAssistPassword(v,p,records),canDeactivate:canManage&&!protectedUser&&!inactive&&!former,canReactivate:canManage&&!protectedUser&&inactive&&['Active','Leave','Onboarding'].includes(String(p.status)),reactivationReason:former?'Rehire This Employee in People & HR First':protectedUser?'Owner and Current User Accounts Are Protected':!inactive?'This Account Is Already Enabled':!canManage?'This User Is Outside Your Access Administration Scope':''};
}
export function adminUserAssignment(v:Viewer,records:FinRecord[]){
 const assignment=authorityAssignmentCapabilities(v,records),canCreate=canAccess(v,'Admin','users',true);
 return {...assignment,canCreate,levels:canCreate?authorityLevels.slice(0,authorityRank(v,records)):assignment.levels};
}
function reasonFrom(body:Record<string,unknown>){const reason=String(body.reason||'').trim();if(!reason||reason.length>1000)throw new AppError('Enter a reason of 1–1,000 characters.');return reason;}
function idFrom(input:unknown){const id=String(input||crypto.randomUUID());if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(id))throw new AppError('Choose a valid user record.');return id;}
function fieldsFrom(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('Submit the user details.');return input as Record<string,unknown>;}
export function prepareAdminUser(body:Record<string,unknown>,v:Viewer,records:FinRecord[],at=new Date().toISOString()):{old?:FinRecord;next:FinRecord;onboarding?:HrRecord;reason:string}{
 if(!canAccess(v,'Admin','users',true))throw new ForbiddenError('User administration is not assigned to you.');
 const action=String(body.action||''),id=idFrom(body.id),reason=reasonFrom(body),old=records.find(r=>r.id===id);
 if(action==='create-user'){
  if(old)throw new ConflictError('That user already exists. Open the existing record to edit access.');
  const input=fieldsFrom(body.fields),fields=sanitizeFields(input,[...profileFields,...accessFields]);
  const selected=authorityTemplate(String(fields.authorityLevel||'Coordinator'));
  validateRole(fields.role||selected.role,v,id);
  if(fields.role==='Owner'||fields.workerType==='Owner')throw new ForbiddenError('Create employees or contractors here. Company owner identities are protected.');
  if(fields.userId)throw new AppError('Use the person’s Command username. External identities cannot be assigned during setup.');
  if(!['New Hire','Existing Worker'].includes(String(fields.setupPath)))throw new AppError('Choose New Hire or Existing Worker.');
  const existing=fields.setupPath==='Existing Worker';
  let next:FinRecord={id,kind:'person',version:0,...fields,role:fields.role||selected.role,authorityLevel:fields.authorityLevel||'Coordinator',accessMode:'Custom',access:boundedGrants(fields.access===undefined?selected.access:fields.access,v),status:existing?'Active':'Onboarding',accountStatus:existing?'Enabled':'Onboarding',onboardingRequired:!existing,setupPath:existing?'Existing Worker':'New Hire',onboardingStatus:existing?'Historical Records Pending':'In Progress',payType:'Pending method',rate:0,netTarget:0,exempt:false,schoolAccessConfigured:true};
  validateProfile(next,undefined,v,records);
  if(!next.title||String(next.title).length>150)throw new AppError('Enter a job title of 1–150 characters.');
  if(!next.employmentClass&&next.workerType==='Employee')throw new AppError('Select Full-Time, Part-Time, Temporary, or Seasonal.');
  if(next.supervisor&&!records.some(p=>p.kind==='person'&&p.id===next.supervisor&&p.status==='Active'))throw new AppError('Choose an active supervisor.');
  const proposed=[...records,next];
  if(!canEditAccess(v,next,proposed))throw new ForbiddenError('New users must be within your access administration reporting branch.');
  next.hrResponsibilities=boundedHrResponsibilities(fields.hrResponsibilities===undefined?selected.hrResponsibilities:fields.hrResponsibilities,v,next,proposed);
  next=applyAuthorityLevel(undefined,next,v,records,at);
  if(body.templateId){
   const t=requireTemplate(records,body.templateId,body.templateVersion);
   if(t.status!=='Active'||!templateAllowed(t,v))throw new ForbiddenError('That permission set is not available within your authority.');
   next={...next,accessTemplateId:t.id,accessTemplateName:t.name,accessTemplateVersion:t.version,accessTemplateAppliedAt:at,accessTemplateAppliedBy:v.name,accessTemplateBaseline:t.access,accessTemplateHrBaseline:t.hrResponsibilities};
  }
  const onboarding:HrRecord={id:'onboarding:'+id,kind:'onboarding',personId:id,version:1,data:{...blankOnboarding(existing?'Existing Employee':'New Hire',next,records),createdFrom:'Admin User Setup',assignedSupervisorId:next.supervisor||'',employeeAccessRestricted:!existing},createdAt:at,createdBy:v.name,updatedAt:at,updatedBy:v.name};
  next=stampDirectDelegation(next,v,Array.isArray(fields.access));
  return {next,onboarding,reason:'Created '+(existing?'Existing Employee Account':'New Hire Account')+': '+reason};
 }
 if(!old||old.kind!=='person')throw new AppError('User not found.',404);
 if(body.version!==old.version)throw new ConflictError();
 const caps=userLifecycleCapabilities(v,old,records);
 if(action==='deactivate'){
  if(!caps.canDeactivate)throw new ForbiddenError('You cannot deactivate this user. Owner, current-user, and former employee records are protected.');
  return {old,next:{...old,accountStatus:'Disabled',accountStatusBeforeDeactivation:old.accountStatus||'Enabled',accountDeactivatedAt:at,accountDeactivatedBy:v.name,accountDeactivatedById:v.id,accountDeactivationReason:reason},reason:'Deactivated Site Access: '+reason};
 }
 if(action==='reactivate'){
  if(!caps.canReactivate)throw new ForbiddenError(caps.reactivationReason||'This employment status cannot be reactivated here.');
  if(body.reviewedAccess!==true)throw new AppError('Review this user’s assigned modules and responsibilities before reactivating access.');
  const fields=sanitizeFields(fieldsFrom(body.fields),['access','hrResponsibilities']);
  const next=captureAuthorityOverrides(old,{...old,accessMode:'Custom',access:boundedGrants(fields.access===undefined?grantsFor(old):fields.access,v),hrResponsibilities:boundedHrResponsibilities(fields.hrResponsibilities===undefined?old.hrResponsibilities||[]:fields.hrResponsibilities,v,old,records),schoolAccessConfigured:true,accountStatus:old.status==='Onboarding'||old.onboardingRequired===true&&!old.onboardingClearedAt?'Onboarding':'Enabled',accountReactivatedAt:at,accountReactivatedBy:v.name,accountReactivatedById:v.id,accountReactivationReason:reason});
  return {old,next:stampDirectDelegation(next,v,Array.isArray(fields.access)),reason:'Reactivated Site Access After Permission Review: '+reason};
 }
 throw new AppError('Choose a supported user account action.');
}
