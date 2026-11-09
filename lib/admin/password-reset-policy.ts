import type {FinRecord,Viewer} from '../finance/model';
import {canAccess,grantsFor} from '../finance/access.ts';
import {authorityLevelOf,authorityLevels,canEditAccess} from '../people/policy.ts';
import {hasDirectResetApproval} from './delegated-grants.ts';

// The grant to LOOK through an employee's workspace never authorizes a password reset.
export function canAssistPassword(v:Viewer,p:FinRecord|undefined,records:FinRecord[]):boolean{
 if(!p||v.onboardingOnly||p.kind!=='person'||p.id===v.person||p.role==='Owner'||p.workerType==='Owner'||['jerson','jeidy','jendel'].includes(p.id)||p.commandSignInRevoked===true||p.accountStatus==='Disabled'||!['Active','Onboarding','Leave'].includes(String(p.status)))return false;
 if(!canAccess(v,'Admin','users',true)||!canEditAccess(v,p,records))return false;
 if(v.owner)return true;
 const actor=records.find(r=>r.kind==='person'&&r.id===v.person);
 if(!actor||!hasDirectResetApproval(actor)||!canAccess(v,'Admin','password-resets',true)||grantsFor(p).some(g=>g.module==='Admin'))return false;
 const a=authorityLevels.indexOf(authorityLevelOf(actor) as typeof authorityLevels[number]),t=authorityLevels.indexOf(authorityLevelOf(p) as typeof authorityLevels[number]);
 if(a<0||t<0||a<=t)return false;
 return grantsFor(p).every(g=>canAccess(v,g.module,g.tab,g.level==='Edit'))&&(Array.isArray(p.hrResponsibilities)?p.hrResponsibilities as {action:string;scope:string}[]:[]).every(g=>v.hrResponsibilities?.some(vg=>vg.action===g.action&&(vg.scope==='Company'||vg.scope===g.scope)));
}
