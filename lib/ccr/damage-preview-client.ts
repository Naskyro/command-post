import {timedFetch} from '@/lib/shared/client';
import {previewFormat,type PreviewItem,type PreviewReceipt} from './damage-preview-model';
export const previewEndpoint='/api/ccr/damage-intake/photo-previews';
class HTTPProblem extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
const transient=(s:number)=>s===0||s===408||s===425||s===429||s>=500&&s<600;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function request(items:PreviewItem[],save:boolean){
 const payload={action:save?'file':'check',packet:{format:previewFormat,items:save?items:items.map(({jpegBase64,...meta})=>meta)}};
 for(let i=0;;i++){let status=0;try{const r=await timedFetch(previewEndpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)},60000);status=r.status;const x=await r.json().catch(()=>null) as (PreviewReceipt&{error?:string})|null;
  if(!r.ok)throw new HTTPProblem(status,(x?.error||'Preview Service Unavailable')+' (HTTP '+status+')');
  if(x?.total!==items.length||![x.confirmed,x.missing,x.awaitingIndex].every(n=>Number.isSafeInteger(n)&&n>=0)||x.total!==x.confirmed+x.missing+x.awaitingIndex)throw new HTTPProblem(0,'Preview Receipt Unverified.');
  return x as PreviewReceipt;
 }catch(e){const p=e instanceof HTTPProblem?e:new HTTPProblem(0,'No response received.');if(save||i>=2||!transient(p.status))throw p;await pause(400*(2**i));}}
}
export async function checkOrFilePreviews(items:PreviewItem[],save:boolean,progress:(s:string)=>void){
 progress('Checking Stored Previews');let state=await request(items,false);if(!save||state.missing===0)return state;
 for(let i=0;i<3;i++){progress(i?'Retrying Missing Previews':'Filing Private Previews');try{await request(items,true);}catch(e){if(!(e instanceof HTTPProblem)||!transient(e.status))throw e;}
  progress('Verifying Saved Bytes');state=await request(items,false);if(!state.missing||i===2)return state;await pause(450*2**i);
 }return state;
}
