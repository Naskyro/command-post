import {requireSourceAccess} from '@/lib/source-files/authorization';
import {financeDb,financeFiles} from '@/db/finance';
import {allRecords} from '@/lib/finance/server';
import {claimChoiceRows} from '@/lib/accounts/server';
import {operationalChoices} from './claim-operations';
import {encode,decode,encryptBytes,decryptBytes} from '@/lib/hr/server';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import type {Viewer,FinRecord} from '@/lib/finance/model';
import {registerSections,sectionAccess,commandAccess,leadership,ownerChoices,summaryItem,publicRegisterRecord,canSeeRegister,checkedId,prepareRegister,appendHistory,type RegisterSection,type RegisterRecord,type RegisterFile,type StoredRegisterRecord} from './register-model';
import {classifyDocument,documentTypeLabel} from './document-types';
import {validatedDocumentFile,validatedDocumentBytes,ccrTdlrFileBytes} from './document-input';
const table='ccr_register_versions';
const sqlCreate='CREATE TABLE IF NOT EXISTS ccr_register_versions (record_id TEXT NOT NULL, section TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(record_id,version))';
const sqlIndex='CREATE INDEX IF NOT EXISTS ccr_register_section_id_version ON ccr_register_versions (section,record_id,version)';
// Existing private installations can receive the worker shortly before the additive D1 migration.
// Install only this module's empty table and only for the specific missing-table error.
async function withStorage<T>(fn:(db:D1Database)=>Promise<T>):Promise<T>{const db=financeDb();try{return await fn(db);}catch(e){if(!/no such table:\s*(?:main\.)?ccr_register_versions\b/i.test(String(e)))throw e;await db.prepare(sqlCreate).run();await db.prepare(sqlIndex).run();return fn(db);}}
async function edition(section:RegisterSection,id:string){const row=await withStorage(db=>db.prepare('SELECT payload FROM '+table+' WHERE section=? AND record_id=? ORDER BY version DESC LIMIT 1').bind(section,id).first<{payload:string}>());return row?await decode(row.payload) as StoredRegisterRecord:undefined;}
export async function reviewableTdlr(v:Viewer,staff:FinRecord[],id:string){const r=await edition('tdlr',checkedId(id));if(!r||!canSeeRegister(r,v,leadership(v,staff)))throw new AppError('Complaint not found.',404);return r;}
async function latest(v:Viewer,sections:RegisterSection[],lead:boolean):Promise<StoredRegisterRecord[]>{
 const allowed=sections.filter(s=>sectionAccess(v,s));if(!allowed.length)return [];
 const data=await withStorage(db=>db.prepare('SELECT a.payload FROM '+table+' a JOIN (SELECT section,record_id,MAX(version) AS ver FROM '+table+' WHERE section IN ('+allowed.map(()=>'?').join(',')+') GROUP BY section,record_id) b ON a.section=b.section AND a.record_id=b.record_id AND a.version=b.ver ORDER BY a.updated_at DESC,a.record_id').bind(...allowed).all<{payload:string}>());
 const rows=await Promise.all(data.results.map(r=>decode(r.payload) as Promise<StoredRegisterRecord>));return rows.filter(r=>allowed.includes(r.section)&&canSeeRegister(r,v,lead));
}
export async function getRegisterForExpense(v:Viewer,staff:FinRecord[],id:string){
 if(!sectionAccess(v,'recovery',true))throw new ForbiddenError();
 const r=await edition('recovery',checkedId(id));return r&&canSeeRegister(r,v,leadership(v,staff))?r:undefined;
}
export async function registerChoices(v:Viewer,section:RegisterSection){
 if(!['recovery','legal'].includes(section)||!sectionAccess(v,section))throw new ForbiddenError();
 return {accounts:operationalChoices([],await claimChoiceRows()).accounts};
}
export async function getRegister(v:Viewer,section:RegisterSection,staff:FinRecord[]){
 if(!sectionAccess(v,section))throw new ForbiddenError();const lead=leadership(v,staff),canEdit=sectionAccess(v,section,true);return {rows:(await latest(v,[section],lead)).map(publicRegisterRecord),canEdit,canResolve:canEdit&&lead,owners:ownerChoices(v,section,staff)};
}
export async function registerSummary(v:Viewer,staff?:FinRecord[]){if(!commandAccess(v))throw new ForbiddenError();const sections=registerSections.filter(s=>sectionAccess(v,s));if(!sections.length)return {items:[],sections};return {items:(await latest(v,sections,leadership(v,staff||await allRecords()))).map(summaryItem),sections};}
type ArchiveEdition=Pick<RegisterRecord,'id'|'section'|'version'|'title'|'status'|'createdAt'|'updatedAt'>;
export async function registerEditions(v:Viewer,staff?:FinRecord[]):Promise<ArchiveEdition[]>{
 const sections=registerSections.filter(s=>sectionAccess(v,s));if(!sections.length)return [];
 const current=await latest(v,sections,leadership(v,staff||await allRecords()));const out:ArchiveEdition[]=[];
 for(let i=0;i<current.length;i+=75){const ids=current.slice(i,i+75).map(r=>r.id);const data=await withStorage(db=>db.prepare('SELECT payload FROM '+table+' WHERE section IN ('+sections.map(()=>'?').join(',')+') AND record_id IN ('+ids.map(()=>'?').join(',')+') ORDER BY record_id,version').bind(...sections,...ids).all<{payload:string}>());out.push(...await Promise.all(data.results.map(async row=>{const {id,section,version,title,status,createdAt,updatedAt}=await decode(row.payload) as StoredRegisterRecord;return {id,section,version,title,status,createdAt,updatedAt};})));}
 return out;
}
export async function insertReviewedRegisterEdition(next:StoredRegisterRecord){const payload=await encode(next);if(payload.length>1500000)throw new AppError('This case history exceeds the protected record size limit.',413);const result=await withStorage(db=>db.prepare('INSERT OR IGNORE INTO '+table+' (record_id,section,version,payload,updated_at) VALUES(?,?,?,?,?)').bind(next.id,next.section,next.version,payload,next.updatedAt).run());if(result.meta.changes!==1)throw new ConflictError();}
export async function saveRegister(v:Viewer,s:RegisterSection,body:Record<string,unknown>,staff:FinRecord[]){
 if(!sectionAccess(v,s,true))throw new ForbiddenError();const old=body.id?await edition(s,checkedId(body.id)):undefined,lead=leadership(v,staff);if(body.id&&(!old||!canSeeRegister(old,v,lead)))throw new AppError('Record not found in this register.',404);
 const accounts=(s==='recovery'&&body.chargeback!==undefined||s==='legal'&&body.legalNotice!==undefined)?(await registerChoices(v,s)).accounts:undefined;
 const next=prepareRegister(v,s,body,old,ownerChoices(v,s,staff),lead,new Date().toISOString(),accounts);await insertReviewedRegisterEdition(next);return publicRegisterRecord(next);
}
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
function key(rid:string,id:string){return 'ccr-register-evidence/'+rid+'/'+id;}
export async function authorizeRegisterDocument(v:Viewer,s:RegisterSection,id:string,version:number,staff:FinRecord[],documentType:unknown,otherDocumentType?:unknown){
 if(!sectionAccess(v,s,true))throw new ForbiddenError();
 const old=await edition(s,checkedId(id));if(!old||!canSeeRegister(old,v,leadership(v,staff)))throw new AppError('Record not found in this register.',404);
 if(old.version!==version)throw new ConflictError();if(old.files.length>=200)throw new AppError('This record already contains 200 evidence files.');
 return {old,classification:classifyDocument(s,documentType,otherDocumentType)};
}
export async function uploadRegisterFile(v:Viewer,s:RegisterSection,id:string,version:number,file:File|{name:string;read:()=>Promise<Uint8Array<ArrayBuffer>>},staff:FinRecord[],documentType:unknown,otherDocumentType?:unknown){
 const {old,classification}=await authorizeRegisterDocument(v,s,id,version,staff,documentType,otherDocumentType);
 if(!(file instanceof File)&&s!=='tdlr')throw new AppError('Large packet uploads are only available on a TDLR complaint.');
 const doc=file instanceof File?await validatedDocumentFile(file):validatedDocumentBytes(await file.read(),file.name,ccrTdlrFileBytes);
 return appendRegisterDocument(v,old,classification,doc);
}
export async function attachStagedRegisterFile(v:Viewer,s:RegisterSection,id:string,version:number,doc:ReturnType<typeof validatedDocumentBytes>,staff:FinRecord[],documentType:unknown,otherDocumentType?:unknown,sourceReceipt?:RegisterFile['sourceReceipt']){
 const {old,classification}=await authorizeRegisterDocument(v,s,id,version,staff,documentType,otherDocumentType);
 return appendRegisterDocument(v,old,classification,doc,sourceReceipt);
}
async function appendRegisterDocument(v:Viewer,old:StoredRegisterRecord,classification:ReturnType<typeof classifyDocument>,{bytes,name,type}:ReturnType<typeof validatedDocumentBytes>,sourceReceipt?:RegisterFile['sourceReceipt']){
 const at=new Date().toISOString(),fid=crypto.randomUUID();
 const attachment:RegisterFile={...(sourceReceipt?{sourceReceipt}:{}),id:fid,name,type,...classification,bytes:bytes.byteLength,sha256:hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))),at,by:v.name};
 const next=appendHistory({...old,version:old.version+1,files:[...old.files,attachment]},v,at,['Evidence Attached'],documentTypeLabel(attachment)+' · '+name);
 const bucket=financeFiles(),r2key=key(old.id,fid);await bucket.put(r2key,await encryptBytes(bytes),{httpMetadata:{contentType:'application/octet-stream'}});
 // Clean only a known version conflict; on indeterminate D1/network errors retain encrypted evidence rather than deleting a potentially committed file.
 try{await insertReviewedRegisterEdition(next);}catch(e){if(e instanceof ConflictError)await bucket.delete(r2key).catch(()=>{});throw e;}return publicRegisterRecord(next);
}
export async function downloadRegisterFile(v:Viewer,s:RegisterSection,id:string,fileId:string,staff:FinRecord[]){
 if(!sectionAccess(v,s))throw new ForbiddenError();const old=await edition(s,checkedId(id));
 if(!old||!canSeeRegister(old,v,leadership(v,staff)))throw new AppError('File not found.',404);
 const f=old.files.find(x=>x.id===checkedId(fileId));if(!f)throw new AppError('File not found.',404);
 if(f.sourceReceipt){if(s!=='tdlr')throw new ForbiddenError();await requireSourceAccess(v,'tdlr',false,staff);}
 const obj=await financeFiles().get(key(old.id,f.id));if(!obj)throw new AppError('The stored evidence file is unavailable.',503);
 const bytes=await decryptBytes(new Uint8Array(await obj.arrayBuffer()));
 if(bytes.byteLength!==f.bytes||hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)))!==f.sha256)throw new AppError('The stored file could not be verified.',503);
 return {bytes,f};
}

// Source personnel imports use an opaque stable key and never expose original HR documents in CCR.
export function readImportedLicense(id:string){return edition('licenses',checkedId(id));}
export async function importLicenseEdition(r:StoredRegisterRecord){
 if(r.section!=='licenses'||r.version!==1||!r.id.startsWith('license-'))throw new AppError('Invalid imported license.');
 try{await insertReviewedRegisterEdition(r);}catch(e){if(!(e instanceof ConflictError)||!await readImportedLicense(r.id))throw e;}
}
