import {timedFetch} from '@/lib/shared/client';
import {stageDocument} from './document-stage-client';
import type {ReviewedDamage,DamagePackage,DamageExhibit} from './damage-package';
import type {DamageIntake} from './damage-intake-model';
const path='/api/ccr/damage-intake';
class RequestIssue extends Error{constructor(message:string,readonly transient=false){super(message);}}
async function call<T>(url:string,body?:unknown):Promise<T>{
 let r:Response;try{r=await timedFetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{},40000);}catch(e){throw new RequestIssue((e as Error).message,true);}
 const value=await r.json().catch(()=>undefined) as (T & {error?:string})|undefined;if(!r.ok||!value)throw new RequestIssue(value?.error||'Unable to confirm the filing (HTTP '+r.status+').',r.ok||[408,425,429].includes(r.status)||r.status>=500);return value;
}
async function read<T>(fn:()=>Promise<T>):Promise<T>{for(let i=0;;i++){try{return await fn();}catch(e){if(i>=2||!(e instanceof RequestIssue)||!e.transient)throw e;await new Promise(r=>setTimeout(r,500*2**i));}}}
type Receipt={id?:string;status:string;matchedSources:number};
type State={record?:DamageIntake;id?:string;matched:number;complete:boolean;caseSaved:boolean};
function sameFile(r:DamageIntake|undefined,f:DamageExhibit){const known=r?.files.find(x=>x.sha256===f.sha256);if(known&&(known.documentType!==f.documentType||(known.otherDocumentType||'')!==(f.otherDocumentType||'')||!!f.sourceMessageId&&known.sourceMessageId!==f.sourceMessageId))throw Error('A stored original has a different document type or source reference. Review '+f.name+'.');return !!known;}
export async function damageReceipt(c:ReviewedDamage):Promise<State>{
 const {documents,...record}=c;const a=await read(()=>call<Receipt>(path,{action:'receipt',record}));
 if(!['confirmed','incomplete'].includes(a.status))throw Error('Unrecognized filing receipt.');
 if(!a.id){if(a.status==='confirmed')throw Error('Missing claim identifier in filing receipt.');return {matched:0,complete:false,caseSaved:false};}
 const b=await read(()=>call<{record:DamageIntake}>(path+'?id='+encodeURIComponent(a.id!)));if(b.record?.id!==a.id||!Array.isArray(b.record.files))throw Error('Could not verify the saved claim.');
 const matched=documents.filter(f=>sameFile(b.record,f)).length,caseSaved=a.status==='confirmed'&&a.matchedSources===c.references.length;
 return {record:b.record,id:a.id,matched,caseSaved,complete:caseSaved&&matched===documents.length};
}
export async function putOriginal(file:File,fields:Record<string,string>,sha256:string,progress:(n:number,t:number)=>void,existingOnly=false){
 if(existingOnly||file.size>400*1024||!fields.sourceMessageId)return stageDocument<{sha256:string;id:string}>(path+'/documents/stage',file,fields,progress,undefined,true,existingOnly);
 const form=new FormData();form.set('file',file);form.set('sha256',sha256);for(const [k,v] of Object.entries(fields))form.set(k,v);
 progress(0,file.size);const r=await timedFetch(path+'/documents',{method:'POST',body:form},65000),data=await r.json().catch(()=>undefined) as {sha256?:string;id?:string;error?:string}|undefined;
 if(!r.ok||typeof data?.sha256!=='string'||typeof data?.id!=='string')throw Error(data?.error||'Could not confirm the original upload (HTTP '+r.status+').');
 progress(file.size,file.size);return data as {sha256:string;id:string};
}
export async function fileDamage(c:ReviewedDamage,data:DamagePackage['data'],note:(s:string)=>void):Promise<State>{
 note('Checking existing claim');let s=await damageReceipt(c);if(s.complete)return s;
 if(!s.caseSaved){const {documents,...record}=c;try{await call<{id:string}>(path,{action:'import',record});}catch(e){if(!(e instanceof RequestIssue)||!e.transient)throw e;}
  s=await damageReceipt(c);if(!s.caseSaved||!s.id)throw Error('A saved claim could not be verified. Retry will check before filing.');}
 for(const f of c.documents){if(sameFile(s.record,f))continue;
  const fields:Record<string,string>={claimId:s.id!,documentType:f.documentType};if(f.otherDocumentType)fields.otherDocumentType=f.otherDocumentType;if(f.sourceMessageId)fields.sourceMessageId=f.sourceMessageId;
  for(let attempt=0;;attempt++){try{const result=await putOriginal(new File([new Uint8Array(data[f.path])],f.name),fields,f.sha256,(n,t)=>note(f.name+' · '+Math.floor(n*100/t)+'%'));if(result.sha256!==f.sha256||result.id!==s.id)throw Error('Unexpected evidence receipt.');break;}catch(e){const check=await damageReceipt(c);if(sameFile(check.record,f))break;if(attempt||!(/timeout|timed out|connection|unreadable|too many|server|network|unavailable|try again|HTTP 500|502|503|504/i.test((e as Error).message)))throw e;note('Resuming '+f.name);}}
 }
 note('Verifying filing and originals');s=await damageReceipt(c);if(!s.complete)throw Error('The saved claim has '+s.matched+' of '+c.documents.length+' originals. Retry to attach the missing evidence.');return s;
}
