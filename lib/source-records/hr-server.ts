import {createHash} from 'node:crypto';
import {financeDb} from '@/db/finance';
import {requestRoster} from '@/lib/finance/server';
import type {Viewer} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
import {hrCan} from '@/lib/hr/permissions';
import {encode,decode} from '@/lib/hr/server';
import {requireSourceAccess} from '@/lib/source-files/authorization';
import {canSeeRegister,leadership,sectionAccess,type StoredRegisterRecord} from '@/lib/ccr/register-model';
import {importLicenseEdition,readImportedLicense} from '@/lib/ccr/register-server';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import {sourcePerson,categoryOf,historicalTarget,type SourceCredential,type SourcePerson} from './hr-model';
type Entry={record:SourcePerson;filedBy:string;filedAt:string};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const id=(p:SourcePerson,c:SourceCredential)=>'license-'+hash([p.sourceFolderId,c.sourceDriveId,c.page||'',c.credentialType].join('|')).slice(0,42);
const table='hr_source_people';
const db=financeDb;
function store<T>(fn:(d:D1Database)=>Promise<T>){return fn(db());}
export async function knownHistorical(id:string){const row=await store(d=>d.prepare('SELECT 1 AS found FROM '+table+' WHERE target_id=? LIMIT 1').bind(id).first());return !!row;}
const targetOf=(r:SourcePerson)=>r.personId||historicalTarget(r.sourceFolderId);
async function stored(folder:string){const row=await store(d=>d.prepare('SELECT payload FROM '+table+' WHERE folder_id=?').bind(folder).first<{payload:string}>());return row?await decode(row.payload) as Entry:undefined;}
async function licenseProjection(v:Viewer,p:SourcePerson,c:SourceCredential,stamp:string,name:string):Promise<StoredRegisterRecord>{
 return {id:id(p,c),version:1,section:'licenses',title:name+' · '+c.credentialType,category:categoryOf(c.credentialType),status:'In Review',ownerId:p.personId!,ownerName:name,reference:c.credentialNumber||'',resolutionReference:'',dueOn:c.expiresOn||'',nextAction:'Review the documented license and any later renewals.',amountCents:null,steps:['Source Document Indexed'],createdAt:stamp,createdBy:v.name,createdPerson:v.person,updatedAt:stamp,updatedBy:v.name,actorId:v.id,history:[{at:stamp,by:v.name,version:1,changes:['Personnel Credential Indexed'],note:[c.issuedOn?'Issued: '+c.issuedOn:'',c.expiresOn?'Expires: '+c.expiresOn:'Expiration not documented',c.page?'Source page '+c.page:''].filter(Boolean).join(' · ')}],files:[]};
}
export async function ingestPerson(v:Viewer,action:unknown,input:unknown){
 if(action!=='import'&&action!=='receipt')throw new AppError('Choose an import or filing receipt.');
 const edit=action==='import';await requireSourceAccess(v,'hr',edit);
 const p=sourcePerson(input),target=targetOf(p),roster=await requestRoster(),person=p.personId&&roster.find(x=>x.kind==='person'&&x.id===p.personId);
 if(p.personId&&!person)throw new AppError('The mapped personnel file does not exist. Leave it unlinked until identity is confirmed.');
 if(person&&p.credentials.length&&!sectionAccess(v,'licenses',edit))throw new ForbiddenError('License filing requires licensed-register access.');
 let entry=await stored(p.sourceFolderId);
 if(entry&&JSON.stringify(entry.record)!==JSON.stringify(p))throw new ConflictError('This folder already has a different reviewed personnel index. Reconcile its mapping or records before filing.');
 const resp=(receiptStatus:'filed'|'missing',credentialCount:number)=>({recordId:target,receiptStatus,credentialCount,mappedPerson:!!person});
 if(!entry&&!edit)return resp('missing',0);
 if(!entry){const at=new Date().toISOString(),candidate={record:p,filedBy:v.name,filedAt:at},payload=await encode(candidate);await store(d=>d.prepare('INSERT OR IGNORE INTO '+table+'(folder_id,target_id,payload) VALUES(?,?,?)').bind(p.sourceFolderId,target,payload).run());entry=await stored(p.sourceFolderId);if(!entry||JSON.stringify(entry.record)!==JSON.stringify(p))throw new ConflictError('Personnel filing changed during import.');}
 let confirmed=0;
 if(person)for(const c of p.credentials){
  const rid=id(p,c);let r=await readImportedLicense(rid);
  if(!r&&edit){await importLicenseEdition(await licenseProjection(v,p,c,entry.filedAt,String(person.name)));r=await readImportedLicense(rid);}
  if(r&&r.ownerId===p.personId&&r.section==='licenses')confirmed++;else if(r)throw new ConflictError('The linked license record requires review.');
 }
 return resp(!person||confirmed===p.credentials.length?'filed':'missing',person?confirmed:p.credentials.length);
}
export async function personnelIndex(v:Viewer,target:string,history:boolean){
 const roster=await requestRoster();if(!v.person||v.id.startsWith('preview:')||v.onboardingOnly||!canAccess(v,'People & HR'))throw new ForbiddenError();
 if(history){await requireSourceAccess(v,'hr');const res=await store(d=>d.prepare("SELECT payload FROM "+table+" WHERE target_id LIKE 'history-%'").all<{payload:string}>());return {people:await Promise.all(res.results.map(async row=>{const e=await decode(row.payload) as Entry;return {id:targetOf(e.record),name:e.record.sourceName,sourceRosterStatus:e.record.sourceRosterStatus,credentialCount:e.record.credentials.length};}))};}
 if(target.startsWith('history-'))await requireSourceAccess(v,'hr');
 else if(!target||!roster.some(p=>p.kind==='person'&&p.id===target)||target!==v.person&&!['viewPersonnel','managePersonnel'].some(a=>hrCan(v,a,target,roster)))throw new ForbiddenError();
 const res=await store(d=>d.prepare('SELECT payload FROM '+table+' WHERE target_id=?').bind(target).all<{payload:string}>());
 const entries=await Promise.all(res.results.map(async row=>{const e=await decode(row.payload) as Entry;const credentials=await Promise.all(e.record.credentials.map(async c=>{
   const r=e.record.personId?await readImportedLicense(id(e.record,c)):undefined;
   return {type:c.credentialType,agency:c.agency,issuedOn:c.issuedOn,expiresOn:r?r.dueOn:c.expiresOn||'',number:c.credentialType==="Driver's License"?undefined:r&&canSeeRegister(r,v,leadership(v,roster))?r.reference:c.credentialNumber,asRecorded:c.statusAsRecorded,sourcePage:c.page,registerId:r&&canSeeRegister(r,v,leadership(v,roster))?r.id:undefined};
 }));return {name:e.record.sourceName,sourceRosterStatus:e.record.sourceRosterStatus,filedAt:e.filedAt,filedBy:e.filedBy,credentials};}));return {entries};
}
