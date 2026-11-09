import {timedFetch} from '@/lib/shared/client';
import {stageCourtOriginal,cancelCourtStage} from './court-stage-client';
import type {CourtPackage,ReviewedCase} from './court-package';
export type FilingState={phase:'new'|'ready'|'check'|'review'|'blocked'|'done';message:string;stages:Map<string,string>;receipt?:ReceiptDetail;prepared?:FormData};
export const newFiling=():FilingState=>({phase:'new',message:'',stages:new Map()});
type Receipt='confirmed'|'incomplete'|'review';
export type ReceiptDetail={status:Receipt;matchedDocuments?:number;expectedDocuments?:number};
export const sourceCount=(c:ReviewedCase)=>new Set(c.documents.map(d=>d.sha256.toLowerCase())).size;
class CheckFailure extends Error{constructor(message:string,readonly transient=false,readonly wait=0){super(message);}}
type Verdict={kind:'success'|'uncertain'|'expired'|'rejected';message:string};
export function receiptManifest(c:ReviewedCase){
 const x=c as ReviewedCase&{relatedCauses?:string[];causeCategory?:string},out=c.newOutcome;
 const appearances=c.appearances?.map(a=>{if(!a||typeof a!=='object')return {};const r=a as Record<string,unknown>;return {label:r.label,date:r.date,time:r.time,status:r.status};});
 return {number:c.number,title:c.title,courtName:c.courtName,partyAsPrinted:c.partyAsPrinted,partyBasis:c.partyBasis,type:c.type,status:c.status,filedOn:c.filedOn,propertyName:c.propertyName,statement:c.statement,relatedCauses:x.relatedCauses,causeCategory:x.causeCategory,appearances,newOutcome:out&&{result:out.result,on:out.on,stage:out.stage,prevailingParty:out.prevailingParty,otherParty:out.otherParty,settlementCents:out.settlementCents},documents:c.documents.map(({name,documentType,otherDocumentType,sha256})=>({name,documentType,...(otherDocumentType?{otherDocumentType}:{}),sha256}))};
}
export async function filingReceipt(c:ReviewedCase):Promise<ReceiptDetail>{
 let r:Response;try{r=await timedFetch('/api/ccr/docket/import/receipt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({record:receiptManifest(c)})},45000);}catch{throw new CheckFailure('The receipt service did not respond.',true);}
 const data=await r.json().catch(()=>null) as {status?:Receipt;error?:string;matchedDocuments?:number;expectedDocuments?:number}|null,n=sourceCount(c);
 const step=r.headers.get('retry-after')||'',wait=Math.min(10000,Math.max(0,/^\d+$/.test(step)?Number(step)*1000:Date.parse(step)-Date.now()||0));
 if(!r.ok||!data?.status||!['confirmed','incomplete','review'].includes(data.status))throw new CheckFailure('The docket could not verify the filing (HTTP '+r.status+').'+(data?.error?' '+data.error:''),r.ok||[408,425,429].includes(r.status)||r.status>=500,wait);
 if(data.status==='review')return {status:'review'};
 if(data.expectedDocuments!==n||typeof data.matchedDocuments!=='number'||!Number.isSafeInteger(data.matchedDocuments)||data.matchedDocuments<0||data.matchedDocuments>n||data.status==='confirmed'&&data.matchedDocuments!==n)throw new CheckFailure('The receipt returned inconsistent document counts.');
 return {status:data.status,matchedDocuments:data.matchedDocuments,expectedDocuments:n};
}
async function finalAttempt(fd:FormData):Promise<Verdict>{
 let r:Response;
 try{r=await timedFetch('/api/ccr/docket/import',{method:'POST',body:fd},120000);}catch{return {kind:'uncertain',message:'The final filing response did not arrive.'};}
 const data=await r.json().catch(()=>null) as {status?:string;error?:string;id?:string;addedFiles?:number}|null;
 if(r.ok&&typeof data?.id==='string'&&data.id&&['created','updated','unchanged'].includes(data.status||'')&&typeof data.addedFiles==='number'&&Number.isSafeInteger(data.addedFiles)&&data.addedFiles>=0){
  const status=data.status==='created'?'Created':data.status==='updated'?'Updated':'Already on File';
  return {kind:'success',message:status+' · '+data.addedFiles+' New '+(data.addedFiles===1?'Document':'Documents')};
 }
 const message='HTTP '+r.status+(data?.error?': '+data.error:': The final filing could not be confirmed.');
 if(r.ok||[408,425,429].includes(r.status)||r.status>=500)return {kind:'uncertain',message};
 if(r.status===404&&/upload expired|stage.{0,30}(?:expired|unavailable)|expired or is unavailable/i.test(data?.error||''))return {kind:'expired',message};
 return {kind:'rejected',message};
}
async function prepare(c:ReviewedCase,data:CourtPackage['data'],s:FilingState,progress:(label:string)=>void){
 const fd=new FormData(),documents=[],paths=new Set<string>();let left=c.documents.reduce((n,d)=>n+data[d.path].byteLength,0);
 for(const d of [...c.documents].sort((a,b)=>data[b.path].byteLength-data[a.path].byteLength)){if(left<=400*1024)break;paths.add(d.path);left-=data[d.path].byteLength;}
 for(const d of c.documents){const {path,name,documentType,otherDocumentType,sha256}=d,meta={name,documentType,...(otherDocumentType?{otherDocumentType}:{}),sha256};
  if(paths.has(path)){let id=s.stages.get(path);if(!id){progress(name);id=await stageCourtOriginal(new File([new Uint8Array(data[path])],name),sha256,(n,total)=>progress(name+' · '+Math.floor(n*100/total)+'% uploaded'));s.stages.set(path,id);}documents.push({...meta,stagedId:id});}
  else{documents.push(meta);fd.append('file',new File([new Uint8Array(data[path])],name));}
 }
 fd.set('record',JSON.stringify({...receiptManifest(c),documents}));return fd;
}
type FilingIO={check:(c:ReviewedCase)=>Promise<ReceiptDetail>;send:(fd:FormData)=>Promise<Verdict>;prepare:typeof prepare;cancel:(id:string)=>Promise<void>};
const io:FilingIO={check:filingReceipt,send:finalAttempt,prepare,cancel:cancelCourtStage};
async function release(s:FilingState,ops:FilingIO){const ids=[...s.stages.values()];s.stages.clear();s.prepared=undefined;await Promise.allSettled(ids.map(id=>ops.cancel(id)));}
const say=(s:FilingState,phase:FilingState['phase'],message:string)=>{s.phase=phase;s.message=message;};
async function verify(c:ReviewedCase,s:FilingState,ops:FilingIO):Promise<Receipt|'unknown'>{
 try{const result=await ops.check(c);s.receipt=result;return result.status;}catch(e){s.receipt=undefined;say(s,'check','Filing status unknown. '+(e instanceof Error?e.message+' ':'')+'Check the filing again before retrying. No additional copy was sent.');return 'unknown';}
}
async function disposition(value:Receipt|'unknown',s:FilingState,ops:FilingIO){
 if(value==='confirmed'){say(s,'done','Verified on the docket · The reviewed case and document fingerprints match.');await release(s,ops);return true;}
 if(value==='review'){say(s,'review','Manual review required. Compare the existing docket entry with the packet before filing. No additional copy was sent.');return true;}
 return value==='unknown';
}
export async function fileReviewedCase(c:ReviewedCase,data:CourtPackage['data'],s:FilingState,progress:(label:string)=>void,ops:FilingIO=io){
 const previous=s.phase;if(previous==='done'||previous==='blocked')return;
 // A receipt check is read only. Also run it on a fresh page/ZIP so losing local state never implies a new filing.
 progress('Checking Filing Status');const first=await verify(c,s,ops);if(await disposition(first,s,ops))return;
 if(previous==='check'||previous==='review'){say(s,'ready','The docket reports an incomplete filing. Select Retry Incomplete Filings to submit the originals.');return;}
 try{if(!s.prepared)s.prepared=await ops.prepare(c,data,s,progress);}catch(e){say(s,'ready','Filing not submitted. '+(e instanceof Error?e.message:'An original could not be prepared.'));return;}
 progress('Submitting Reviewed Case');const result=await ops.send(s.prepared).catch(()=>({kind:'uncertain' as const,message:'The final filing response did not arrive.'}));
 if(result.kind==='success'){s.receipt={status:'confirmed',expectedDocuments:sourceCount(c),matchedDocuments:sourceCount(c)};say(s,'done',result.message);s.prepared=undefined;s.stages.clear();return;}
 if(result.kind==='rejected'){say(s,'blocked',result.message+' No automatic retry. Review the case or your access before choosing a corrected packet.');await release(s,ops);return;}
 progress('Verifying Filing After Interrupted Submission');const after=await verify(c,s,ops);if(await disposition(after,s,ops))return;
 if(result.kind==='expired'){await release(s,ops);say(s,'ready','The filing is incomplete and the temporary uploads expired. Retry to upload the originals again.');return;}
 say(s,'ready','The docket reports an incomplete filing. The prepared originals were kept. Retry Incomplete Filings will check the docket again before resubmitting.');
}

/** Explicit read-only packet review. No import, stage, seal or cancellation requests are made. */
export async function checkCourtReceipts(cases:ReviewedCase[],stateFor:(c:ReviewedCase)=>FilingState,onChecked:(c:ReviewedCase,s:FilingState,checked:number)=>void,read=filingReceipt,pause:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){
 let cursor=0,finished=0;
 const worker=async()=>{while(cursor<cases.length){const c=cases[cursor++],s=stateFor(c),wasBlocked=s.phase==='blocked';
  try{let detail:ReceiptDetail|undefined;
   for(let i=0;i<3;i++){try{detail=await read(c);break;}catch(e){if(!(e instanceof CheckFailure)||!e.transient||i===2)throw e;await pause(Math.max(e.wait,(300+Math.random()*200)*2**i));}}
   if(!detail)throw Error('No receipt was returned.');s.receipt=detail;
   if(detail.status==='confirmed'){say(s,'done','Verified on the docket · '+detail.matchedDocuments+' of '+detail.expectedDocuments+' source originals matched.');s.prepared=undefined;s.stages.clear();}
   else if(detail.status==='review'){say(s,'review','Manual review required. The docket could not verify the case identity or outcome; the document count is unknown.');}
   else say(s,wasBlocked?'blocked':'ready','Incomplete filing · '+detail.matchedDocuments+' of '+detail.expectedDocuments+' source originals matched.'+(wasBlocked?' Review the earlier rejection before filing a corrected packet.':' No records were submitted.'));
  }catch(e){s.receipt=undefined;say(s,wasBlocked?'blocked':'check','Filing status unknown. '+(e instanceof Error?e.message:'The service did not respond.')+' No records were submitted.');}
  onChecked(c,s,++finished);
 }};
 await Promise.all(Array.from({length:Math.min(cases.length,3)},worker));
}
export function receiptTotals(cases:ReviewedCase[],resultFor:(c:ReviewedCase)=>ReceiptDetail|undefined){
 let confirmedCases=0,matched=0,unmatched=0,unverified=0;
 for(const c of cases){const r=resultFor(c);if(!r||r.status==='review'){unverified+=sourceCount(c);continue;}if(r.status==='confirmed')confirmedCases++;matched+=r.matchedDocuments||0;unmatched+=(r.expectedDocuments||0)-(r.matchedDocuments||0);}
 return {confirmedCases,outstandingCases:cases.length-confirmedCases,matched,unmatched,unverified};
}
