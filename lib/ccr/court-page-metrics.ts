// Derived counts only. An immutable original is selected and access checked by the caller first.
// No file names, document bytes, case identifiers or people are stored in this private cache.
import {financeFiles} from '@/db/finance';
const cap=512,memory=new Map<string,number>(),prefix='ccr-court-derived/pdf-pages-v1/';
function keep(key:string,n:number){if(memory.size>=cap&&!memory.has(key))memory.delete(memory.keys().next().value!);memory.set(key,n);}
export async function verifiedPdfPages(sha:string,bytes:number,compute:()=>Promise<number>){
 if(!/^[a-f0-9]{64}$/.test(sha)||!Number.isSafeInteger(bytes)||bytes<=0)return compute();
 const k=sha+'-'+bytes;if(memory.has(k))return memory.get(k)!;
 try{const obj=await financeFiles().get(prefix+k);if(obj){const t=await obj.text(),n=Number(t);if(/^\d{1,6}$/.test(t)&&n>0&&Number.isSafeInteger(n)){keep(k,n);return n;}}}catch{/* A derived-cache outage must never prevent native verification. */}
 const count=await compute();if(Number.isSafeInteger(count)&&count>0){keep(k,count);try{await financeFiles().put(prefix+k,String(count),{httpMetadata:{contentType:'text/plain'}});}catch{/* Optional acceleration. */}}return count;
}
