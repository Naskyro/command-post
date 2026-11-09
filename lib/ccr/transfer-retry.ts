import {timedFetch} from '@/lib/shared/client';

export type TransferPause=(milliseconds:number)=>Promise<void>;
const sleep:TransferPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const maxWait=15000, retries=4;
function backoff(attempt:number,after:string|null){
 const base=500*2**attempt,jitter=base*(0.8+0.4*Math.random());
 const secs=after&&/^\d+(?:\.\d+)?$/.test(after.trim())?Number(after):NaN;
 const hint=Number.isFinite(secs)?secs*1000:after?Date.parse(after)-Date.now():0;
 return Math.round(Math.min(maxWait,Math.max(jitter,Number.isFinite(hint)?hint:0)));
}
const isTransient=(s:number)=>[408,425,429,500,502,503,504,507,508,520,521,522,523,524,529,530].includes(s);
const detail=(v:unknown)=>v&&typeof v==='object'&&'error' in v&&typeof v.error==='string'?v.error.slice(0,320):'';
async function body(r:Response):Promise<unknown>{try{return await r.json();}catch{return undefined;}}
/** Exactly one attempt. Never replay a mutation that creates an upload session. */
export async function openStage<T>(url:string,payload:Record<string,unknown>):Promise<T>{
 const r=await timedFetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)},60000),data=await body(r);
 if(!r.ok||!data||typeof data!=='object')throw Error('Could not open the document upload (HTTP '+r.status+'). '+(detail(data)||'Refresh before trying again.'));
 return data as T;
}
/** Only two deterministic writes can enter here. A retry writes the same bytes to the same staged key,
 * or rebuilds the same sealed group. Attachment, cancellation, and session creation never enter. */
export async function confirmStageWrite(url:string,id:string,kind:'part'|'group',index:number,part?:Blob,pause:TransferPause=sleep){
 const label=(kind==='part'?'Document part ':'Document group ')+(index+1);
 const path=kind==='part'?url+(url.includes('?')?'&':'?')+new URLSearchParams({stage:id,part:String(index)}):url;
 const init:RequestInit=kind==='part'?{method:'POST',body:part}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'seal',id,group:index})};
 for(let i=0;i<retries;i++){
  let res:Response;
  try{res=await timedFetch(path,init,kind==='part'?60000:90000);}
  catch(e){if(i===retries-1)throw Error(label+' could not be confirmed after '+retries+' attempts (no HTTP response). '+(e instanceof Error?e.message:''));await pause(backoff(i,null));continue;}
  const data=await body(res);
  if(res.ok&&data&&typeof data==='object'&&(data as Record<string,unknown>)[kind]===index)return;
  const retryable=res.ok||isTransient(res.status); // Truncated or mismatched 2xx JSON is not proof of saving the part.
  if(!retryable||i===retries-1)throw Error(label+' could not be confirmed (HTTP '+res.status+'). '+(detail(data)||'The server did not confirm this '+kind+'.'));
  await pause(backoff(i,res.headers.get('Retry-After')));
 }
}
