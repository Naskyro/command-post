import {createHash} from 'node:crypto';
import {financeDb,financeFiles} from '@/db/finance';
import {yearCaseRows} from '@/lib/accounts/server';
import {decode,encode,encryptBytes,decryptBytes,readAssetClaims} from '@/lib/hr/server';
import {displayPersonName} from '@/lib/people/display-name';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {medicalAcknowledgment,medicalElectronicConsent,medicalDay,medicalToday,medicalText,medicalPermissions,requireMedicalAccess,medicalSchedule,prepareMedicalReport,medicalReportContent,type AccidentLink,type MedicalCase,type MedicalCaseSummary,type MedicalCaseResponse,type MedicalReport,type MedicalActor,type MedicalFile} from './accident-reports';

const table='hr_accident_medical_versions';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const caseId=(claimKey:string,driverId:string)=>'amr_'+hash(JSON.stringify([claimKey,driverId]));
const fileKey=(id:string,fileId:string)=>'hr-accident-medical/'+id+'/'+fileId;
const actor=(v:Viewer,at:string):MedicalActor=>({personId:v.person,actorId:v.id,name:v.name,at});
const safeId=(id:unknown)=>{if(typeof id!=='string'||!/^amr_[a-f0-9]{64}$/.test(id))throw new AppError('Choose a saved accident report.',404);return id;};
const claimId=(id:unknown)=>{if(typeof id!=='string'||!/^(?:claim|intake|asset-claim):[A-Za-z0-9:_-]{1,180}$/.test(id))throw new AppError('Choose a linked accident claim.');return id;};
const driverId=(id:unknown)=>{if(typeof id!=='string'||!/^[A-Za-z0-9:_-]{1,150}$/.test(id))throw new AppError('Choose the involved driver.');return id;};
const unchanged=(version:unknown,old:MedicalCase)=>{if(!Number.isInteger(version)||version!==old.version)throw new ConflictError('This accident report changed. Refresh before saving.');};
async function storage<T>(run:(db:D1Database)=>Promise<T>):Promise<T>{
 const db=financeDb();try{return await run(db);}catch(e){
  if(!/no such table:\s*(?:main\.)?hr_accident_medical_(?:versions|access)\b/i.test(String(e)))throw e;
  await db.batch([
   db.prepare('CREATE TABLE IF NOT EXISTS hr_accident_medical_versions(id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(id,version))'),
   db.prepare('CREATE TABLE IF NOT EXISTS hr_accident_medical_access(id TEXT PRIMARY KEY NOT NULL,case_id TEXT NOT NULL,actor_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL)')
  ]);return run(db);
 }
}
async function savedCases():Promise<MedicalCase[]>{const rows=await storage(db=>db.prepare('SELECT a.payload FROM '+table+' a JOIN (SELECT id,MAX(version) AS v FROM '+table+' GROUP BY id) x ON a.id=x.id AND a.version=x.v').all<{payload:string}>());return Promise.all(rows.results.map(r=>decode(r.payload)));}
async function savedCase(id:string):Promise<MedicalCase|undefined>{const row=await storage(db=>db.prepare('SELECT payload FROM '+table+' WHERE id=? ORDER BY version DESC LIMIT 1').bind(id).first<{payload:string}>());return row?decode(row.payload):undefined;}
async function saveCase(next:MedicalCase){const payload=await encode(next);if(payload.length>1500000)throw new AppError('This report history has reached its storage limit. Contact the designated reviewer.',413);try{await storage(db=>db.prepare('INSERT INTO '+table+'(id,version,payload,updated_at) VALUES(?,?,?,?)').bind(next.id,next.version,payload,next.updatedAt).run());}catch(e){if(/UNIQUE constraint|PRIMARY KEY constraint/i.test(String(e)))throw new ConflictError('This accident report changed. Refresh before saving.');throw e;}}
export async function auditMedicalAccess(record:MedicalCase,v:Viewer,action:string){await storage(db=>db.prepare('INSERT INTO hr_accident_medical_access(id,case_id,actor_id,at,action) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),record.id,v.id,new Date().toISOString(),action).run());}
function validSourceDay(value:unknown){try{return medicalDay(value,'accident date',false);}catch{return '';}}
/** Only incident identifiers and driver linkage leave the general claim store. */
async function links(people:FinRecord[]):Promise<AccidentLink[]>{
 const [accounts,intakes,assets]=await Promise.all([yearCaseRows(),financeDb().prepare('SELECT a.payload FROM ccr_damage_intake_versions a JOIN (SELECT id,MAX(version) AS v FROM ccr_damage_intake_versions GROUP BY id) x ON a.id=x.id AND a.version=x.v').all<{payload:string}>(),readAssetClaims()]);
 const source:Record<string,unknown>[]=[...accounts.filter(r=>r.kind==='claim').map(r=>({...r,claimKey:'claim:'+r.id,title:r.name})),...await Promise.all(intakes.results.map(async row=>{const r=await decode(row.payload);return {...r,claimKey:'intake:'+r.id};})),...assets.map(r=>({...r.data,claimKey:'asset-claim:'+r.id,driverId:r.data.driverId||r.personId}))];
 return source.flatMap(r=>{
  if(r.deletedAt||r.example||r.sample||r.trainingSample||r.isDemo||r.isSample||!(r.accidentInvolved==='Yes'||r.driverInjury==='Yes'))return [];
  const person=people.find(p=>p.kind==='person'&&p.id===r.driverId);if(!person)return [];
  return [{claimKey:String(r.claimKey),title:String(r.title||'Driver Accident'),driverId:person.id,driverName:displayPersonName(person),driverStatus:String(person.status||''),accidentOn:validSourceDay(r.accidentOn||r.incidentDate),initialReportRequested:r.driverInjury==='Yes'}];
 });
}
function emptyCase(link:AccidentLink):MedicalCase{return {...link,id:caseId(link.claimKey,link.driverId),version:0,createdAt:'',updatedAt:'',reports:[],contacts:[]};}
function currentLink(record:MedicalCase,link?:AccidentLink):MedicalCase{
 if(!link)return record;
 const dateChanged=!!link.accidentOn&&link.accidentOn!==record.accidentOn;
 return {...record,title:link.title,driverName:link.driverName,driverStatus:link.driverStatus,initialReportRequested:record.initialReportRequested||link.initialReportRequested,...(dateChanged?{accidentOn:link.accidentOn,previousAccidentDates:[...new Set([...(record.previousAccidentDates||[]),record.accidentOn].filter(Boolean))]}:{})};
}
export async function medicalCase(v:Viewer,people:FinRecord[],input:Record<string,unknown>):Promise<MedicalCase>{
 let existing:MedicalCase|undefined;
 if(input.caseId){existing=await savedCase(safeId(input.caseId));if(!existing)throw new AppError('Accident report not found.',404);requireMedicalAccess(v,existing.driverId,people);return currentLink(existing,(await links(people)).find(r=>r.claimKey===existing!.claimKey&&r.driverId===existing!.driverId));}
 const key=claimId(input.claimKey),person=driverId(input.driverId);requireMedicalAccess(v,person,people);existing=await savedCase(caseId(key,person));
 const link=(await links(people)).find(r=>r.claimKey===key&&r.driverId===person);if(existing)return currentLink(existing,link);if(!link)throw new AppError('Save the involved driver and accident details on the claim first.',404);return emptyCase(link);
}
export async function medicalCaseView(v:Viewer,people:FinRecord[],input:Record<string,unknown>):Promise<MedicalCaseResponse>{const record=await medicalCase(v,people,input),permissions=requireMedicalAccess(v,record.driverId,people);if(record.version)await auditMedicalAccess(record,v,'Viewed Report');return {record,permissions,schedule:medicalSchedule(record),acknowledgment:medicalAcknowledgment};}
export async function medicalCaseList(v:Viewer,people:FinRecord[],personFilter?:string):Promise<MedicalCaseSummary[]>{
 if(!v.person||!v.id||v.id.startsWith('preview:')||v.onboardingOnly)throw new ForbiddenError();
 if(personFilter)requireMedicalAccess(v,personFilter,people);
 const [current,saved]=await Promise.all([links(people),savedCases()]),all=new Map(saved.map(r=>[r.id,r]));
 for(const link of current){const id=caseId(link.claimKey,link.driverId),prior=all.get(id);all.set(id,prior?currentLink(prior,link):emptyCase(link));}
 return [...all.values()].flatMap(r=>{const permissions=medicalPermissions(v,r.driverId,people);if(!permissions.self&&!permissions.manage||personFilter&&r.driverId!==personFilter)return [];const {id,claimKey,title,driverId,driverName,driverStatus,accidentOn,initialReportRequested,version}=r;return [{id,claimKey,title,driverId,driverName,driverStatus,accidentOn,initialReportRequested,version,permissions,schedule:medicalSchedule(r),pendingSignatures:r.reports.filter(x=>!x.signature&&x.signatureStatus==='Awaiting driver review').length,hasReports:!!r.reports.length}];}).sort((a,b)=>b.accidentOn.localeCompare(a.accidentOn)||a.driverName.localeCompare(b.driverName));
}
export function verifiedMedicalReport(record:MedicalCase,id:unknown,expectedHash?:unknown):MedicalReport{
 const report=record.reports.find(r=>r.id===id);if(!report)throw new AppError('Report not found.',404);
 if(hash(medicalReportContent(report))!==report.reportHash)throw new ConflictError('This report’s saved content could not be verified.');
 if(expectedHash!==undefined&&expectedHash!==report.reportHash)throw new ConflictError('Review the complete current report before signing.');return report;
}
export async function mutateMedicalCase(v:Viewer,people:FinRecord[],body:Record<string,unknown>){
 const old=await medicalCase(v,people,body),permission=requireMedicalAccess(v,old.driverId,people);unchanged(body.version,old);
 const data=body.data&&typeof body.data==='object'&&!Array.isArray(body.data)?body.data as Record<string,unknown>:{};
 const at=new Date().toISOString(),next:MedicalCase={...old,version:old.version+1,createdAt:old.createdAt||at,updatedAt:at,reports:[...old.reports],contacts:[...old.contacts]};
 if(body.action==='submit'){
  const report=prepareMedicalReport(data,old,v,people,at);next.reports.push({...report,reportHash:hash(medicalReportContent(report))});
 }else if(body.action==='contact'){
  if(!permission.manage)throw new ForbiddenError('Only the designated reviewer records contact attempts.');
  const week=data.week;if(typeof week!=='number'||![1,2,3].includes(week)||!['Contact attempted','No response','Rescheduled'].includes(String(data.status)))throw new AppError('Choose the follow-up week and contact status.');
  next.contacts.push({id:crypto.randomUUID(),week:week as 1|2|3,accidentOn:old.accidentOn,status:data.status as 'Contact attempted'|'No response'|'Rescheduled',note:medicalText(data.note,'a contact note',2000,true),by:actor(v,at)});
 }else if(body.action==='sign'){
  if(!permission.self)throw new ForbiddenError('Only the driver can electronically sign their report. A supervisor may record a signed paper copy.');
  const report=verifiedMedicalReport(old,body.reportId,data.reportHash);if(report.signature)throw new ConflictError('This report is already signed. Add a new update to correct or supplement it.');
  if(data.consent!==true)throw new AppError('Review this report and choose electronic signing.');
  const name=medicalText(data.signatureName,'your signature name',180,true);
  next.reports=old.reports.map(r=>r.id!==report.id?r:{...r,signatureStatus:'Signed electronically',signature:{method:'Electronic',signerId:v.person,signerName:name,signedAt:at,recordedAt:at,recordedBy:actor(v,at),reportHash:r.reportHash,acknowledgment:r.acknowledgment,electronicConsent:medicalElectronicConsent}});
 }else if(body.action==='disposition'){
  const report=verifiedMedicalReport(old,body.reportId);if(report.signature)throw new ConflictError('A signed report is preserved. Add a new update.');
  if(!['Declined to sign','Unable to sign'].includes(String(data.status)))throw new AppError('Choose the actual signature status.');
  const status=data.status as 'Declined to sign'|'Unable to sign',note=medicalText(data.note,'the signature-status note',2000,true);
  next.reports=old.reports.map(r=>r.id!==report.id?r:{...r,signatureStatus:status,dispositions:[...r.dispositions,{status,note,by:actor(v,at)}]});
 }else throw new AppError('Choose a valid accident-report action.');
 await saveCase(next);return {ok:true,id:next.id};
}
export async function attachMedicalPaper(v:Viewer,people:FinRecord[],fields:Record<string,string>,file:{bytes:Uint8Array<ArrayBuffer>;name:string;type:string}){
 const old=await medicalCase(v,people,{caseId:fields.caseId});requireMedicalAccess(v,old.driverId,people,true);unchanged(Number(fields.version),old);
 const report=verifiedMedicalReport(old,fields.reportId,fields.reportHash);if(report.signature)throw new ConflictError('This report is already signed. Preserve it and add an update.');
 if(fields.confirmed!=='true')throw new AppError('Confirm that the uploaded copy contains the driver’s signature and the complete report shown.');
 const at=new Date().toISOString(),signedOn=medicalDay(fields.signedOn,'paper signature date');
 if(signedOn>medicalToday(at)||signedOn<medicalToday(report.preparedBy.at))throw new AppError('Use the actual signature date, on or after this report was prepared and not in the future.');
 if(!['application/pdf','image/jpeg','image/png'].includes(file.type)||!file.bytes.length||file.bytes.length>8*1024*1024)throw new AppError('Upload the actual signed PDF, JPEG, or PNG (up to 8 MB).');
 const signerName=medicalText(fields.signatureName,'the driver’s signature name',180,true),proof:MedicalFile={id:crypto.randomUUID(),name:file.name,type:file.type,bytes:file.bytes.length,sha256:hash(file.bytes)},key=fileKey(old.id,proof.id);
 const next:MedicalCase={...old,version:old.version+1,updatedAt:at,reports:old.reports.map(r=>r.id!==report.id?r:{...r,signatureStatus:'Signed on paper',signature:{method:'Paper',signerId:old.driverId,signerName,signedAt:signedOn,recordedAt:at,recordedBy:actor(v,at),reportHash:r.reportHash,acknowledgment:r.acknowledgment,file:proof}})};
 await financeFiles().put(key,await encryptBytes(file.bytes),{httpMetadata:{contentType:'application/octet-stream'}});
 try{await saveCase(next);}catch(e){await financeFiles().delete(key);throw e;}return {ok:true,id:next.id};
}
export async function readMedicalPaper(v:Viewer,people:FinRecord[],id:unknown,reportId:unknown){
 const record=await medicalCase(v,people,{caseId:id}),report=verifiedMedicalReport(record,reportId),file=report.signature?.file;
 if(!file)throw new AppError('No signed paper copy is attached.',404);
 const object=await financeFiles().get(fileKey(record.id,file.id));if(!object)throw new AppError('The signed original is unavailable.',404);
 const bytes=await decryptBytes(new Uint8Array(await object.arrayBuffer()));if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw new ConflictError('The signed original could not be verified.');await auditMedicalAccess(record,v,'Downloaded Signed Original');return {file,bytes};
}
