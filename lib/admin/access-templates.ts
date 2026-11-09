import {blockDelegationTemplate} from './delegated-grants.ts';
import type {FinRecord,Viewer} from '../finance/model';
import {accessCatalog,grantsFor,canAccess,type AccessGrant} from '../finance/access.ts';
import {authorityTemplate} from '../people/authority.ts';
import {boundedGrants,canEditAccess} from '../people/policy.ts';
import {boundedHrResponsibilities,responsibilityGrants,type HrResponsibility} from '../hr/permissions.ts';
import {AppError,ForbiddenError,ConflictError} from '../shared/errors.ts';
import type {AccessTemplate,TemplateChange} from './access-templates-model';

const base=authorityTemplate('Coordinator');
const all=(module:string,level:'View'|'Edit'='View')=>Object.keys(accessCatalog[module]).map(tab=>({module,tab,level}));
const unique=(grants:AccessGrant[])=>[...new Map(grants.map(g=>[g.module+'|'+g.tab,g])).values()];
const starter=(id:string,name:string,description:string,access:AccessGrant[],hrResponsibilities:HrResponsibility[]=[]):AccessTemplate=>({id:'access-template-'+id,kind:'accessTemplate',version:0,name,description,status:'Active',access:unique([...base.access,...access]),hrResponsibilities,builtin:true,updatedBy:'Company Starter'});
export const builtinAccessTemplates:AccessTemplate[]=[
 starter('dispatcher','Dispatcher','Dispatch tools, Account Hub, personal pay, and department learning.',[...all('Accounts','Edit'),{module:'Home',tab:'fieldBriefing',level:'View'}]),
 starter('driver','Driver','Field briefing, assigned learning, and employee self-service.',[{module:'Home',tab:'fieldBriefing',level:'View'},{module:'Work Orders',tab:'orders',level:'Edit'}]),
 starter('account-manager','Account Manager','Property account workflows and Sales CRM, with sensitive approvals assigned separately.',[...all('Account Management','Edit').filter(g=>!['courtesyApprove','lifecycle'].includes(g.tab)),...all('Sales CRM','Edit')]),
 starter('manager','Manager','Team personnel, coaching, training creation, and team grading. Company-wide and financial decisions remain separate.',authorityTemplate('Manager').access,authorityTemplate('Manager').hrResponsibilities),
];
export const templateList=(records:FinRecord[]):AccessTemplate[]=>{const map=new Map(builtinAccessTemplates.map(t=>[t.id,t]));for(const r of records)if(r.kind==='accessTemplate')map.set(r.id,r as unknown as AccessTemplate);return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));};
export function templateAllowed(t:AccessTemplate,v:Viewer):boolean{try{blockDelegationTemplate(t.access);boundedGrants(t.access,v);return t.hrResponsibilities.every(g=>v.owner||v.hrResponsibilities?.some(o=>o.action===g.action&&(o.scope==='Company'||o.scope===g.scope||['Team','Department'].includes(o.scope)&&g.scope==='Self')))}catch{return false;}}
const str=(x:unknown,max:number,required=false)=>{if(typeof x!=='string'||x.length>max||required&&!x.trim())throw new AppError('Complete the permission set name and details.');return x.trim();};
export function cleanTemplate(input:unknown,v:Viewer,records:FinRecord[],old?:AccessTemplate):AccessTemplate{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('Submit the permission set.');const t=input as Record<string,unknown>;
 const name=str(t.name,100,true),description=str(t.description||'',800);
 if(templateList(records).some(p=>p.id!==old?.id&&p.status==='Active'&&p.name.toLowerCase()===name.toLowerCase()))throw new AppError('An active permission set already uses that name.');
 const access=boundedGrants(t.access,v),hr=t.hrResponsibilities||[];blockDelegationTemplate(access);
 // A template is a reusable ceiling, not a grant to any particular person yet.
 const dummy={id:'template-target',kind:'person',version:0,department:v.department,supervisor:v.person} as FinRecord;
 const hrResponsibilities=boundedHrResponsibilities(hr,v,dummy,[...records,dummy]);
 return {id:old?.id||'access-template-'+crypto.randomUUID(),kind:'accessTemplate',version:old?.version||0,name,description,status:old?.status||'Active',access,hrResponsibilities,builtin:false};
}
export function accessTemplatePlan(t:AccessTemplate,person:FinRecord,v:Viewer,records:FinRecord[],mode:'Replace'|'Merge'){
 blockDelegationTemplate(t.access);
 if(!canEditAccess(v,person,records)||person.role==='Owner')throw new ForbiddenError('Permission sets can be applied only to editable non-owner accounts in your scope.');
 if(t.status!=='Active')throw new AppError('Restore this permission set before applying it.');
 const baseline=grantsFor(person),beforeHr=responsibilityGrants(person);
 const nextGrants=mode==='Merge'?unique([...baseline,...t.access.map(g=>{const old=baseline.find(x=>x.module===g.module&&x.tab===g.tab);return old?.level==='Edit'?old:g})]):unique(t.access);
 const nextHr=mode==='Merge'?[...new Map([...beforeHr,...t.hrResponsibilities.map(g=>{const old=beforeHr.find(x=>x.action===g.action);return old&&(old.scope==='Company'||old.scope!=='Self'&&g.scope!=='Company')?old:g})].map(g=>[g.action,g])).values()]:t.hrResponsibilities;
 const access=boundedGrants(nextGrants,v),hrResponsibilities=boundedHrResponsibilities(nextHr,v,person,records);
 const b=new Map(baseline.map(g=>[g.module+'|'+g.tab,g])),a=new Map(access.map(g=>[g.module+'|'+g.tab,g]));
 const bh=new Map(beforeHr.map(g=>[g.action,g.scope])),ah=new Map(hrResponsibilities.map(g=>[g.action,g.scope]));
 const change:TemplateChange={personId:person.id,name:String(person.preferredName||person.name),version:person.version,added:access.filter(g=>!b.has(g.module+'|'+g.tab)),removed:baseline.filter(g=>!a.has(g.module+'|'+g.tab)),changed:access.filter(g=>b.has(g.module+'|'+g.tab)&&b.get(g.module+'|'+g.tab)!.level!==g.level).map(g=>({module:g.module,tab:g.tab,from:b.get(g.module+'|'+g.tab)!.level,to:g.level})),responsibilityChanges:[...new Set([...bh.keys(),...ah.keys()])].filter(k=>bh.get(k)!==ah.get(k)).map(k=>({action:k,from:bh.get(k)||'None',to:ah.get(k)||'None'}))};
 const next:FinRecord={...person,accessMode:'Custom',schoolAccessConfigured:true,access,hrResponsibilities,accessTemplateId:t.id,accessTemplateName:t.name,accessTemplateVersion:t.version,accessTemplateAppliedAt:new Date().toISOString(),accessTemplateAppliedBy:v.name,accessTemplateMode:mode,accessTemplateBaseline:t.access,accessTemplateHrBaseline:t.hrResponsibilities};
 return {next,change};
}
export function requireTemplate(records:FinRecord[],id:unknown,version:unknown):AccessTemplate{const t=templateList(records).find(x=>x.id===id);if(!t)throw new AppError('Permission set not found.',404);if(t.version!==version)throw new ConflictError('This permission set changed. Reload it before continuing.');return t;}
