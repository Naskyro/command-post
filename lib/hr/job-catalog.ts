import type { FinRecord, Viewer } from '../finance/model';
import type { HrRecord } from './model';
import { personnelJobDocuments } from './job-description-acceptance.ts';
import { AppError, ConflictError } from '../shared/errors.ts';
import { canCreateVacancyInDepartment, canReadVacancy, canUseHiring } from './hiring.ts';
import { hrCan } from './permissions.ts';
import { canAccess } from '../finance/access.ts';
export const jobContentFields=['title','flsaStatus','payBasis','reportsTo','summary','essentialFunctions','physicalDemands','workEnvironment','educationExperience','knowledgeSkills','supervises','collaboratesWith','authorityLimits','revisedBy','revisedDate'] as const;
export type JobContent=Record<string,string>;
export type JobEdition={id:string;version:number;etag:number;status:'Draft'|'Published'|'Archived';departmentId:string;departmentName:string;content:JobContent;updatedAt:string;updatedBy:string;canEdit:boolean};
export type StoredEdition=Omit<JobEdition,'canEdit'> & {ownerId:string;file?:{storageKey:string;sha256:string;size:number;fileName:string}};
export function jobContent(input:unknown,publish:boolean):JobContent {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('Enter the job description.');
 const content:JobContent={};for(const key of jobContentFields){const v=(input as JobContent)[key]??'';if(typeof v!=='string'||v.length>(['title','reportsTo','payBasis','flsaStatus','revisedBy','revisedDate'].includes(key)?250:12000))throw new AppError('Shorten or correct the '+key+' field.');content[key]=v.trim();}
 if(!content.title)throw new AppError('Enter a job description title.');
 const duties=content.essentialFunctions.split(/\r?\n/).map(s=>s.replace(/^\s*[-•]\s*/,'').trim()).filter(s=>s&&!/^(perform\s+)?other duties as (needed and )?assigned[.!]?$/i.test(s));
 if(publish&&(!duties.length||!content.summary||!content.reportsTo||!content.flsaStatus||!content.payBasis))throw new AppError('Before publishing, add a summary, reporting role, FLSA status, pay basis, and at least one role-specific essential duty.');
 content.essentialFunctions=[...duties,'Other duties as assigned'].join('\n');
 return content;
}
export const positionCatalog=(v:Viewer,people:FinRecord[],edit=false)=>hrCan(v,'managePositions',undefined,people)&&canAccess(v,'People & HR',undefined,edit);
export const mayCreateInDepartment=(v:Viewer,d:FinRecord,people:FinRecord[])=>d.kind==='department'&&d.status!=='Retired'&&(canCreateVacancyInDepartment(v,d)||positionCatalog(v,people,true));
export function editionVisible(e:StoredEdition,v:Viewer,people:FinRecord[],edit=false){
 if(positionCatalog(v,people,edit))return true;
 if(!canUseHiring(v,edit))return false;
 return canReadVacancy(v,{kind:'vacancy',data:{departmentId:e.departmentId,departmentName:people.find(d=>d.kind==='department'&&d.id===e.departmentId)?.name||e.departmentName,ownerId:e.ownerId}},people,edit);
}
export const canAssignPerson=(v:Viewer,p:FinRecord,people:FinRecord[])=>p.kind==='person'&&['Active','Onboarding','Leave'].includes(String(p.status))&&canUseHiring(v,true)&&hrCan(v,'manageOnboarding',p.id,people);
export function planEdition(current:StoredEdition|undefined,latest:StoredEdition|undefined,version:unknown,etag:unknown,publish:boolean){
 if(!current)return {version:1,etag:1,status:publish?'Published' as const:'Draft' as const,insert:true};
 if(version!==current.version||etag!==current.etag||current.version!==latest?.version||current.status==='Archived')throw new ConflictError('A newer edition or draft is already available. Refresh the library.');
 const insert=current.status==='Published';return {version:current.version+(insert?1:0),etag:insert?1:current.etag+1,status:publish?'Published' as const:'Draft' as const,insert};
}
export const currentDescription=(personId:string,records:HrRecord[])=>personnelJobDocuments(personId,records).current;
