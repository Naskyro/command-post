import {requestJson} from '@/lib/shared/client';
type Status={status:string;reason?:string};
/** Bulk requests share a single authenticating roster and docket read. Mutations are never
 * automatically repeated after an uncertain response; a separate saved-state receipt resolves it. */
export async function fileCourtGroups<I,R extends Status>(url:string,action:'preview'|'import'|'receipt',items:I[],onStart:(r:I)=>void,onResult:(r:I,out:R)=>void,onError:(r:I,reason:string)=>R,receiptSize=12){
 const groups=(list:I[],n:number)=>Array.from({length:Math.ceil(list.length/n)},(_,i)=>list.slice(i*n,(i+1)*n));
 const get=async(mode:typeof action,records:I[])=>{const reply=await requestJson<{results:R[]}>(url,{action:mode,records},120000);if(!Array.isArray(reply?.results)||reply.results.length!==records.length||reply.results.some(x=>!x||typeof x.status!=='string'))throw Error('The site returned an incomplete court receipt.');return reply.results;};
 // A single retry of a read is safe. Never replay a write after timeout or gateway error.
 const read=async(mode:'preview'|'receipt',group:I[])=>{try{return await get(mode,group);}catch(e){if(!/timeout|timed out|connection lost|unreadable|incomplete|could not be completed/i.test((e as Error).message))throw e;return get(mode,group);}};
 for(const group of groups(items,action==='receipt'?receiptSize:4)){onStart(group[0]);try{if(action==='import'){let base:R[]|undefined;try{base=await get(action,group);}catch{/* An uncertain commit always requires its own receipt. */}const check=await read('receipt',group);for(let i=0;i<group.length;i++)onResult(group[i],check[i].status==='confirmed'?check[i]:base?.[i]?.status==='review'?base[i]:check[i]);}else{const check=await read(action,group);for(let i=0;i<group.length;i++)onResult(group[i],check[i]);}}catch(e){for(const r of group)onResult(r,onError(r,(e as Error).message));}}
}
