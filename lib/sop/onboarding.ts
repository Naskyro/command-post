import {correctiveEdition,correctiveView,validateAccessEdition} from './corrective-access';
import {isCorrectivePolicy,hasCorrectiveEmployeeGuide} from './corrective-content';
import {canReadGeneralSop,canOpenAcknowledgments} from './acknowledgment-access';
import {publicPublication} from './publication';
import {bulkSopAttestation,manualBulkSopAttestation} from './signature-terms';
/** Server-only: the caller must authorize HR access before asking for another person's receipts or readiness. */
import {financeDb} from '@/db/finance';
import {financeIdentity} from '@/lib/finance/identity';
import {allRecords} from '@/lib/finance/server';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
import {authorityLevelOf} from '@/lib/people/policy';
import {departmentFor} from '@/lib/people/departments';
import {displayPersonName,legalPersonName} from '@/lib/people/display-name';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import type {Policy,SopReceipt} from './model';

export const sopAttestation='I have read this policy and agree to follow it. By typing my name and choosing Sign Policy, I intend to sign this exact version electronically.';
const key=(id:string,v:number)=>id+'|'+v;
export const signerNames=(p:FinRecord)=>[...new Set([legalPersonName(p),displayPersonName(p)].map(n=>n.trim()).filter(Boolean))];
const canonical=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
export async function sopSignatureHistoryFor(personId:string):Promise<SopReceipt[]>{const result=await financeDb().prepare('SELECT receipt FROM sop_signatures WHERE person_id=? ORDER BY signed_at DESC').bind(personId).all<{receipt:string}>();return result.results.map(r=>JSON.parse(r.receipt));}
export function addSignatureData(p:Policy,all:SopReceipt[]):Policy{const sig=all.find(x=>x.policyId===p.id&&x.version===p.version&&(!p.accessEdition||x.accessEdition===p.accessEdition)),prior=all.filter(x=>x.policyId===p.id&&x.version<p.version).reduce((n,r)=>Math.max(n,r.version),0);return {...p,requireOnboardingSignature:p.requireOnboardingSignature!==false,acknowledged:!!sig,signature:sig,previousVersionSigned:prior||undefined};}
// Match legacy imported codes as well as the immutable topic identifier; never use job titles for visibility.
const correctiveSql='('+["json_extract(v.payload,'$.topicId')","v.policy_id","json_extract(v.payload,'$.code')","json_extract(v.payload,'$.originalReference')"].map(field=>"UPPER(TRIM(COALESCE("+field+",'')))='HR-CA' OR UPPER(TRIM(COALESCE("+field+",''))) GLOB 'HR-CA-*'").join(' OR ')+')';
const eligibleSql="(json_extract(v.payload,'$.audience.all')=1 OR EXISTS(SELECT 1 FROM json_each(v.payload,'$.audience.departments') WHERE value=?) OR EXISTS(SELECT 1 FROM json_each(v.payload,'$.audience.people') WHERE value=?) OR EXISTS(SELECT 1 FROM json_each(v.payload,'$.audience.levels') WHERE value=?))";
function requireReadableGuide(policy:Policy){
 if(policy.accessEdition==='employee'&&!hasCorrectiveEmployeeGuide(policy.content))throw new ConflictError('An authorized manager must review the employee guide before it can be acknowledged.');
}
function assignmentClause(requiredOnly:boolean,hrcaOnly=false){return "v.status='Published'"+(requiredOnly?" AND COALESCE(json_extract(v.payload,'$.requireOnboardingSignature'),1)=1":"")+" AND ("+correctiveSql+" OR "+eligibleSql+")"+(hrcaOnly?" AND "+correctiveSql:"");}
const requiredAssigned=assignmentClause(true);
function scope(p:FinRecord,records:FinRecord[]){const d=departmentFor(records,p.departmentId||p.department);return [d&&d.status!=='Retired'?d.id:'',p.id,authorityLevelOf(p)||''];}
function openKey(p:FinRecord){return "(v.key||CASE WHEN "+correctiveSql+" THEN '|"+correctiveEdition(p)+"' ELSE '' END)";}
function matchingReceipt(p:FinRecord,alias='s'){return "(NOT "+correctiveSql+" OR json_extract("+alias+".receipt,'$.accessEdition')='"+correctiveEdition(p)+"')";}
export async function openedPolicyVersions(personId:string){
 const rows=await financeDb().prepare('SELECT policy_key,opened_at FROM sop_policy_opens WHERE person_id=?').bind(personId).all<{policy_key:string;opened_at:string}>();
 return new Map(rows.results.map(x=>[x.policy_key,x.opened_at]));
}
export function inPersonalAudience(policy:Policy,p:FinRecord,records:FinRecord[]){if(isCorrectivePolicy(policy))return true;const [d,id,l]=scope(p,records),a=policy.audience;return a.all||a.people.includes(id)||!!d&&a.departments.includes(d)||!!l&&a.levels.includes(l);}
export async function recordPolicyOpened(p:FinRecord,records:FinRecord[],id:string,version:number,requiredOnly:boolean,requestedEdition?:unknown,hrcaOnly=false){
 const db=financeDb(),k=key(id,version),clause=assignmentClause(requiredOnly,hrcaOnly),sc=scope(p,records);
 const row=await db.prepare('SELECT v.payload FROM sop_versions v WHERE v.key=? AND '+clause).bind(k,...sc).first<{payload:string}>();
 if(!row)throw new ForbiddenError('This policy version is no longer available to acknowledge.');
 const policy=correctiveView(JSON.parse(row.payload) as Policy,p),actual=policy.accessEdition;
 requireReadableGuide(policy);
 validateAccessEdition(actual,requestedEdition);
 const opened=k+(actual?'|'+actual:'');
 await db.prepare('INSERT OR IGNORE INTO sop_policy_opens(person_id,policy_key,opened_at) SELECT ?,?,? FROM sop_versions v WHERE v.key=? AND '+clause).bind(p.id,opened,new Date().toISOString(),k,...sc).run();
 const found=await db.prepare('SELECT o.opened_at FROM sop_policy_opens o JOIN sop_versions v ON o.policy_key='+openKey(p)+' WHERE o.person_id=? AND v.key=? AND '+clause).bind(p.id,k,...sc).first<{opened_at:string}>();
 if(!found)throw new ForbiddenError('This policy version is no longer available to acknowledge.');return {openedAt:found.opened_at};
}
export async function pendingActiveSopCount(v:Viewer,staff:FinRecord[]):Promise<number>{
 if(!canOpenAcknowledgments(v))return 0;
 const p=staff.find(r=>r.kind==='person'&&r.id===v.person);
 if(!p||p.status!=='Active'||p.accountStatus==='Disabled')return 0;
 const sql='SELECT COUNT(*) AS pending FROM sop_versions v WHERE '+assignmentClause(false,!canReadGeneralSop(v))+' AND NOT EXISTS(SELECT 1 FROM sop_signatures s WHERE s.person_id=? AND s.policy_key=v.key AND '+matchingReceipt(p)+')';
 const row=await financeDb().prepare(sql).bind(...scope(p,staff),p.id).first<{pending:number}>();return Number(row?.pending||0);
}
export function onboardingSopApprovalGuard(p:FinRecord,records:FinRecord[],guardId:string){return financeDb().prepare('INSERT INTO hr_write_guard(id,success) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sop_versions v WHERE '+requiredAssigned+' AND NOT EXISTS(SELECT 1 FROM sop_signatures s WHERE s.person_id=? AND s.policy_key=v.key AND '+matchingReceipt(p)+')) THEN 0 ELSE 1 END').bind(guardId,...scope(p,records),p.id);}
export async function onboardingSopCounts(p:FinRecord,records:FinRecord[]):Promise<{required:number,signed:number}>{const row=await financeDb().prepare('SELECT COUNT(*) AS required, COUNT(s.id) AS signed FROM sop_versions v LEFT JOIN sop_signatures s ON s.policy_key=v.key AND s.person_id=? AND '+matchingReceipt(p)+' WHERE '+requiredAssigned).bind(p.id,...scope(p,records)).first<{required:number;signed:number}>();return {required:Number(row?.required||0),signed:Number(row?.signed||0)};}
export async function onboardingSopProgress(p:FinRecord,records:FinRecord[]){const [rows,receipts,opens]=await Promise.all([financeDb().prepare('SELECT v.payload FROM sop_versions v WHERE '+requiredAssigned+' ORDER BY v.policy_id').bind(...scope(p,records)).all<{payload:string}>(),sopSignatureHistoryFor(p.id),openedPolicyVersions(p.id)]),all=rows.results.map(r=>correctiveView(JSON.parse(r.payload) as Policy,p)),ids=new Set(all.map(x=>x.id)),policies=all.map(x=>{const {pdfEdition:_edition,...safe}=x;return addSignatureData({...safe,publication:publicPublication(safe.publication),assignedToViewer:true,openedAt:opens.get(key(safe.id,safe.version)+(safe.accessEdition?'|'+safe.accessEdition:'')),audience:{all:false,people:[],levels:[],departments:[]},content:{...safe.content,relatedIds:safe.content.relatedIds.filter(id=>ids.has(id))}},receipts);});const required=policies.length,signed=policies.filter(x=>x.signature).length;return {policies,receipts,required,signed,pending:required-signed,complete:required===signed,signerNames:signerNames(p),attestation:sopAttestation};}
export const onboardingSopStatus=onboardingSopProgress;
export async function onboardingViewer(r:Request){const records=await allRecords(),v=financeIdentity(r.headers,records,{allowOnboarding:true}),p=records.find(p=>p.kind==='person'&&p.id===v.person);if(!p||!['Onboarding','Active'].includes(String(p.status))||!v.onboardingOnly&&!canAccess(v,'SOP Library','library')&&!canAccess(v,'SOP Library','assigned')&&!canAccess(v,'SOP Library','workflow',true))throw new ForbiddenError();return {records,p,v};}
export async function assignedPolicy(p:FinRecord,records:FinRecord[],id:string,version:number){const row=await financeDb().prepare('SELECT v.payload FROM sop_versions v WHERE v.key=? AND '+requiredAssigned).bind(key(id,version),...scope(p,records)).first<{payload:string}>();if(!row)throw new ForbiddenError('This assigned policy is unavailable.');return correctiveView(JSON.parse(row.payload) as Policy,p);}
function validateSigner(v:Viewer,p:FinRecord,b:Record<string,unknown>){
 if(p.id!==v.person||b.assent!==true||typeof b.signerName!=='string'||b.signerName.length>200||!signerNames(p).some(x=>canonical(x)===canonical(b.signerName as string)))throw new AppError('Enter your name as shown and explicitly agree to sign this policy.');
 if(b.personId!==undefined&&b.personId!==v.person)throw new ForbiddenError('Only the employee can sign their own policy.');
}
async function receipt(v:Viewer,p:FinRecord,policy:Policy,name:string,signedAt:string,attestation:string):Promise<SopReceipt>{
 const hashData=JSON.stringify({id:policy.id,version:policy.version,code:policy.code,content:policy.content,original:policy.originalPdf?policy.originalReference:null,pdfEdition:(policy as Policy&{pdfEdition?:unknown}).pdfEdition||null,...(policy.accessEdition?{accessEdition:policy.accessEdition}:{})}),hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(hashData));
 const r:SopReceipt={...(policy.accessEdition?{accessEdition:policy.accessEdition}:{}),signerName:name.trim(),personnelName:legalPersonName(p),accountId:v.id,personId:v.person,policyId:policy.id,title:policy.content.title,code:policy.code,version:policy.version,revision:policy.content.revision,signedAt,attestation,contentHash:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')};return r;
}
export async function signCurrent(v:Viewer,p:FinRecord,policy:Policy,b:Record<string,unknown>){
 validateSigner(v,p,b);
 if(isCorrectivePolicy(policy)){policy=correctiveView(policy,p);requireReadableGuide(policy);validateAccessEdition(policy.accessEdition,b.accessEdition);
  const opening=await financeDb().prepare('SELECT opened_at FROM sop_policy_opens WHERE person_id=? AND policy_key=?').bind(p.id,key(policy.id,policy.version)+'|'+policy.accessEdition).first();
  if(!opening)throw new AppError('Open your current policy edition before signing.');
 }if(policy.status!=='Published')throw new AppError('Only a published policy can be signed.');
 const r=await receipt(v,p,policy,b.signerName as string,new Date().toISOString(),sopAttestation);const sk=JSON.stringify([v.person,r.policyId,r.version,...(r.accessEdition?[r.accessEdition]:[])]);const db=financeDb();const w=await db.prepare("INSERT OR IGNORE INTO sop_signatures(id,person_id,policy_key,signed_at,receipt) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sop_versions WHERE key=? AND status='Published')").bind(sk,v.person,key(r.policyId,r.version),r.signedAt,JSON.stringify(r),key(r.policyId,r.version)).run();if(w.meta.changes)return r;
 const previous=await db.prepare("SELECT s.receipt FROM sop_signatures s JOIN sop_versions v ON s.policy_key=v.key WHERE s.id=? AND v.status='Published'").bind(sk).first<{receipt:string}>();if(!previous)throw new ConflictError('The published version changed. Review the current policy before signing.');return JSON.parse(previous.receipt) as SopReceipt;
}

export async function bulkSignCurrent(v:Viewer,p:FinRecord,records:FinRecord[],b:Record<string,unknown>,requiredOnly:boolean,hrcaOnly=false){
 validateSigner(v,p,b);
 if(b.manualReviewAttestation!==undefined&&typeof b.manualReviewAttestation!=='boolean')throw new AppError('Explicitly confirm your review of the listed current policy versions.');
 const manualReview=b.manualReviewAttestation===true;
 if(!Array.isArray(b.policies)||!b.policies.length||b.policies.length>6000)throw new AppError('Choose the current policies to acknowledge.');
 const requested=b.policies.map((x:unknown)=>{const a=x as {id?:string;version?:number};if(!a||typeof a.id!=='string'||a.id.length>160||!Number.isSafeInteger(a.version)||Number(a.version)<1)throw new AppError('Invalid policy edition.');return key(a.id,Number(a.version));});
 if(new Set(requested).size!==requested.length)throw new AppError('The list contains a duplicate policy.');
 const db=financeDb(),sc=scope(p,records),cl=assignmentClause(requiredOnly,hrcaOnly),pending='SELECT v.key FROM sop_versions v WHERE '+cl+' AND NOT EXISTS(SELECT 1 FROM sop_signatures sig WHERE sig.policy_key=v.key AND sig.person_id=? AND '+matchingReceipt(p,'sig')+')',keys=JSON.stringify(requested);
 const pendingRows=await db.prepare('SELECT v.payload,o.opened_at FROM sop_versions v LEFT JOIN sop_policy_opens o ON o.policy_key='+openKey(p)+' AND o.person_id=? WHERE v.key IN ('+pending+')').bind(p.id,...sc,p.id).all<{payload:string;opened_at:string|null}>();
 const rows=pendingRows.results.map(x=>({policy:correctiveView(JSON.parse(x.payload) as Policy,p),opened:x.opened_at})),want=new Set(requested);
 if(rows.length!==want.size||rows.some(x=>!want.has(key(x.policy.id,x.policy.version))))throw new ConflictError('Your policy list changed. Refresh and review the current versions before signing.');
 const requestedVariants=new Map((b.policies as {id:string;version:number;accessEdition?:string}[]).map(x=>[key(x.id,x.version),x.accessEdition]));
 for(const x of rows){requireReadableGuide(x.policy);validateAccessEdition(x.policy.accessEdition,requestedVariants.get(key(x.policy.id,x.policy.version)));}
 if(!manualReview&&rows.some(x=>!x.opened))throw new AppError('Confirm that you have already individually reviewed every listed current policy, or open each policy before signing them together.');
 const signedAt=new Date().toISOString(),batchId=crypto.randomUUID(),statements=await Promise.all(rows.map(async x=>({...await receipt(v,p,x.policy,b.signerName as string,signedAt,manualReview?manualBulkSopAttestation:bulkSopAttestation),reviewMethod:manualReview?'self-attested' as const:'in-app-opened' as const,...(x.opened?{openedAt:x.opened}:{}),batchId})));
 // Recheck the full pending set atomically: publication, revocation or another signature cannot leave a partial batch.
 const setMatch='NOT EXISTS('+pending+' EXCEPT SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT value FROM json_each(?) EXCEPT '+pending+')';
 const guard=db.prepare('INSERT INTO sop_guard(id,success) SELECT ?,CASE WHEN '+setMatch+' THEN 1 ELSE 0 END').bind(batchId,...sc,p.id,keys,keys,...sc,p.id);
 // Split JSON bindings by size to stay below D1 per-row limits. All writes are one transaction.
 const writes=[];for(let i=0;i<statements.length;i+=80){const pack=statements.slice(i,i+80).map(r=>({id:JSON.stringify([p.id,r.policyId,r.version,...(r.accessEdition?[r.accessEdition]:[])]),k:key(r.policyId,r.version),r:JSON.stringify(r)}));
 writes.push(db.prepare("INSERT INTO sop_signatures(id,person_id,policy_key,signed_at,receipt) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.k'),?,json_extract(value,'$.r') FROM json_each(?)").bind(p.id,signedAt,JSON.stringify(pack)));}
 try{await db.batch([guard,...writes,db.prepare('DELETE FROM sop_guard WHERE id=?').bind(batchId)]);}catch(e){if(/constraint|sop_write_succeeded/i.test(String(e)))throw new ConflictError('Your policy list changed. Refresh before signing.');throw e;}
 return {signed:statements.length,batchId,signedAt};
}
