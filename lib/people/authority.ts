import type { FinRecord, Viewer } from '../finance/model';
import { canAccess, grantsFor, schoolLearnerTabs, schoolInstructorTabs, type AccessGrant } from '../finance/access.ts';
import { hrCan, boundedHrResponsibilities, type HrResponsibility } from '../hr/permissions.ts';
import { authorityLevelOf, authorityLevels, canEditAccess, boundedGrants } from './policy.ts';
import { AppError, ForbiddenError } from '../shared/errors.ts';

const accessKey = (g: {module:string;tab:string}) => g.module + '|' + g.tab;
const rankForLevel = (level:string) => authorityLevels.indexOf(level as typeof authorityLevels[number]) + 1;
const scopes:Record<string,number>={Self:1,Team:2,Department:3,Company:4};
type AccessEffect=AccessGrant & {previousLevel:string};
type HrEffect=HrResponsibility & {previousScope:string};
const objects=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.filter(v=>v&&typeof v==='object'&&!Array.isArray(v)):[];

/** Small, bounded defaults; sensitive decisions always remain separately delegated. */
export function authorityTemplate(level:string) {
 const rank=rankForLevel(level);
 const access:AccessGrant[]=rank>0?[
  {module:'Home',tab:'home',level:'View'},
  ...['home','people','hiring','performance','benefits','records'].map(tab=>({module:'People & HR',tab,level:'View' as const})),
  ...['Today','Open shifts','Requests','Time off'].map(tab=>({module:'Timeclock',tab,level:'Edit' as const})),
  ...['Schedule','Timesheets','History'].map(tab=>({module:'Timeclock',tab,level:'View' as const})),
  {module:'Finance',tab:'My pay',level:'View'},
  {module:'SOP Library',tab:'library',level:'View'},{module:'SOP Library',tab:'assigned',level:'Edit'},
  ...schoolLearnerTabs.map(tab=>({module:'SOP Library',tab,level:'View' as const})),
 ]:[];
 if(rank>=2)for(const tab of ['home','people','performance','relations']){const found=access.find(g=>g.module==='People & HR'&&g.tab===tab);if(found)found.level='Edit';else access.push({module:'People & HR',tab,level:'Edit'});}
 if(rank>=2)access.push(...schoolInstructorTabs.map(tab=>({module:'SOP Library',tab,level:'Edit' as const})));
 if(rank>=3)access.push({module:'Finance',tab:'My spending',level:'Edit'});
 const hrResponsibilities:HrResponsibility[]=rank>=2?[{action:'viewPersonnel',scope:'Team'},{action:'recordPerformance',scope:'Team'}]:[];
 return {role:rank<=1?'Employee':rank===2?'Supervisor':'Department Head',access,hrResponsibilities};
}
export function authorityPresetSummary(level:string):string[] {
 const rank=rankForLevel(level);
 return [
  ...(rank>0?['Employee Self-Service: Timeclock, Own HR Records, Paystubs, School House Learning, and Assigned SOP Acknowledgments.']:[]),
  ...(rank>=2?['Create Courses and Quizzes, Assign Team Learning, and Review Team Scores in School House.']:[]),
  ...(rank>=2?['View Personnel Records and Record Coaching & Verbal Warnings for the Reporting Team.','Edit Access to HR Overview, People, Performance, and Employee Relations.']:['No Additional Management Permissions.']),
  ...(rank>=3?['Enter Personal Expense Reports in Finance → My Spending.']:[]),
  'Existing Permissions and Admin Overrides Are Preserved.',
  'No Owner, Admin, Payroll Approval, Banking, Termination, Spending Approval, or Physical Card Authority Is Added.',
 ];
}
export function authorityRank(viewer:Viewer,records:FinRecord[]) {
 if(viewer.owner)return 4;
 const actor=records.find(r=>r.kind==='person'&&r.id===viewer.person),level=actor?authorityLevelOf(actor):'';
 return rankForLevel(level)||({Owner:4,'Department Head':3,Supervisor:2,Employee:1}[viewer.role]||1);
}
export function canAssignAuthorityLevel(viewer:Viewer,target:FinRecord,records:FinRecord[],isNew=false) {
 if(viewer.onboardingOnly||target.id===viewer.person)return false;
 if(!viewer.owner&&(target.role==='Owner'||target.workerType==='Owner'))return false;
 const currentRank=rankForLevel(authorityLevelOf(target))||({Owner:4,'Department Head':3,Supervisor:2,Employee:1}[String(target.role)]||1);
 if(!viewer.owner&&currentRank>authorityRank(viewer,records))return false;
 const proposed=[...records.filter(r=>r.id!==target.id),target];
 return isNew?(canAccess(viewer,'People & HR','hiring',true)&&hrCan(viewer,'manageOnboarding',target.id,proposed)||canEditAccess(viewer,target,proposed)):canEditAccess(viewer,target,records);
}
export const canAssignAuthority=canAssignAuthorityLevel;
export function authorityAssignmentCapabilities(viewer:Viewer,records:FinRecord[]) {
 const canCreate=canAccess(viewer,'People & HR','hiring',true)&&(viewer.owner||!!viewer.hrResponsibilities?.some(g=>g.action==='manageOnboarding'));
 const editablePersonIds=records.filter(p=>p.kind==='person'&&canAssignAuthorityLevel(viewer,p,records)).map(p=>p.id);
 return {levels:canCreate||editablePersonIds.length?authorityLevels.slice(0,authorityRank(viewer,records)):[],editablePersonIds,canCreate};
}

/** Admin changes own their checked/unchecked state, including future promotions. */
export function captureAuthorityOverrides(old:FinRecord,next:FinRecord):FinRecord {
 const universe=authorityTemplate('Executive'),before=new Map(grantsFor(old).map(g=>[accessKey(g),g])),after=new Map(grantsFor(next).map(g=>[accessKey(g),g]));
 const accessOverrides=new Map(objects(old.authorityAccessOverrides).map(g=>[String(g.module)+'|'+String(g.tab),g]));
 const accessEffects=objects(old.authorityTemplateAccess);
 const changedAccess=new Set<string>();
 for(const g of universe.access){const key=accessKey(g);if(before.get(key)?.level!==after.get(key)?.level){changedAccess.add(key);accessOverrides.set(key,{module:g.module,tab:g.tab,level:after.get(key)?.level||'None'});}}
 const oldHr=new Map(objects(old.hrResponsibilities).map(g=>[String(g.action),g])),newHr=new Map(objects(next.hrResponsibilities).map(g=>[String(g.action),g]));
 const hrOverrides=new Map(objects(old.authorityHrOverrides).map(g=>[String(g.action),g])),changedHr=new Set<string>();
 for(const g of universe.hrResponsibilities)if(oldHr.get(g.action)?.scope!==newHr.get(g.action)?.scope){changedHr.add(g.action);hrOverrides.set(g.action,{action:g.action,scope:newHr.get(g.action)?.scope||'None'});}
 return {...next,authorityAccessOverrides:[...accessOverrides.values()],authorityHrOverrides:[...hrOverrides.values()],authorityTemplateAccess:accessEffects.filter(g=>!changedAccess.has(String(g.module)+'|'+String(g.tab))),authorityTemplateHr:objects(old.authorityTemplateHr).filter(g=>!changedHr.has(String(g.action)))};
}

/** Explicit saved level changes only: never a background migration or title inference. */
export function applyAuthorityLevel(old:FinRecord|undefined,next:FinRecord,viewer:Viewer,records:FinRecord[],at=new Date().toISOString()):FinRecord {
 const level=authorityLevelOf(next),prior=old?authorityLevelOf(old):'';
 if(level===prior)return next;
 if(!authorityLevels.includes(level as typeof authorityLevels[number]))throw new AppError('Choose an authority level before changing it.');
 if(!canAssignAuthorityLevel(viewer,old||next,records,!old))throw new ForbiddenError('Authority changes require assigned user-access administration for this employee.');
 if(rankForLevel(level)>authorityRank(viewer,records))throw new ForbiddenError('You cannot assign an authority level above your own.');
 const template=authorityTemplate(level);
 const provenance={authorityTemplateVersion:1,authorityTemplateAppliedAt:at,authorityTemplateAppliedBy:viewer.name,authorityTemplateAppliedById:viewer.id};
 if(!old){
  // The new-hire form displays the selected preset as real checkboxes. Submitted
  // arrays are the reviewed final selection; omitted values use that preset.
  // Derive provenance server-side rather than trusting client metadata.
  const access=boundedGrants(next.access===undefined?template.access:next.access,viewer);
  const hrResponsibilities=boundedHrResponsibilities(next.hrResponsibilities===undefined?template.hrResponsibilities:next.hrResponsibilities,viewer,next,[...records,next]);
  const actualAccess=new Map(access.map(g=>[accessKey(g),g])),actualHr=new Map(hrResponsibilities.map(g=>[g.action,g]));
  return {...next,authorityLevel:level,role:template.role,accessMode:'Custom',access,hrResponsibilities,...provenance,
   authorityTemplateAccess:template.access.filter(g=>actualAccess.get(accessKey(g))?.level===g.level).map(g=>({...g,previousLevel:''})),
   authorityAccessOverrides:template.access.filter(g=>actualAccess.get(accessKey(g))?.level!==g.level).map(g=>({module:g.module,tab:g.tab,level:actualAccess.get(accessKey(g))?.level||'None'})),
   authorityTemplateHr:template.hrResponsibilities.filter(g=>actualHr.get(g.action)?.scope===g.scope).map(g=>({...g,previousScope:''})),
   authorityHrOverrides:template.hrResponsibilities.filter(g=>actualHr.get(g.action)?.scope!==g.scope).map(g=>({action:g.action,scope:actualHr.get(g.action)?.scope||'None'})),
  };
 }
 // Freeze prior effective legacy access before changing role, preventing role
 // fallback from silently granting broader permissions to the promoted person.
 const current=old?(next.accessMode==='Custom'?grantsFor(next):grantsFor(old)):grantsFor({...next,accessMode:'Custom'});
 const grants=new Map(current.map(g=>[accessKey(g),{...g}]));
 const responsibilities=new Map(objects(next.hrResponsibilities).map(g=>[String(g.action),{...g}]));
 const deniedAccess=new Set(objects(next.authorityAccessOverrides).map(g=>String(g.module)+'|'+String(g.tab))),deniedHr=new Set(objects(next.authorityHrOverrides).map(g=>String(g.action)));
 for(const effect of objects(next.authorityTemplateAccess)){
  const key=String(effect.module)+'|'+String(effect.tab);
  if(deniedAccess.has(key)||grants.get(key)?.level!==effect.level)continue;
  if(effect.previousLevel==='View'||effect.previousLevel==='Edit')grants.set(key,{module:String(effect.module),tab:String(effect.tab),level:effect.previousLevel});else grants.delete(key);
 }
 for(const effect of objects(next.authorityTemplateHr)){
  const action=String(effect.action);if(deniedHr.has(action)||responsibilities.get(action)?.scope!==effect.scope)continue;
  if(scopes[String(effect.previousScope)])responsibilities.set(action,{action,scope:effect.previousScope});else responsibilities.delete(action);
 }
 const addedAccess:AccessEffect[]=[],addedHr:HrEffect[]=[];
 for(const grant of template.access){
  const key=accessKey(grant),previous=grants.get(key);if(deniedAccess.has(key)||previous?.level==='Edit'||previous?.level===grant.level)continue;
  if(!canAccess(viewer,grant.module,grant.tab,grant.level==='Edit'))throw new ForbiddenError('This authority template includes access you are not allowed to delegate. Ask an authorized administrator.');
  grants.set(key,{...grant});addedAccess.push({...grant,previousLevel:previous?.level||''});
 }
 for(const grant of template.hrResponsibilities){
  const previous=responsibilities.get(grant.action);if(deniedHr.has(grant.action)||scopes[String(previous?.scope)]>=scopes[grant.scope])continue;
  boundedHrResponsibilities([grant],viewer,next,[...records.filter(r=>r.id!==next.id),next]);
  responsibilities.set(grant.action,{...grant});addedHr.push({...grant,previousScope:String(previous?.scope||'')});
 }
 return {...next,authorityLevel:level,role:old.role==='Owner'?'Owner':template.role,accessMode:'Custom',access:[...grants.values()],hrResponsibilities:[...responsibilities.values()],authorityTemplateAccess:addedAccess,authorityTemplateHr:addedHr,...provenance};
}
