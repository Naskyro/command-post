import type {FinRecord,Viewer} from '../finance/model';
import {ForbiddenError} from '../shared/errors.ts';

type Grant = {module?:unknown;tab?:unknown;level?:unknown};
export const isDelegatedGrant=(g:Grant)=>g.module==='Admin'&&g.tab==='delegated-access';
export const isResetGrant=(g:Grant)=>g.module==='Admin'&&g.tab==='password-resets';
export const isDelegatedTab=(module:string,tab:string)=>isDelegatedGrant({module,tab})||isResetGrant({module,tab});
export const hasAdminPair=(grants:Grant[])=>['users','delegated-access'].every(tab=>grants.some(g=>g.module==='Admin'&&g.tab===tab&&g.level==='Edit'));
const identityStamp=(p:FinRecord)=>JSON.stringify([p.id,String(p.userId||''),[...new Set([p.email,...(Array.isArray(p.emailAliases)?p.emailAliases:[])].filter(x=>typeof x==='string'&&x.trim()).map(x=>String(x).trim().toLowerCase()))].sort()]);
// This is an internal, non-editable field. A list of grants alone never establishes
// delegation; rebinding sign-in identities invalidates a prior owner's approval.
export const hasDirectDelegationApproval=(p:FinRecord)=>p.accessMode==='Custom'&&p.status==='Active'&&p.delegationIdentityStamp===identityStamp(p)&&['jerson','jendel','jeidy'].includes(String(p.delegationApprovedByOwner||''));
export const hasDirectResetApproval=(p:FinRecord)=>p.accessMode==='Custom'&&p.status==='Active'&&p.accountStatus!=='Disabled'&&p.resetIdentityStamp===identityStamp(p)&&['jerson','jendel','jeidy'].includes(String(p.resetApprovedByOwner||''));
export function stampDirectDelegation(next:FinRecord,actor:Viewer,explicit:boolean):FinRecord {
 if(!explicit||next.role==='Owner'||next.workerType==='Owner')return next;
 const access=Array.isArray(next.access)?next.access as Grant[]:[];
 if(access.some(isResetGrant)){
  if(!actor.owner||actor.person===next.id||!['users','password-resets'].every(tab=>access.some(g=>g.module==='Admin'&&g.tab===tab&&g.level==='Edit')))throw new ForbiddenError('A company owner must assign Reset Staff Passwords and Users & Access directly with Edit permission.');
  next={...next,resetIdentityStamp:identityStamp(next),resetApprovedByOwner:actor.person};
 }else next={...next,resetIdentityStamp:'',resetApprovedByOwner:''};
 if(!access.some(isDelegatedGrant))return {...next,delegationIdentityStamp:'',delegationApprovedByOwner:''};
 if(!actor.owner||actor.person===next.id||!hasAdminPair(access))throw new ForbiddenError('A company owner must assign both Users & Access and Delegated Access directly to an individual site administrator.');
 return {...next,delegationIdentityStamp:identityStamp(next),delegationApprovedByOwner:actor.person};
}
export function blockDelegationTemplate(grants:Grant[]){
 if(grants.some(isResetGrant))throw new ForbiddenError('Password reset authority must be assigned directly by a company owner.');
 if(grants.some(isDelegatedGrant))throw new ForbiddenError('Delegated Access can only be assigned directly to an individual site administrator by a company owner.');
}
