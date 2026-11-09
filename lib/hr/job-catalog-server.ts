import {financeDb,financeFiles} from '@/db/finance';
import {displayPersonName} from '../people/display-name';
import type {Viewer,FinRecord} from '../finance/model';
import {AppError,ForbiddenError,ConflictError} from '../shared/errors';
import {decryptBytes,encryptBytes,encode,decode,recordId} from './server';
import {blankOnboarding,type HrRecord} from './model';
import {buildServerJobDescriptionPdf} from './job-description-pdf-server';
import {canAssignPerson,currentDescription,editionVisible,jobContent,mayCreateInDepartment,planEdition,type StoredEdition,type JobEdition} from './job-catalog';
import {directorJobReference} from './director-job-reference';
import {positionCatalog} from './job-catalog';
import {canUseHiring} from './hiring';
import {listRecord,taskList} from './workflow';

type SqlEdition={payload:string;status:StoredEdition['status']};
const db=()=>financeDb();
const int=(value:unknown)=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw new AppError('Choose a valid edition.');return value;};
async function fromRow(r:SqlEdition){return {...(await decode(r.payload) as StoredEdition),status:r.status};}
async function byId(id:string,version:number){
 const row=await db().prepare('SELECT payload,status FROM job_description_editions WHERE description_id=? AND version=?').bind(id,version).first<SqlEdition>();
 return row?fromRow(row):undefined;
}
function project(e:StoredEdition,v:Viewer,people:FinRecord[]):JobEdition{
 const {ownerId:_owner,file:_file,...publicEdition}=e;
 return {...publicEdition,departmentName:String(people.find(d=>d.kind==='department'&&d.id===e.departmentId)?.name||e.departmentName),canEdit:e.status!=='Archived'&&editionVisible(e,v,people,true)};
}
export async function getEdition(id:unknown,ver:unknown,v:Viewer,people:FinRecord[],edit=false){
 const e=await byId(recordId(id),int(ver));if(!e||!editionVisible(e,v,people,edit))throw new AppError('The selected job description is unavailable.',404);
 return e;
}
const personDept=(p:FinRecord,people:FinRecord[])=>people.find(d=>d.kind==='department'&&(d.id===p.department||d.id===p.departmentId||d.name===p.department))?.id||'';
export async function catalogListing(v:Viewer,people:FinRecord[],hr:HrRecord[]){
 const rows=await db().prepare('SELECT payload,status FROM job_description_editions ORDER BY version DESC').all<SqlEdition>();
 const all=await Promise.all(rows.results.map(fromRow)),departments=people.filter(d=>mayCreateInDepartment(v,d,people)).map(d=>({id:d.id,name:String(d.name)}));
 const descriptions=all.filter(e=>editionVisible(e,v,people)).map(e=>project(e,v,people)).sort((a,b)=>a.content.title.localeCompare(b.content.title)||b.version-a.version);
 const assignablePeople=people.filter(p=>canAssignPerson(v,p,people)).map(p=>{const doc=currentDescription(p.id,hr);return {id:p.id,name:displayPersonName(p),departmentId:personDept(p,people),...(doc?{currentDocumentId:doc.id,currentDescriptionId:doc.data.jobDescriptionId,currentDescriptionVersion:doc.data.jobDescriptionVersion,currentDescriptionTitle:String(doc.data.title||doc.data.fileName||'Job Description')}:{})};});
 return {descriptions,departments,assignablePeople,canCreate:!!departments.length,...(departments.length&&(positionCatalog(v,people,true)||canUseHiring(v,true)&&v.hrResponsibilities?.some(r=>r.action==='manageOnboarding'&&r.scope==='Company'))?{referenceTemplate:directorJobReference}:{})};
}
function audit(recordId:string,action:string,v:Viewer,version:number,at:string,payload:string){
 return db().prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),recordId,v.name,v.id,at,action,version,payload);
}
const check=(key:string)=>db().prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(key);
async function commit(statements:D1PreparedStatement[],message:string){
 try{await db().batch(statements);}catch(e){if(/constraint|unique|guard/i.test(String(e instanceof Error?e.message:e)))throw new ConflictError(message);throw e;}
}
export async function saveEdition(body:Record<string,unknown>,v:Viewer,people:FinRecord[]){
 const publish=body.action==='publish',department=people.find(d=>d.kind==='department'&&d.id===body.departmentId);
 if(!department||!mayCreateInDepartment(v,department,people))throw new ForbiddenError('Choose an active department within your authoring responsibility.');
 const source=body.id?await getEdition(body.id,body.version,v,people,true):undefined;
 if(!source&&(body.version||body.etag))throw new AppError('Choose the source edition to revise.');
 if(source&&source.departmentId!==department.id)throw new AppError('Start a separate description for a different department.');
 const latest=source?await db().prepare('SELECT MAX(version) AS v FROM job_description_editions WHERE description_id=?').bind(source.id).first<{v:number}>():undefined;
 const step=planEdition(source,latest?.v===source?.version?source:undefined,body.version,body.etag,publish),id=source?.id||'jd:'+crypto.randomUUID();
 const at=new Date().toISOString(),content=jobContent(body.content,publish);
 const e:StoredEdition={id,version:step.version,etag:step.etag,status:step.status,departmentId:department.id,departmentName:String(department.name),content,ownerId:source?.ownerId||v.person,updatedAt:at,updatedBy:v.name};
 let encryptedFile:Uint8Array|undefined;
 if(publish){
  const bytes=await buildServerJobDescriptionPdf(content),hash=await crypto.subtle.digest('SHA-256',bytes as BufferSource);
  e.file={storageKey:'hr/job-descriptions/'+crypto.randomUUID(),sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),size:bytes.length,fileName:content.title.replace(/[^a-zA-Z0-9 -]/g,'_').slice(0,130)+' - Job Description v'+step.version+'.pdf'};
  encryptedFile=await encryptBytes(bytes);
 }
 const payload=await encode(e),key=crypto.randomUUID(),stmts:D1PreparedStatement[]=[];
 if(publish)stmts.push(db().prepare("UPDATE job_description_editions SET status='Archived' WHERE description_id=? AND version<? AND status='Published'").bind(id,e.version));
 if(step.insert)stmts.push(db().prepare('INSERT INTO job_description_editions (description_id,version,etag,status,department_id,payload) VALUES (?,?,?,?,?,?)').bind(id,e.version,e.etag,e.status,department.id,payload));
 else stmts.push(db().prepare("UPDATE job_description_editions SET etag=?,status=?,payload=? WHERE description_id=? AND version=? AND status='Draft' AND etag=?").bind(e.etag,e.status,payload,id,e.version,source!.etag),check(key),db().prepare('DELETE FROM hr_write_guard WHERE id=?').bind(key));
 stmts.push(audit(id,publish?'Published Job Description':'Saved Job Description Draft',v,e.version,at,payload));
 if(e.file&&encryptedFile)await financeFiles().put(e.file.storageKey,encryptedFile,{httpMetadata:{contentType:'application/octet-stream'}});
 try{await commit(stmts,'This edition changed. Refresh the library before saving again.');}catch(err){if(e.file&&err instanceof ConflictError)await financeFiles().delete(e.file.storageKey);throw err;}
 return project(e,v,people);
}
export async function editionPdf(e:StoredEdition,v:Viewer){
 let bytes:Uint8Array;if(e.status==='Draft'){bytes=await buildServerJobDescriptionPdf(e.content);}
 else {if(!e.file)throw new AppError('The issued PDF is unavailable.',503);const obj=await financeFiles().get(e.file.storageKey);if(!obj)throw new AppError('The issued PDF is unavailable.',503);bytes=await decryptBytes(new Uint8Array(await obj.arrayBuffer()));}
 await audit(e.id,'Viewed Job Description PDF',v,e.version,new Date().toISOString(),await encode({id:e.id,version:e.version,status:e.status})).run();
 return bytes;
}
type HrWrite={old?:HrRecord;next:HrRecord;action:string};
async function hrWrite(w:HrWrite,v:Viewer,key:string):Promise<D1PreparedStatement[]>{
 const {next,old}=w,payload=await encode(next),s=old?db().prepare('UPDATE hr_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(payload,next.version,next.updatedAt,v.name,next.id,old.version):db().prepare('INSERT INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(next.id,next.kind,next.personId||null,payload,next.version,next.createdAt,next.createdBy,next.updatedAt,next.updatedBy);
 return [s,check(key),db().prepare('DELETE FROM hr_write_guard WHERE id=?').bind(key),audit(next.id,w.action,v,next.version,next.updatedAt,payload)];
}
/** May be committed with the applicant link. No visible partial assignment or signature task. */
export async function assignmentPlan(e:StoredEdition,personId:string,v:Viewer,people:FinRecord[],hr:HrRecord[],opts:{replaceDocumentId?:unknown;newSetup?:HrRecord;pinnedVacancy?:boolean}={}){
 const p=people.find(x=>x.id===personId&&x.kind==='person');
 if(!p||!canAssignPerson(v,p,people)||personDept(p,people)!==e.departmentId||!editionVisible(e,v,people,!opts.pinnedVacancy))throw new ForbiddenError('Choose a current employee in this department within your hiring responsibility.');
 if(!e.file||e.status==='Draft'||e.status==='Archived'&&!opts.pinnedVacancy)throw new AppError('Assign a published edition.');
 const prior=currentDescription(personId,hr),oldSetup=hr.find(r=>r.kind==='onboarding'&&r.personId===personId);
 const same=prior?.data.jobDescriptionId===e.id&&prior.data.jobDescriptionVersion===e.version;
 if(!same&&(prior?.id||'')!==(opts.replaceDocumentId||''))throw new ConflictError('The employee has an existing job description. Review and confirm the replacement in the library before proceeding.');
 const at=new Date().toISOString(),id=same?prior!.id:'hrdoc:'+crypto.randomUUID(),key=crypto.randomUUID();
 const record=(kind:HrRecord['kind'],rid:string,data:Record<string,unknown>):HrRecord=>({id:rid,kind,personId,version:1,createdAt:at,createdBy:v.name,updatedAt:at,updatedBy:v.name,data});
 const doc=same?prior!:record('document',id,{...e.file,category:'Job Description',mimeType:'application/pdf',signatureStatus:'Not Verified',uploadedAt:at,uploadedBy:v.name,uploadedById:v.id,jobDescriptionId:e.id,jobDescriptionVersion:e.version,jobDescriptionAssignedAt:at,title:e.content.title});
 const statements:D1PreparedStatement[]=[];
 if(!same){
  statements.push(db().prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,EXISTS(SELECT 1 FROM job_description_editions WHERE description_id=? AND version=? AND status=?)').bind(key+':issued',e.id,e.version,e.status),
   prior?.data.jobDescriptionId?db().prepare('UPDATE job_description_assignments SET document_id=? WHERE person_id=? AND document_id=?').bind(id,personId,prior.id):db().prepare('INSERT INTO job_description_assignments (person_id,document_id) VALUES (?,?)').bind(personId,id),check(key+':pointer'));
  if(prior){const superseded={...prior,version:prior.version+1,updatedAt:at,updatedBy:v.name,data:{...prior.data,assignmentSupersededBy:id}};statements.push(...await hrWrite({old:prior,next:superseded,action:'Superseded Job Description; Original Retained'},v,key+':superseded'));}
  statements.push(...await hrWrite({next:doc,action:'Assigned Published Job Description'},v,key+':document'));
 }
 let setup=oldSetup||opts.newSetup;
 if(!setup&&!p.onboardingClearedAt&&(p.status==='Onboarding'||p.onboardingRequired===true))setup=record('onboarding',crypto.randomUUID(),blankOnboarding('New Hire',p,people));
 if(setup&&setup.data.status!=='Cleared'&&!p.onboardingClearedAt&&(!same||taskList(setup.data).find(t=>t.key==='jobDescription')?.documentId!==id)){
  if(same)statements.push(db().prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,EXISTS(SELECT 1 FROM job_description_assignments WHERE person_id=? AND document_id=?)').bind(key+':current',personId,id));
  if(!oldSetup)statements.push(db().prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,NOT EXISTS(SELECT 1 FROM hr_records WHERE kind='onboarding' AND person_id=?)").bind(key+':unique-setup',personId));
  const next:HrRecord={...setup,version:oldSetup?oldSetup.version+1:1,updatedAt:at,updatedBy:v.name,data:{...setup.data,jobDescription:{...e.content},jobDescriptionUpdatedAt:doc.createdAt,jobDescriptionDocumentId:id,tasks:taskList(setup.data).map(t=>t.key==='jobDescription'?{key:t.key,label:t.label,owner:t.owner,required:t.required,status:'Pending',documentId:id}:t)}};
  statements.push(...await hrWrite({old:oldSetup,next,action:'Assigned Job Description for Onboarding Signature'},v,key+':setup'));setup=next;
 }
 if(statements.length)statements.push(db().prepare('DELETE FROM hr_write_guard WHERE id LIKE ?').bind(key+':%'));
 return {document:doc,onboardingId:setup?.id,statements,setup};
}
export async function assignEdition(body:Record<string,unknown>,v:Viewer,people:FinRecord[],hr:HrRecord[]){
 const e=await getEdition(body.id,body.version,v,people),plan=await assignmentPlan(e,recordId(body.personId),v,people,hr,{replaceDocumentId:body.replaceDocumentId});
 if(plan.statements.length)await commit(plan.statements,'This assignment changed. Refresh and review the current job description.');
 return {document:listRecord(plan.document),onboardingId:plan.onboardingId};
}

/** Derive vacancy text from the real selected edition, never trust the browser's summary. */
export async function vacancyDescriptionInput(body:Record<string,unknown>,v:Viewer,people:FinRecord[],hr:HrRecord[]){
 if(body.action!=='saveVacancy'||!body.data||typeof body.data!=='object'||Array.isArray(body.data))return {body};
 const data=body.data as Record<string,unknown>,old=hr.find(r=>r.id===body.id&&r.kind==='vacancy'),fields={...old?.data,...data};
 if(!fields.jobDescriptionId){
  if(fields.jobDescriptionVersion)throw new AppError('Choose a description for this version.');
  const legacy=!!old&&!old.data.jobDescriptionId&&!old.data.catalogWorkflow&&!!old.data.jobDescription;
  if(fields.status==='Open'&&!legacy)throw new AppError('Publish and select a job description before opening this vacancy.');
  return {body:legacy?body:{...body,data:{...data,jobDescription:''}}};
 }
 const edition=await getEdition(fields.jobDescriptionId,fields.jobDescriptionVersion,v,people);
 const pinned=old?.data.jobDescriptionId===edition.id&&old.data.jobDescriptionVersion===edition.version;
 if(fields.departmentId!==edition.departmentId||edition.status==='Archived'&&!pinned||edition.status==='Draft'&&fields.status!=='Draft')throw new AppError('Choose a published job description in this department before opening this vacancy.');
 return {body:{...body,data:{...data,jobDescription:edition.content.summary}},edition};
}
