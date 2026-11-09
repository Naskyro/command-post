import {createHash} from 'node:crypto';
import type {Viewer} from '@/lib/finance/model';
import {requestRoster} from '@/lib/finance/server';
import {canAccess} from '@/lib/finance/access';
import {yearCaseRows} from '@/lib/accounts/server';
import {assigned,head} from '@/lib/accounts/policy';
import {isLive} from '@/lib/accounts/today-brief';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import {financeFiles} from '@/db/finance';
import {encryptBytes} from '@/lib/hr/server';
import {docketAccess,prepareAuthorizedMatter,type Matter,type CourtDocument} from './docket-model';
import {propertyDocketRows,matterById,insertEdition,courtIdentityInUse} from './docket-server';
import {documentTypeLabel,classifyDocument} from './document-types';
import {currentHearingFacts} from './hearing-facts';
import {validatedDocumentBytes,ccrCourtFileBytes} from './document-input';
import type {StagedDocument} from './document-stage-server';
import {readAuthorizedCourtOriginal} from './court-files-server';
const ck=(x:unknown)=>typeof x==='string'&&/^[a-zA-Z0-9:_-]{1,150}$/.test(x)?x:(()=>{throw new AppError('Choose a property.',404);})();
const tab=(v:Viewer,edit=false)=>canAccess(v,'Account Management','courtHearings',edit)||docketAccess(v,edit);
export async function propertyCourtScope(v:Viewer,accountId:unknown,edit=false){
 if(!v?.person||!v.id||v.id.startsWith('preview:')||v.onboardingOnly||!canAccess(v,'Account Management','accounts')||!tab(v,edit))throw new ForbiddenError();
 const id=ck(accountId),[rows,staff]=await Promise.all([yearCaseRows(),requestRoster()]),a=rows.find(r=>r.id===id&&r.kind==='account'&&isLive(r));if(!a||!(head(v,staff)||assigned(v,a)))throw new AppError('Property unavailable.',404);if(edit&&a.readOnly)throw new ForbiddenError('This property is read only.');
 return {account:a,canEdit:!a.readOnly&&tab(v,true),canOpenDocket:docketAccess(v)};
}
export function accountCase(m:Matter){
 const out=m.status==='Closed'?m.statements.findLast(s=>s.outcome):undefined;
 return {id:m.id,version:m.version,title:m.title,type:m.type,number:m.number,status:m.status,courtName:m.courtName||'',courtId:m.courtId||'',assignedJudge:m.assignedJudge||'',assignedJudgeId:m.assignedJudgeId||'',filedOn:m.filedOn,appearances:m.appearances.map(a=>({...a})),hearings:currentHearingFacts(m.hearingFacts).filter(f=>f.kind==='hearing'&&f.date).map(f=>({date:f.date!,status:f.status||'Unknown',time:f.time||''})),outcome:out?.outcome?{result:out.outcome.result,on:out.outcome.on,reason:out.text,by:out.by,at:out.at}:undefined,statements:m.statements.filter(s=>s.shareWithProperty&&s!==out).map(s=>({text:s.text,by:s.by,at:s.at})),files:(m.files||[]).filter(f=>f.shareWithProperty).map(f=>({id:f.id,name:f.name,type:documentTypeLabel(f),at:f.at,by:f.by})),updatedAt:m.updatedAt};
}
export type AccountCourtCase=ReturnType<typeof accountCase>;
async function linked(id:unknown,accountId:string){const r=await matterById(ck(id));if(r.accountId!==accountId)throw new AppError('No such case on this property.',404);return r;}
export async function propertyCases(v:Viewer,id:unknown){const {account,canEdit,canOpenDocket}=await propertyCourtScope(v,id);return {rows:(await propertyDocketRows(account.id)).map(accountCase),canEdit,canOpenDocket};}
export async function savePropertyCase(v:Viewer,b:Record<string,unknown>){const {account}=await propertyCourtScope(v,b.accountId,true),old=b.id?await linked(b.id,account.id):undefined;
 if(!['create','update'].includes(String(b.action))||!!old!==(b.action==='update'))throw new AppError('Choose an existing case to update or create a new one.');
 if(old&&b.version!==old.version)throw new ConflictError();const f:Record<string,unknown>={...(old||{}),accountId:account.id,id:old?.id,version:old?.version||0,appearances:old?.appearances||[],filedOn:old?.filedOn||'',dueOn:old?.dueOn||'',dueFor:old?.dueFor||'',title:old?.title||'',number:old?.number||'',status:old?.status||'Open',type:old?.type||'Tow Hearing',courtName:old?.courtName||''};
 for(const k of ['title','number','type','status','courtName','courtId','assignedJudge','assignedJudgeId','filedOn','statement','newOutcome'])if(b[k]!==undefined)f[k]=b[k];
 if(b.appearance!==undefined){const a=b.appearance as Record<string,unknown>;if(!a||typeof a!=='object'||typeof a.label!=='string'||!a.label.trim())throw new AppError('Name the new appearance.');f.appearances=[...(old?.appearances||[]),{label:a.label,date:a.date,time:a.time||'',status:a.status||'Scheduled'}];}
 if(old&&old.status==='Closed'&&b.status!==undefined&&b.status!=='Closed'&&!(typeof b.statement==='string'&&b.statement.trim()))throw new AppError('Add a statement explaining why the case is reopening.');
 const next=prepareAuthorizedMatter(f,old,v,new Date());if((!old||next.number!==old.number||next.courtName!==old.courtName)&&await courtIdentityInUse(next.number,next.courtName||'',old?.id))throw new ConflictError('This court and cause already exist. Ask a docket editor to verify the property link.');
 if(!old)next.propertyLinkHistory=[{accountId:account.id,at:next.updatedAt,by:v.name,byId:v.id,basis:'Created from the linked property profile.'}];if(next.statements.length>(old?.statements.length||0))next.statements[next.statements.length-1]={...next.statements.at(-1)!,shareWithProperty:true};await insertEdition(next);return {record:accountCase(next)};}
export async function authorizePropertyFile(v:Viewer,fields:Record<string,string>){if(Object.keys(fields).some(k=>!['accountId','matterId','documentType','otherDocumentType'].includes(k)))throw new AppError('Invalid property upload destination.');const {account}=await propertyCourtScope(v,fields.accountId,true);const m=await linked(fields.matterId,account.id);classifyDocument('hearings',fields.documentType,fields.otherDocumentType);return m;}
export async function addPropertyFile(v:Viewer,d:StagedDocument,fields:Record<string,string>){const prior=await authorizePropertyFile(v,fields),meta=classifyDocument('hearings',fields.documentType,fields.otherDocumentType),{bytes,name,type}=validatedDocumentBytes(d.bytes,d.name,ccrCourtFileBytes),sum=createHash('sha256').update(bytes).digest('hex'),existing=prior.files?.find(x=>x.sha256===sum);
 if(existing){if(!existing.shareWithProperty||existing.documentType!==meta.documentType||existing.otherDocumentType!==meta.otherDocumentType)throw new ConflictError('The docket already has this document. Ask a docket editor to review its classification and sharing.');return {id:existing.id,status:'unchanged'};}if((prior.files?.length||0)>=200)throw new AppError('The case document limit has been reached.');
 const id=crypto.randomUUID(),at=new Date().toISOString(),key='ccr-court-documents/'+prior.id+'/'+id,doc:CourtDocument={...meta,id,at,by:v.name,byId:v.id,sha256:sum,name,type,bytes:bytes.length,shareWithProperty:true};await financeFiles().put(key,await encryptBytes(bytes),{httpMetadata:{contentType:'application/octet-stream'}});try{await insertEdition({...prior,version:prior.version+1,updatedAt:at,updatedBy:v.name,actorId:v.id,files:[...(prior.files||[]),doc]});}catch(e){if(e instanceof ConflictError||e instanceof AppError&&e.status===413)await financeFiles().delete(key).catch(()=>{});throw e;}return {id,status:'added'};}
export async function readPropertyFile(v:Viewer,accountId:unknown,matterId:unknown,fid:unknown){const {account}=await propertyCourtScope(v,accountId),m=await linked(matterId,account.id);if(typeof fid!=='string'||!m.files?.some(f=>f.id===fid&&f.shareWithProperty))throw new AppError('Document not found on this property.',404);return readAuthorizedCourtOriginal(m,fid);}
