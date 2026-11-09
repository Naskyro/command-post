import {createHash} from 'node:crypto';
import {allRecords} from '@/lib/finance/server';
import type {Viewer} from '@/lib/finance/model';
import {financeDb} from '@/db/finance';
import {yearCaseRows} from '@/lib/accounts/server';
import {canRead} from '@/lib/accounts/policy';
import {readAssetClaims} from '@/lib/hr/server';
import {AppError,ConflictError} from '@/lib/shared/errors';
import {docket} from '@/lib/ccr/docket-server';
import {realDay} from '@/lib/ccr/docket-model';
import {listDamageIntakes,saveDamageEdition} from '@/lib/ccr/damage-intake-server';
import {intakeText,type DamageIntake} from '@/lib/ccr/damage-intake-model';
import {getRegister,insertReviewedRegisterEdition} from '@/lib/ccr/register-server';
import {prepareRegister,ownerChoices,leadership} from '@/lib/ccr/register-model';
import {tdlrRegisterStatus,verifiedTdlr} from '@/lib/ccr/tdlr';
import {requireSourceAccess} from './authorization';
import {validTarget} from './model';
type Scope='damage'|'tdlr'|'hearings';
type Candidate={id:string;num:string[];files:{id:string;sha256:string;bytes:number}[];url?:(fid:string)=>string;title:string;reportedOn?:string;supportThreads?:string[]};
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const reference=(v:string)=>v.toUpperCase().trim().replace(/[\s-]/g,'');
const sameTitle=(s:string)=>s.toLowerCase().trim().replace(/\s+/g,' ');
const visible=(d:Record<string,unknown>)=>!d.deletedAt&&!d.example&&!d.sample&&!d.isSample&&!d.trainingSample&&!d.isDemo;
const str=(x:unknown)=>typeof x==='string'?x:'';
const table='ccr_reviewed_drive_links';
const currentLink=(db:D1Database,key:string)=>db.prepare('SELECT target_id FROM '+table+' WHERE source_key=?').bind(key).first<{target_id:string}>();
async function candidates(v:Viewer,scope:Scope):Promise<Candidate[]>{
 if(scope==='hearings')return (await docket(v)).map(r=>({id:r.id,num:[r.number],files:r.files||[],title:r.title,url:id=>'/api/ccr/docket/file?'+new URLSearchParams({id:r.id,file:id})}));
 if(scope==='tdlr')return (await getRegister(v,scope,await allRecords())).rows.map(r=>({id:r.id,num:[r.reference,r.tdlr?.pairedReference||'',r.tdlr?.tracking||''],files:r.files,title:r.title,url:id=>'/api/ccr/register/file?'+new URLSearchParams({section:scope,id:r.id,file:id})}));
 const [intake,props,assets]=await Promise.all([listDamageIntakes(v),yearCaseRows(),readAssetClaims()]);
 return [...intake.map(r=>({id:r.id,num:[r.claimReference||''],title:r.title,reportedOn:r.reportedOn,supportThreads:r.references.map(x=>x.threadId),files:r.files,url:(id:string)=>'/api/ccr/damage-intake/documents?'+new URLSearchParams({id:r.id,file:id})})),...props.filter(r=>r.kind==='claim'&&visible(r)&&canRead(v,r)).map(r=>({id:'property:'+r.id,num:[str(r.insurerClaimNumber),str(r.towbookReference)],title:str(r.name),reportedOn:str(r.date),files:[]})),...assets.filter(a=>a.kind==='assetClaim'&&visible(a.data)).map(a=>({id:'asset:'+a.id,num:[str(a.data.insurerClaimNumber)],title:str(a.data.title),reportedOn:str(a.data.reportedDate),files:[]}))];
}
export async function assertCcrTarget(v:Viewer,scope:Scope,id:string){await requireSourceAccess(v,scope);if(!validTarget(id)||!(await candidates(v,scope)).some(r=>r.id===id))throw new AppError('The selected CCR record is not available in this section.',404);}
export async function recognizedCcrOriginal(v:Viewer,scope:Scope,id:string,sha256:string,bytes:number){
 await requireSourceAccess(v,scope);if(!validTarget(id))return;const r=(await candidates(v,scope)).find(r=>r.id===id);if(!r)throw new AppError('Record not found.',404);
 // Native intake originals are owner-only. Non-owners must not be given a broader alternative path to these bytes.
 if(scope==='damage'&&!v.owner)return;
 const f=r.files.find(f=>f.sha256===sha256&&f.bytes===bytes);return f&&r.url?{url:r.url(f.id),fileId:f.id}:undefined;
}
const tokens=(v:unknown,lim:number,max:number)=>{if(v===undefined)return [] as string[];if(!Array.isArray(v)||v.length>lim)throw new AppError('Too many reviewed source references.');return v.map(s=>intakeText(s,max,true));};
export async function routeCcrSource(v:Viewer,raw:unknown,write:boolean){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AppError('Choose a reviewed CCR source record.');
 const x=raw as Record<string,unknown>,scope=x.scope;if(scope!=='damage'&&scope!=='tdlr'&&scope!=='hearings')throw new AppError('Choose a CCR source workspace.');await requireSourceAccess(v,scope,true);
 const sourceId=intakeText(x.sourceId,220,true);if(!/^[a-zA-Z0-9_-]{5,220}$/.test(sourceId))throw new AppError('Enter the original Drive file or case folder ID.');
 const title=intakeText(x.title,160,true),summary=intakeText(x.summary,2300,true),on=intakeText(x.reportedOn,10),property=intakeText(x.propertyName,200),vehicle=intakeText(x.vehicle,200),ref=intakeText(x.reference,160),rels=tokens(x.relatedReferences,20,160),hashes=tokens(x.sourceHashes,200,64),thread=intakeText(x.supportThreadId,160),target=validTarget(x.targetId);
 if(on&&!realDay(on)||hashes.some(h=>!/^[a-f0-9]{64}$/.test(h))||thread&&!/^[a-zA-Z0-9_-]{5,160}$/.test(thread))throw new AppError('Check the source date, thread ID, or document fingerprints.');
 const db=financeDb(),key=digest(scope+':drive:'+sourceId),pin=await currentLink(db,key);
 const entries=await candidates(v,scope),refs=new Set([ref,...rels].map(reference).filter(s=>s.length>=4));
 const nativeId=scope==='damage'?'dmi_'+digest('drive:'+sourceId):'drive_'+digest(scope+':'+sourceId).slice(0,46);
 const hits=entries.filter(c=>c.id===target||c.id===pin?.target_id||c.id===nativeId||c.num.some(s=>refs.has(reference(s)))||!!thread&&c.supportThreads?.includes(thread)||c.files.some(f=>hashes.includes(f.sha256)));
 if(target&&!entries.some(c=>c.id===target)||pin&&!entries.some(c=>c.id===pin.target_id))throw new AppError('The existing CCR target is missing or not accessible.',404);
 if(hits.length>1)throw new ConflictError('These sources point to different CCR records. Review the originals before linking.');
 if(hits.length===0&&entries.some(c=>sameTitle(c.title)===sameTitle(title)&&(!on||!c.reportedOn||c.reportedOn===on)))throw new ConflictError('A similar record already exists. Confirm the native target using the original sources.');
 if(!hits.length&&(scope==='hearings'||scope==='damage'&&thread))throw new ConflictError(scope==='hearings'?'File the verified PTE matter through the Court Docket first, then attach this evidence.':'File the matching Support claim before linking these Drive originals.');
 const tid=hits[0]?.id||nativeId;
 if(!write)return {status:hits.length?'matched':'ready',scope,targetId:tid};
 if(!hits.length){
  const at=new Date().toISOString();
  if(scope==='damage'){
   const matches=property?(await yearCaseRows()).filter(r=>r.kind==='account'&&visible(r)&&sameTitle(str(r.name))===sameTitle(property)):[];
   const data:DamageIntake={id:tid,version:1,threadId:'',sourceKind:'Google Drive',driveSourceId:sourceId,title,summary,reportedOn:on,status:'Outcome Unverified',initialStatus:'Outcome Unverified',references:[],files:[],updates:[],createdAt:at,createdBy:v.name,updatedAt:at,updatedBy:v.name,actorId:v.id,...(property?{propertyName:property}:{}),...(matches.length===1?{accountId:matches[0].id}:{}),...(vehicle?{vehicle}:{}),...(ref?{claimReference:ref}:{})};await saveDamageEdition(data);
  }else{
   const staff=await allRecords(),tdlr=verifiedTdlr(x.tdlr);if(tdlr?.stage==='Agency Disposition Received')throw new AppError('File the original agency decision before recording a final outcome.');
   const r=prepareRegister(v,'tdlr',{section:'tdlr',version:0,title,category:'Agency Complaint',reference:ref,status:x.tdlr&&tdlr?tdlrRegisterStatus(tdlr.stage):'Outcome Unverified',steps:[],note:summary,tdlr},undefined,ownerChoices(v,'tdlr',staff),leadership(v,staff),at);
   await insertReviewedRegisterEdition({...r,id:tid});
  }
 }
 await db.prepare('INSERT OR IGNORE INTO '+table+' (source_key,target_id) VALUES(?,?)').bind(key,tid).run();const check=await db.prepare('SELECT target_id FROM '+table+' WHERE source_key=?').bind(key).first<{target_id:string}>();if(check?.target_id!==tid)throw new ConflictError('The Drive source was linked elsewhere. Refresh before filing.');
 return {status:hits.length?'matched':'created',scope,targetId:tid};
}
