import {deactivationMarker,needsCredentialRevocation,outboxStatement,deliverRevocation} from '../admin/credential-lifecycle';
import {validateJobAcceptance,jobWetProof} from './job-description-acceptance';
import {ccrReviewCategory} from './review-document-access';
import {canRemoveHr,personnelAdmin} from './record-removal';
import { env } from 'cloudflare:workers';
import { financeDb, financeFiles } from '@/db/finance';
import type { FinRecord, Viewer } from '../finance/model';
import { AppError, ConflictError, ForbiddenError } from '../shared/errors';
import { hrKinds, onboardingStepsFor, type HrRecord } from './model';
import { can, canReadRecord, readiness, validateSave, date } from './workflow';
import {isPendingNewHire,onboardingReadiness} from './sop-readiness';
import {onboardingSopCounts,onboardingSopApprovalGuard} from '../sop/onboarding';
import { verifiedTaskEvidence } from './completion';
import { prepareSeparation } from './separation';

function secret() {return (env as unknown as Record<string,unknown>).HR_DATA_ENCRYPTION_KEY;}
export function secureStorageAvailable(){return typeof secret()==='string'&&!!secret();}
function b64(bytes:Uint8Array){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value);}
function unb64(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export async function concernAlias(id:string,person:string){const raw=secret();if(typeof raw!=='string'||!raw)throw new AppError('Secure HR storage unavailable.',503);const k=await crypto.subtle.importKey('raw',unb64(raw) as BufferSource,{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(JSON.stringify(['hr-concern-v1',id,person])))));}
async function key(){const raw=secret();if(typeof raw!=='string'||!raw)throw new AppError('Secure HR storage is not configured. No confidential information was saved.',503);let bytes:Uint8Array;try{bytes=unb64(raw);}catch{throw new AppError('Secure HR storage configuration needs attention.',503);}if(bytes.length!==32)throw new AppError('Secure HR storage configuration needs attention.',503);return crypto.subtle.importKey('raw',bytes as BufferSource,{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function encryptBytes(value:Uint8Array):Promise<Uint8Array>{const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(),value as BufferSource));const out=new Uint8Array(iv.length+cipher.length);out.set(iv);out.set(cipher,12);return out;}
export async function decryptBytes(value:Uint8Array):Promise<Uint8Array>{if(value.length<29)throw new AppError('This protected file cannot be read.',503);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:value.slice(0,12)},await key(),value.slice(12)));}
export async function encode(data:unknown){return 'v1:'+b64(await encryptBytes(new TextEncoder().encode(JSON.stringify(data))));}
export async function decode(payload:string){if(!payload.startsWith('v1:'))throw new AppError('Protected HR data requires review.',503);return JSON.parse(new TextDecoder().decode(await decryptBytes(unb64(payload.slice(3)))));}
export async function readAssetClaims():Promise<HrRecord[]>{
 const rows=await financeDb().prepare("SELECT payload FROM hr_records WHERE kind='assetClaim'").all<{payload:string}>();
 return (await Promise.all(rows.results.map(row=>decode(row.payload) as Promise<HrRecord>))).filter(r=>r.kind==='assetClaim'&&!r.data.deletedAt);
}
export async function readHrRecords(includeDeleted=false):Promise<HrRecord[]>{const result=await financeDb().prepare('SELECT payload FROM hr_records').all<{payload:string}>();return (await Promise.all(result.results.map(row=>decode(row.payload) as Promise<HrRecord>))).filter(r=>includeDeleted||!r.data.deletedAt);}
export async function readHrRecord(id:string):Promise<HrRecord|undefined>{const row=await financeDb().prepare('SELECT payload FROM hr_records WHERE id=?').bind(id).first<{payload:string}>();return row?decode(row.payload) as Promise<HrRecord>:undefined;}
export function recordId(value:unknown){const id=String(value||'');if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(id))throw new AppError('Choose a valid HR record.');return id;}
export function cleanData(value:unknown):Record<string,unknown>{if(!value||Array.isArray(value)||typeof value!=='object')throw new AppError('Submit the form details.');const serialized=JSON.stringify(value);if(serialized.length>150000)throw new AppError('This record exceeds the allowed size.');return JSON.parse(serialized);}
export function createRecord(body:Record<string,unknown>,old:HrRecord|undefined,v:Viewer):HrRecord {const kind=String(body.kind||old?.kind||'');if(!hrKinds.includes(kind as HrRecord['kind']))throw new AppError('Choose a valid record type.');if(old&&Number(body.version)!==old.version)throw new ConflictError();const at=new Date().toISOString();return {id:recordId(body.id),kind:kind as HrRecord['kind'],personId:String(body.personId||old?.personId||'')||undefined,version:(old?.version||0)+1,data:cleanData(body.data),createdAt:old?.createdAt||at,createdBy:old?.createdBy||v.name,updatedAt:at,updatedBy:v.name};}
export async function writeHrRecord(old:HrRecord|undefined,next:HrRecord,v:Viewer,action:string,guards:D1PreparedStatement[] = []) {
 const db=financeDb(), payload=await encode(next), aid=crypto.randomUUID();
 const write=old?db.prepare('UPDATE hr_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(payload,next.version,next.updatedAt,v.name,next.id,old.version):db.prepare('INSERT OR IGNORE INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(next.id,next.kind,next.personId||null,payload,next.version,next.createdAt,next.createdBy,next.updatedAt,v.name);
 let result;try{result=await db.batch([...guards,write,db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1').bind(aid,next.id,v.name,v.id,next.updatedAt,action,next.version,payload)]);}catch(e){if(guards.length&&/constraint|hr_write_guard/i.test(String(e)))throw new ConflictError('A cited SOP changed. Refresh the policy references before saving.');throw e;}
 if(result[guards.length].meta.changes!==1)throw new ConflictError();return next;
}
export async function mutateHr(body:Record<string,unknown>,v:Viewer,finance:FinRecord[],hr:HrRecord[]) {
 const id=recordId(body.id), old=hr.find(r=>r.id===id), action=String(body.action||'save');
 if(old?.kind==='document'&&old.data.category===ccrReviewCategory)throw new ForbiddenError('The original CCR review document is preserved.');
 if(old&&Number(body.version)!==old.version)throw new ConflictError();
 if(action==='delete'){
  if(!old||!canRemoveHr(v,old,finance,hr))throw new ForbiddenError('Deletion is not assigned to you for this record.');
  const reason=String(body.reason||'').trim();if(!reason)throw new AppError('Enter the reason for deleting this record.');
  if(old.kind==='vacancy'&&hr.some(r=>r.kind==='candidate'&&r.data.vacancyId===old.id))throw new AppError('Remove unlinked candidates first. Vacancies with an onboarded employee must be closed to preserve their hiring history.');
  if(old.kind==='position'&&hr.some(r=>r.data.positionId===old.id))throw new AppError('This position is in use. Retire it instead.');
  if(old.kind==='document'&&hr.some(r=>r.id!==old.id&&JSON.stringify(r.data).includes(old.id)))throw new AppError('This document supports another record. Replace or correct that relationship before removal.');
  const at=new Date().toISOString();return writeHrRecord(old,{...old,version:old.version+1,updatedAt:at,updatedBy:v.name,data:{...old.data,deletedAt:at,deletedBy:v.name,deleteReason:reason}},v,'Deleted Record: '+reason);
 }
 if(action==='save'){
  const next=createRecord(body,old,v);
  if(next.kind==='bank')throw new AppError('Use Payment Details to update direct deposit instructions.');
  if(next.kind==='corrective'||next.kind==='note'){
    if(!next.personId||v.onboardingOnly||!can(v,next.kind==='note'?'recordPerformance':'issueCorrective',next.personId,finance))throw new ForbiddenError();
    if(old&&(old.kind!==next.kind||old.personId!==next.personId||old.data.employeeVisible===true))throw new AppError('This personnel record is preserved. Add an addendum instead.');
    for(const k of ['employeePdfCitations','employeePolicySubject','policySnapshot','sopReferenceCount','policyIds'])delete next.data[k];
    const prior=Array.isArray(old?.data.sopCitations)?old.data.sopCitations:[];
    // No new reference may slip in via legacy text or a client-supplied policy snapshot.
    const input=next.data.sopCitations;
    const {resolvePerformanceSopCitations}=await import('./performance-sop-links');
    const {citations,guards}=await resolvePerformanceSopCitations({viewer:v,records:finance,personId:next.personId,kind:next.kind,input,previous:prior});
    next.data.sopCitations=citations;
    // The old note editor stored unversioned checklist IDs. Keep genuine historical links
    // until intentionally replaced; never let a caller create new unverified legacy links.
    if(!citations.length&&old?.data.policyIds!==undefined&&!prior.length)next.data.policyIds=old.data.policyIds;
    if(next.kind==='note'){
      for(const k of ['policyReference','policyVersion','policySnapshot','policyEffectiveDate']){
        if(!citations.length&&!prior.length&&old?.data[k]!==undefined)next.data[k]=old.data[k];else delete next.data[k];
      }
    }
    validateSave(old,next,v,finance,hr,citations[0]);
    return writeHrRecord(old,next,v,old?'Updated Record':'Created Record',guards);
  }
  validateSave(old,next,v,finance,hr);return writeHrRecord(old,next,v,old?'Updated Record':'Created Record');
 }
 if(!old)throw new AppError('HR record not found.',404);
 if(action==='approveStart')return approveStart(old,v,finance,hr);
 if(!canReadRecord(old,v,finance,hr))throw new ForbiddenError();
 const at=new Date().toISOString(), next={...old,version:old.version+1,updatedAt:at,updatedBy:v.name,data:{...old.data}}, input=cleanData(body.data||{});
 if(action==='verifyTask') {
  if(old.kind!=='onboarding'||v.onboardingOnly||old.data.status==='Cleared')throw new ForbiddenError();
  const evidence=verifiedTaskEvidence(old,input,v,finance,hr,at);
  const tasks=Array.isArray(old.data.tasks)?old.data.tasks as Record<string,unknown>[]:[];
  next.data={...old.data,tasks:onboardingStepsFor(finance.find(person=>person.kind==='person'&&person.id===old.personId),old.data,finance).map(def=>{const prior=tasks.find(t=>t.key===def.key)||{};return def.key===evidence.key?{...def,...evidence}:{...def,...prior};})};
 } else if(action==='sign') {
  if(old.kind!=='document'||old.personId!==v.person||!['Offer Letter','Job Description','Policy Acknowledgment'].includes(String(old.data.category)))throw new ForbiddenError('Only the employee can sign their assigned offer, job description, or policy acknowledgment.');
  if(old.data.signatureStatus==='Signed'||old.data.signatureStatus==='Wet Signature Verified')throw new AppError('This document has already been signed.');
  if(input.consent!==true||!String(input.signatureName||'').trim()||input.documentHash!==old.data.sha256)throw new AppError('Review the complete document, enter your name, and accept electronic signing.');
  const acceptance=old.data.category==='Job Description'?validateJobAcceptance(old,hr,input,finance.find(p=>p.kind==='person'&&p.id===v.person)):{};
  next.data={...old.data,...acceptance,signatureStatus:'Signed',signatureName:String(input.signatureName).trim(),signedAt:at,signedBy:v.person,signerIdentity:v.id,signedDocumentHash:old.data.sha256,electronicConsent:true};
 } else if(action==='verifyDocument') {
  if(old.kind!=='document')throw new AppError('Choose the uploaded signed document.');
  const category=String(old.data.category), permission=['Offer Letter','Job Description','Policy Acknowledgment','Training Record'].includes(category)?'manageOnboarding':['Signed Corrective Action','Corrective Action'].includes(category)?'issueCorrective':category==='Form I-9'?'verifyI9':['Form W-4','Form W-9','Bank Authorization'].includes(category)?'manageTaxBank':'managePersonnel';
  if(v.onboardingOnly||!can(v,permission,old.personId,finance))throw new ForbiddenError();
  if(old.data.signatureStatus==='Signed'||old.data.signatureStatus==='Wet Signature Verified')throw new AppError('The signature is already recorded.');
  if(input.signatureConfirmed!==true)throw new AppError('Confirm the actual signed copy and its signature date.');date(input.signatureDate,'signature date',true);
  const proof=category==='Job Description'&&old.data.jobDescriptionId?jobWetProof(old,hr,input.signedCopyId):{};
  if(category==='Job Description'&&(old.data.assignmentSupersededBy||hr.some(r=>r.kind==='document'&&r.id===old.data.parentId&&r.data.category==='Job Description')))throw new AppError('Verify the assigned version with its signed copy.');
  next.data={...old.data,...proof,signatureStatus:'Wet Signature Verified',signatureDate:input.signatureDate,signatureVerifiedAt:at,signatureVerifiedBy:v.name,signatureVerifiedById:v.id};
 } else if(action==='publishCorrective') {
  if(old.kind!=='corrective'||v.onboardingOnly||!can(v,'issueCorrective',old.personId,finance))throw new ForbiddenError();
  if(old.data.employeeVisible===true)throw new AppError('This notice is already visible to the employee.');
  const file=hr.find(r=>r.id===input.signedDocumentId&&r.kind==='document'&&r.personId===old.personId&&r.data.parentId===old.id&&r.data.parentVersion===old.version&&r.data.category==='Signed Corrective Action'&&r.data.signatureStatus==='Wet Signature Verified');
  if(!file)throw new AppError('Upload and verify the signed copy linked to this notice before publishing. A refusal remains a separate documented record.');
  next.data={...old.data,status:'Issued',employeeVisible:true,signedDocumentId:file.id,publishedAt:at,publishedBy:v.name};
 } else if(action==='respond') {
  if(old.kind!=='corrective'||old.personId!==v.person||old.data.employeeVisible!==true)throw new ForbiddenError();
  if(!String(input.reason||'').trim()&&!String(input.statement||'').trim())throw new AppError('Select a reason or enter your statement.');
  const responses=Array.isArray(old.data.responses)?old.data.responses:[];
  next.data={...old.data,responses:[...responses,{reason:String(input.reason||''),statement:String(input.statement||''),at,by:v.name,byId:v.id}]};
 } else throw new AppError('Unknown HR action.');
 return writeHrRecord(old,next,v,action);
}

async function approveStart(old:HrRecord,v:Viewer,finance:FinRecord[],hr:HrRecord[]) {
 if(old.kind!=='onboarding'||v.onboardingOnly||!can(v,'approveStart',old.personId,finance))throw new ForbiddenError('Start approval is not assigned to you for this employee.');
 const person=finance.find(r=>r.kind==='person'&&r.id===old.personId);if(!person)throw new AppError('Employee not found.');
 if(old.data.status==='Cleared')throw new AppError('Start clearance is already complete.');
 const signingRequired=isPendingNewHire(person);
 const sop=signingRequired?await onboardingSopCounts(person,finance):{required:0,signed:0};
 const check=onboardingReadiness(old,person,hr,sop,finance);if(!check.ready)throw new AppError('Complete before start clearance: '+check.issues.join('; ')+'.');
 if(person.accountStatus==='Disabled'||person.status==='Former'||person.commandSignInRevoked===true)throw new ForbiddenError('An authorized administrator must review and reactivate the account before onboarding can release it.');
 const at=new Date().toISOString(), next:HrRecord={...old,version:old.version+1,updatedAt:at,updatedBy:v.name,data:{...old.data,status:'Cleared',clearedAt:at,clearedBy:v.name,clearedById:v.id,sopClearance:{required:sop.required,signed:sop.signed}}}, updated={...person,version:person.version+1,status:'Active',accountStatus:'Enabled',onboardingStatus:'Complete',onboardingClearedAt:at,onboardedBy:v.name,onboardedAt:at,updatedAt:at,updatedBy:v.name};
 const db=financeDb(), payload=await encode(next), faid=crypto.randomUUID(), haid=crypto.randomUUID(), guard=crypto.randomUUID();
 // Version guards make HR clearance and operational account release one transaction.
 const statements=[db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM hr_records WHERE id=? AND version=?) THEN 1 ELSE 0 END').bind(guard,old.id,old.version)];
 if(signingRequired)statements.push(await onboardingSopApprovalGuard(person,finance,guard+':sop'));
 const dependencies=(await readHrRecords(true)).filter(r=>r.personId===person.id&&['document','i9','w4','w9','bank','screening','benefit'].includes(r.kind));
 statements.push(db.prepare("INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN (SELECT count(*) FROM hr_records WHERE person_id=? AND kind IN ('document','i9','w4','w9','bank','screening','benefit'))=? THEN 1 ELSE 0 END").bind(guard+':dependencies',person.id,dependencies.length));
 for(const dependency of dependencies)statements.push(db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM hr_records WHERE id=? AND version=?) THEN 1 ELSE 0 END').bind(guard+':'+dependency.id,dependency.id,dependency.version));
 if(person.version>0)statements.push(db.prepare('UPDATE hr_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(payload,next.version,at,v.name,old.id,old.version),db.prepare('UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(updated),updated.version,v.name,at,person.id,person.version));
 else statements.push(db.prepare('UPDATE hr_records SET payload=?,version=?,updated_at=?,updated_by=? WHERE id=? AND version=?').bind(payload,next.version,at,v.name,old.id,old.version),db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(person.id,'person',JSON.stringify(updated),updated.version,v.name,at));
 statements.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard+':person'),db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(haid,old.id,v.name,v.id,at,'Approved Start',next.version,payload),db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(faid,person.id,v.name,v.id,at,'HR onboarding start clearance',JSON.stringify(person),JSON.stringify(updated)),db.prepare('DELETE FROM hr_write_guard WHERE id=? OR id LIKE ?').bind(guard,guard+':%'));
 try{await db.batch(statements);}catch{throw new ConflictError('Start clearance could not be confirmed. Refresh the record before trying again.');}return next;
}
export async function hrHistory(id:string){const r=await financeDb().prepare('SELECT id,actor,at,action,version FROM hr_audit WHERE record_id=? ORDER BY at DESC LIMIT 200').bind(id).all();return r.results;}
export async function auditHrAccess(record:HrRecord,v:Viewer,action:string){await financeDb().prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),record.id,v.name,v.id,new Date().toISOString(),action,record.version,await encode({id:record.id,kind:record.kind,version:record.version})).run();}

/** HR decision, access revocation, follow-ups and audits commit together or not at all. */
export async function recordSeparation(body:Record<string,unknown>,v:Viewer,finance:FinRecord[],hr:HrRecord[]) {
 const plan=prepareSeparation(body,v,finance,hr);
 const response=async(record:HrRecord,alreadyRecorded:boolean)=>{
  const subject=finance.find(p=>p.kind==='person'&&p.id===record.personId);
  const credentialLifecycle=subject&&needsCredentialRevocation(subject)?await deliverRevocation(subject.id):undefined;
  return {credentialLifecycle,record,personId:record.personId,followUpCount:Array.isArray(record.data.followUpTaskIds)?record.data.followUpTaskIds.length:0,alreadyRecorded};};
 if(plan.alreadyRecorded)return response(plan.record,true);
 const db=financeDb(),guard=crypto.randomUUID(),at=plan.record.createdAt;
 const statements=[];
 // Team scope can follow intermediate supervisors. Guard every personnel version
 // used to calculate scope, including the acting user, against concurrent changes.
 for(const person of finance.filter(r=>r.kind==='person'))statements.push(person.version>0
  ?db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM finance_records WHERE id=? AND version=?) THEN 1 ELSE 0 END').bind(guard+':scope:'+person.id,person.id,person.version)
  :db.prepare('INSERT INTO hr_write_guard (id,success) SELECT ?,CASE WHEN NOT EXISTS(SELECT 1 FROM finance_records WHERE id=?) THEN 1 ELSE 0 END').bind(guard+':scope:'+person.id,person.id));
 const disabled=deactivationMarker(plan.updated);
 const personPayload=JSON.stringify(disabled);
 statements.push(plan.person.version>0
  ?db.prepare('UPDATE finance_records SET payload=?,version=?,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(personPayload,plan.updated.version,v.name,at,plan.person.id,plan.person.version)
  :db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)').bind(plan.person.id,'person',personPayload,plan.updated.version,v.name,at));
 statements.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard+':person-write'));
 if(needsCredentialRevocation(disabled))statements.push(outboxStatement(disabled,v,at));
 for(const record of [plan.record,...plan.tasks]){
  const payload=await encode(record);
  statements.push(db.prepare('INSERT INTO hr_records (id,kind,person_id,payload,version,created_at,created_by,updated_at,updated_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(record.id,record.kind,record.personId||null,payload,record.version,at,v.name,at,v.name));
  statements.push(db.prepare('INSERT INTO hr_write_guard (id,success) VALUES (?,changes())').bind(guard+':record:'+record.id));
  statements.push(db.prepare('INSERT INTO hr_audit (id,record_id,actor,actor_id,at,action,version,snapshot) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),record.id,v.name,v.id,at,record.kind==='offboarding'?'Recorded Separation and Disabled Command Post Access':'Created Separation Follow-Up',record.version,payload));
 }
 statements.push(db.prepare('INSERT INTO finance_audit (id,record_id,actor,actor_id,at,reason,before,after) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),plan.person.id,v.name,v.id,at,'HR separation recorded; employment ended and Command Post access disabled',JSON.stringify(plan.person),personPayload));
 statements.push(db.prepare('DELETE FROM hr_write_guard WHERE id LIKE ?').bind(guard+':%'));
 try{await db.batch(statements);}catch{
  // A lost response or simultaneous retry must not create another decision/task set.
  const committed=await readHrRecord(plan.record.id);
  if(committed){const replay=prepareSeparation(body,v,finance,[...hr.filter(r=>r.id!==committed.id),committed]);if(replay.alreadyRecorded)return response(replay.record,true);}
  throw new ConflictError('The employee or your assigned authority changed, or this separation could not be saved. Refresh the profile before retrying. No partial changes were saved.');
 }
 return response(plan.record,false);
}
export { financeFiles };
