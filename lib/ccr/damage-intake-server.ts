import {createHash} from 'node:crypto';
import {financeDb} from '@/db/finance';
import {encode,decode,readAssetClaims} from '@/lib/hr/server';
import {canAccess} from '@/lib/finance/access';
import type {Viewer} from '@/lib/finance/model';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import {yearCaseRows,claimChoiceRows} from '@/lib/accounts/server';
import {allRecords} from '@/lib/finance/server';
import {businessToday} from '@/lib/year-history/model';
import {operationalChanges,prepareClaimOperations,type ClaimOperations} from './claim-operations';
import {CCR} from './docket-model';
import {damageCaseFactChanges,intakeNorm,intakeStatus,intakeText,parseDamageManifest,prepareDamageCaseFacts,reconcileDamageManifest,type DamageManifest,type DamageIntake,type DamageOriginalSource} from './damage-intake-model';
const versions='ccr_damage_intake_versions',sourceKeys='ccr_damage_intake_sources';
export function assertDamageIntakeAccess(v:Viewer,edit=false){if(!v?.person||!v.id||v.id.startsWith('preview:')||v.onboardingOnly||!canAccess(v,CCR,'damage',edit))throw new ForbiddenError();}
const db=<T>(run:(d:D1Database)=>Promise<T>)=>run(financeDb());
export async function listDamageIntakes(v:Viewer):Promise<DamageIntake[]>{assertDamageIntakeAccess(v);const rows=await db(d=>d.prepare('SELECT a.payload FROM '+versions+' a JOIN (SELECT id,MAX(version) AS v FROM '+versions+' GROUP BY id) x ON a.id=x.id AND a.version=x.v ORDER BY a.updated_at DESC').all<{payload:string}>());return Promise.all(rows.results.map(r=>decode(r.payload)));}
/** Scoped HR callers receive only these references, never claim narratives or correspondence. */
export async function damageIntakeReferencesForDriver(driverId:string):Promise<{id:string;driverId:string;reportedOn:string;status:string;claimReference?:string}[]>{
 if(!driverId)return [];
 const result=await db(d=>d.prepare('SELECT a.payload FROM '+versions+' a JOIN (SELECT id,MAX(version) AS v FROM '+versions+' GROUP BY id) x ON a.id=x.id AND a.version=x.v').all<{payload:string}>()),records=await Promise.all(result.results.map(r=>decode(r.payload) as Promise<DamageIntake&Record<string,unknown>>));
 return records.filter(r=>r.driverId===driverId&&!r.deletedAt&&!r.example&&!r.sample&&!r.isSample&&!r.trainingSample&&!r.isDemo).map(r=>({id:r.id,driverId,reportedOn:r.reportedOn,status:r.status,...(r.claimReference?{claimReference:r.claimReference}:{})}));
}
export async function getDamageIntake(id:string):Promise<DamageIntake>{if(!/^dmi_[a-f0-9]{64}$/.test(id))throw new AppError('Choose a saved damage claim.',404);const r=await db(d=>d.prepare('SELECT payload FROM '+versions+' WHERE id=? ORDER BY version DESC LIMIT 1').bind(id).first<{payload:string}>());if(!r)throw new AppError('Damage claim not found.',404);return decode(r.payload);}
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const sourceIds=(b:DamageManifest)=>[...new Set(b.references.flatMap(r=>['m:'+r.messageId,'t:'+r.threadId]))].map(k=>hash('support@gtowingtransport.com:'+k));
function originalSource(r:DamageIntake):DamageOriginalSource{
 return {threadId:r.threadId,title:r.title,reportedOn:r.reportedOn,summary:r.summary,status:r.initialStatus||r.status,
  ...(r.initialStatusBasis||r.statusBasis?{statusBasis:r.initialStatusBasis||r.statusBasis}:{}),
  ...(r.vehicle?{vehicle:r.vehicle}:{}),...(r.claimReference?{claimReference:r.claimReference}:{}),...(r.propertyName?{propertyName:r.propertyName}:{}),
  ...(r.sourceKind?{sourceKind:r.sourceKind}:{}),...(r.driveSourceId?{driveSourceId:r.driveSourceId}:{}),version:r.version,filedAt:r.createdAt,filedBy:r.createdBy};
}
export async function saveDamageEdition(r:DamageIntake,lookups:string[]=[]){
 // Never accept a replacement snapshot, even from another internal writer. For
 // legacy records use the earliest stored edition, not the latest mutable facts.
 let source=originalSource(r);
 if(r.version>1){
  const row=await db(d=>d.prepare('SELECT payload FROM '+versions+' WHERE id=? ORDER BY version ASC LIMIT 1').bind(r.id).first<{payload:string}>());
  if(!row)throw new ConflictError('The original claim record is unavailable. Refresh before making changes.');
  const first=await decode(row.payload) as DamageIntake;source=first.originalSource||originalSource(first);
 }
 const payload=await encode({...r,originalSource:source});if(payload.length>1450000)throw new AppError('The claim record has reached its storage limit.',413);
 try{await db(d=>d.batch([d.prepare('INSERT INTO '+versions+' (id,version,payload,updated_at) VALUES(?,?,?,?)').bind(r.id,r.version,payload,r.updatedAt),...lookups.map(l=>d.prepare('INSERT INTO '+sourceKeys+' (lookup,id) VALUES(?,?)').bind(l,r.id))]));}
 catch(e){if(/UNIQUE constraint|PRIMARY KEY constraint/i.test(String(e)))throw new ConflictError('The claim or its source changed. Refresh and check the saved record.');throw e;}
}
async function matches(b:DamageManifest){
 const keys=sourceIds(b),found=new Map<string,string>();
 for(let i=0;i<keys.length;i+=60){const slice=keys.slice(i,i+60);const rows=await db(d=>d.prepare('SELECT lookup,id FROM '+sourceKeys+' WHERE lookup IN ('+slice.map(()=>'?').join(',')+')').bind(...slice).all<{lookup:string;id:string}>());for(const r of rows.results)found.set(r.lookup,r.id);}
 const ids=new Set(found.values());if(ids.size>1)throw new ConflictError('These source messages belong to multiple cases. Review their identity before filing.');
 const id=[...ids][0];return {prior:id?await getDamageIntake(id):undefined,keys:keys.filter(k=>!found.has(k))};
}
export async function damageImport(v:Viewer,raw:unknown,receipt=false){
 assertDamageIntakeAccess(v,true);const b=parseDamageManifest(raw),{prior,keys}=await matches(b),delta=prior?reconcileDamageManifest(prior,b):undefined;
 const needed=!prior||!!keys.length||!!delta?.additions.length||!!delta&&Object.keys(delta.fill).length>0;
 if(receipt)return {status:needed?'incomplete':'confirmed',id:prior?.id,matchedSources:b.references.length-(delta?.additions.length??b.references.length)};
 if(!needed&&prior)return {status:'unchanged',id:prior.id};
 const property=b.propertyName||'',ref=b.claimReference||'',title=intakeNorm(b.title);
 // No silent double counting across registers; a similar property name, vehicle, subject or email address alone never joins cases.
 const [rows,others,assets]=await Promise.all([yearCaseRows(),listDamageIntakes(v),readAssetClaims()]);
 if(others.some(r=>r.id!==prior?.id&&((ref&&r.claimReference&&intakeNorm(ref)===intakeNorm(r.claimReference))||(r.reportedOn===b.reportedOn&&intakeNorm(r.title)===title))))throw new ConflictError('Another intake has this claim reference or the same title and date. Review its original sources before filing.');
 if(rows.some(r=>r.kind==='claim'&&!r.deletedAt&&((ref&&r.insurerClaimNumber&&intakeNorm(ref)===intakeNorm(String(r.insurerClaimNumber)))||(r.date===b.reportedOn&&intakeNorm(r.name||'')===title))))throw new ConflictError('A property investigation may already cover this claim. Review it before importing a second record.');
 if(assets.some(r=>!r.data.deletedAt&&!r.data.example&&!r.data.sample&&!r.data.isSample&&!r.data.trainingSample&&!r.data.isDemo&&((ref&&r.data.insurerClaimNumber&&intakeNorm(ref)===intakeNorm(String(r.data.insurerClaimNumber)))||(r.data.reportedDate===b.reportedOn&&typeof r.data.title==='string'&&intakeNorm(r.data.title)===title))))throw new ConflictError('An employee asset investigation may already cover this claim. Review it before importing a second record.');
 const accounts=property?rows.filter(r=>r.kind==='account'&&!r.deletedAt&&intakeNorm(r.name||'')===intakeNorm(property)):[],now=new Date().toISOString(),accountId=accounts.length===1?accounts[0].id:undefined;
 const id=prior?.id||'dmi_'+hash('support@gtowingtransport.com:'+b.threadId),r:DamageIntake=prior&&delta?{...prior,...delta.fill,...(!prior.accountId&&accountId?{accountId}:{}),version:prior.version+1,references:[...prior.references,...delta.additions],updatedAt:now,updatedBy:v.name,actorId:v.id}:{...b,id,initialStatus:b.status,...(b.statusBasis?{initialStatusBasis:b.statusBasis}:{}),version:1,...(accountId?{accountId}:{}),createdAt:now,createdBy:v.name,updatedAt:now,updatedBy:v.name,actorId:v.id,updates:[],files:[]};
 await saveDamageEdition(r,keys);return {status:prior?'updated':'created',id:r.id};
}
export async function noteDamage(v:Viewer,b:Record<string,unknown>){
 assertDamageIntakeAccess(v,true);
 if(Object.keys(b).some(k=>!['action','id','version','status','note','details','caseFacts'].includes(k)))throw new AppError('Submit only the current claim facts, operational details and a case update.');
 const r=await getDamageIntake(intakeText(b.id,100,true));if(b.version!==r.version)throw new ConflictError();
 const status=intakeStatus(b.status),note=intakeText(b.note,4000,true),at=new Date().toISOString(),today=businessToday();let details:ClaimOperations&{accountId?:string;linkedAccountName?:string}={};
 const caseFacts=b.caseFacts===undefined?{}:prepareDamageCaseFacts(b.caseFacts,today);
 if(b.details!==undefined){
  if(!b.details||typeof b.details!=='object'||Array.isArray(b.details))throw new AppError('Submit the case details to update.');
  const {accountId,...patch}=b.details as Record<string,unknown>,[staff,rows]=await Promise.all([allRecords(),claimChoiceRows()]);
  details=prepareClaimOperations(patch,r,staff,rows,today);
  if(accountId!==undefined){const id=intakeText(accountId,150),account=rows.find(x=>x.id===id&&x.kind==='account'&&!x.deletedAt&&!x.example&&!x.sample&&!x.isSample&&!x.trainingSample&&!x.isDemo);if(id!==r.accountId&&id&&!account)throw new AppError('Choose an existing account.');if(id!==r.accountId)details={...details,accountId:id,linkedAccountName:account?.name||''};}
 }
 const changes={...damageCaseFactChanges(r,caseFacts),...operationalChanges(r,details),...(status!==r.status?{status:{before:r.status,after:status}}:{})};
 await saveDamageEdition({...r,...caseFacts,...details,status,...(status!==r.status?{statusBasis:note}:{}),updates:[...r.updates,{note,status,at,by:v.name,byId:v.id,changes}],version:r.version+1,updatedAt:at,updatedBy:v.name,actorId:v.id});return {status:'updated',id:r.id};
}
