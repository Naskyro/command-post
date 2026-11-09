import {readDamagePackage,uploadLimit,type ReviewedDamage,type DamageExhibit,type DamagePackage} from './damage-package';
import {requestJson} from '@/lib/shared/client';
import {damageReceipt,putOriginal} from './damage-intake-client';
import type {DamageIntake} from './damage-intake-model';
export type BatchFileState='pending'|'checking'|'missing'|'uploading'|'submitted'|'confirmed'|'review'|'unverified'|'waiting';
export type BatchUpdate={state:BatchFileState;message:string;percent?:number;fileId?:string};
export type EvidenceEntry={key:string;threadId:string;title:string;zipIndex:number;doc:DamageExhibit;size:number;issue?:string};
export type EvidenceZip={index:number;name:string;file:File;cases:ReviewedDamage[];keys:string[];issue?:string;fingerprint?:string};
export type EvidenceSelection={zips:EvidenceZip[];entries:Map<string,EvidenceEntry>;issues:string[];duplicates:number;claims:number};
type Receipt=Awaited<ReturnType<typeof damageReceipt>>;
export type EvidenceServices={receipt:(r:ReviewedDamage)=>Promise<Receipt>;put:typeof putOriginal;withZip:<T>(f:File,fn:(pack:DamagePackage)=>Promise<T>)=>Promise<T>};
const keyOf=(thread:string,f:DamageExhibit)=>thread+' / '+f.sha256;
async function digest(bytes:Uint8Array){const h=await crypto.subtle.digest('SHA-256',bytes as BufferSource);return Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,'0')).join('');}
async function withZip<T>(f:File,fn:(pack:DamagePackage)=>Promise<T>){if(!f.size||f.size>uploadLimit)throw Error('Choose a nonempty ZIP of 180 MB or less.');const p=readDamagePackage(new Uint8Array(await f.arrayBuffer()));try{return await fn(p);}finally{for(const k of Object.keys(p.data))delete p.data[k];}}
const svc:EvidenceServices={receipt:damageReceipt,put:putOriginal,withZip};
const errorText=(x:unknown)=>x instanceof Error?x.message:'The request did not finish.';
export async function previewEvidence(files:File[],stage:(s:string)=>void=()=>{},services=svc):Promise<EvidenceSelection>{
 if(!files.length||files.length>80)throw Error('Choose 1–80 reviewed damage ZIPs.');
 const entries=new Map<string,EvidenceEntry>(),zips:EvidenceZip[]=[],sources=new Map<string,string>(),conflicts=new Set<string>(),allClaims=new Set<string>(),issues:string[]=[];let duplicates=0;
 for(const [index,file] of files.entries()){
 const z:EvidenceZip={index,name:file.name,file,cases:[],keys:[]};zips.push(z);stage('Checking ZIP '+(index+1)+' of '+files.length+' · '+file.name);
 try{await services.withZip(file,async p=>{z.fingerprint=await digest(p.data['records.json']);z.cases=p.records;for(const c of p.records){allClaims.add(c.threadId);for(const r of c.references){for(const ref of ['t:'+r.threadId,'m:'+r.messageId]){const prev=sources.get(ref);if(prev&&prev!==c.threadId){conflicts.add(prev);conflicts.add(c.threadId);}sources.set(ref,c.threadId);}}
 for(const f of c.documents){const key=keyOf(c.threadId,f),old=entries.get(key),size=p.data[f.path].byteLength,valid=await digest(p.data[f.path])===f.sha256,why=!f.sourceMessageId?'Missing reviewed source message.':!valid?'File bytes do not match the reviewed SHA-256.':undefined;
 if(old){duplicates++;if(old.doc.sourceMessageId!==f.sourceMessageId||old.doc.documentType!==f.documentType||(old.doc.otherDocumentType||'')!==(f.otherDocumentType||''))old.issue='The same original has conflicting source or classification in these ZIPs.';else if(why){issues.push(file.name+' · '+f.name+': '+why);}else if(old.issue==='File bytes do not match the reviewed SHA-256.'){old.zipIndex=index;old.doc=f;old.size=size;old.issue=undefined;z.keys.push(key);}continue;}
 entries.set(key,{key,threadId:c.threadId,title:c.title,zipIndex:index,doc:f,size,issue:why});z.keys.push(key);}
 }});if(!z.cases.some(r=>r.documents.length))z.issue='No originals in this ZIP.';}catch(e){z.issue=errorText(e);issues.push(file.name+': '+z.issue);}
 if(entries.size>6000)throw Error('Select fewer ZIPs per run (up to 6,000 originals).');
 }
 for(const e of entries.values())if(conflicts.has(e.threadId))e.issue='A source message or thread is attributed to different claims across these ZIPs.';
 return {zips,entries,issues,duplicates,claims:allClaims.size};
}
const already=(r:DamageIntake,f:DamageExhibit)=>{const old=r.files.find(d=>d.sha256===f.sha256);if(!old)return;
 if(old.documentType!==f.documentType||(old.otherDocumentType||'')!==(f.otherDocumentType||'')||!f.sourceMessageId||old.sourceMessageId!==f.sourceMessageId)throw Error('Saved bytes have a different source message or document type.');return old.id;};
type RunOptions={mode:'check'|'file'|'retry'|'resume';activeKeys?:Set<string>;selection:EvidenceSelection;previous:Record<string,BatchUpdate>;change:(key:string,x:BatchUpdate)=>void;stage?:(s:string)=>void;pause?:()=>boolean};
export async function runEvidence({mode,activeKeys,selection,previous,change,stage=()=>{},pause=()=>false}:RunOptions,services=svc){
 const chosen=(e:EvidenceEntry)=>mode==='resume'?!!activeKeys?.has(e.key)&&previous[e.key]?.state!=='confirmed':mode==='check'||(mode==='file'?previous[e.key]?.state!=='confirmed':['missing','waiting','unverified','submitted','uploading','pending'].includes(previous[e.key]?.state||'pending'));
 const update=(e:EvidenceEntry,state:BatchFileState,message:string,extra?:Partial<BatchUpdate>)=>change(e.key,{state,message,...extra});
 for(const z of selection.zips){if(pause())break;const selected=z.keys.map(k=>selection.entries.get(k)!).filter(e=>e.zipIndex===z.index&&chosen(e));if(!selected.length)continue;
 const eligible=selected.filter(e=>{if(e.issue||z.issue){update(e,'review',e.issue||z.issue!);return false;}return true;});if(!eligible.length)continue;
 stage((mode==='check'?'Checking':'Filing')+' ZIP '+(z.index+1)+' of '+selection.zips.length+' · '+z.name);
 async function process(data?:DamagePackage){const byCase=new Map<string,EvidenceEntry[]>();for(const e of eligible)byCase.set(e.threadId,[...(byCase.get(e.threadId)||[]),e]);const groups=[...byCase];let cursor=0;
 async function work(){while(cursor<groups.length&&!pause()){const [thread,items]=groups[cursor++],c=z.cases.find(r=>r.threadId===thread)!;const manifest={...c,documents:[]};let first:Receipt;
 try{first=await services.receipt(manifest);}catch(e){for(const f of items)update(f,'unverified','Claim could not be verified: '+errorText(e));continue;}
 if(!first.id||!first.caseSaved||!first.record){for(const f of items)update(f,'waiting','The complete reviewed claim and its source messages must already be filed.');continue;}
 const current=first.record,id=first.id,touched=new Set<string>(),attemptErrors=new Map<string,string>();
 for(const e of items){if(pause())break;const f=e.doc;try{if(!current.references.some(s=>s.messageId===f.sourceMessageId))throw Error('Source message is absent from the saved claim.');const old=already(current,f);if(old){update(e,'confirmed','Verified in the saved claim.',{fileId:old});continue;}}catch(err){update(e,'review',errorText(err));continue;}
 if(!data){update(e,'missing','Not present on the saved claim.');continue;}
 if(!data.data[f.path]||await digest(data.data[f.path])!==f.sha256){update(e,'review','File bytes no longer match the reviewed SHA-256.');continue;}
 const fields:Record<string,string>={claimId:id,documentType:f.documentType,sourceMessageId:f.sourceMessageId!};if(f.otherDocumentType)fields.otherDocumentType=f.otherDocumentType;
 touched.add(e.key);let percent=-10;update(e,'uploading','Submitting original.',{percent:0});
 try{const res=await services.put(new File([data.data[f.path] as BlobPart],f.name),fields,f.sha256,(n,t)=>{const p=Math.floor(100*n/Math.max(1,t));if(p===100||p-percent>=10){percent=p;update(e,'uploading','Submitting original.',{percent:p});}},mode==='resume');if(res.sha256!==f.sha256||res.id!==id)throw Error('The server returned an inconsistent claim/fingerprint receipt.');update(e,'submitted','Submitted; checking the saved file.');}
 catch(err){const message=errorText(err);attemptErrors.set(e.key,message);update(e,'unverified','Awaiting independent readback: '+message);}
 }
 if(!touched.size)continue;
 try{const receipt=await services.receipt(manifest);if(!receipt.record||!receipt.caseSaved||receipt.id!==id)throw Error('Exact claim not verified.');for(const e of items.filter(x=>touched.has(x.key))){try{const old=already(receipt.record,e.doc);if(old)update(e,'confirmed','Verified in the saved claim.',{fileId:old});else update(e,'missing',attemptErrors.get(e.key)||'The saved claim does not yet contain this original.');}catch(err){update(e,'review',errorText(err));}}}
 catch(err){for(const e of items.filter(x=>touched.has(x.key)))update(e,'unverified','Receipt unavailable. Use Check Saved Originals: '+errorText(err));}
 }}
 await Promise.all(Array.from({length:Math.min(2,groups.length)},work));}
 try{if(mode==='check')await process();else await services.withZip(z.file,async p=>{if(await digest(p.data['records.json'])!==z.fingerprint)throw Error('The ZIP manifest changed. Select and review it again.');await process(p);});}
 catch(e){for(const f of eligible)if(previous[f.key]?.state!=='confirmed')update(f,'unverified','ZIP was not fully processed: '+errorText(e));}
 }
}

export async function matchingEvidenceStages(s:EvidenceSelection){
 const list=[...s.entries.values()].filter(e=>!e.issue),keys=new Set<string>();for(let i=0;i<list.length;i+=100){const group=list.slice(i,i+100),body={candidates:group.map(e=>({threadId:e.threadId,name:e.doc.name,bytes:e.size,sha256:e.doc.sha256,sourceMessageId:e.doc.sourceMessageId,documentType:e.doc.documentType,otherDocumentType:e.doc.otherDocumentType||''}))};
 const out=await requestJson<{matches:number[]}>('/api/ccr/damage-intake/documents/active',body,90000);if(!Array.isArray(out.matches)||out.matches.some(n=>!Number.isInteger(n)||n<0||n>=group.length))throw Error('Could not confirm matching uploads.');for(const n of out.matches)keys.add(group[n].key);
 }return keys;
}
