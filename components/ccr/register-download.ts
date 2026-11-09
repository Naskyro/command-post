import {timedFetch} from '@/lib/shared/client';
export async function exportEvidenceIndex(ids:string[]){
 const req=await timedFetch('/api/ccr/register/evidence-index',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids})},45000);
 if(!req.ok){let message='The evidence index could not be exported.';try{const data=await req.json() as {error?:unknown};if(typeof data.error==='string')message=data.error;}catch{}throw new Error(message);}
 if(!req.headers.get('content-type')?.includes('text/csv'))throw new Error('An evidence index was not returned. Refresh the register and try again.');
 const blob=await req.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='PTE-Confidential-Evidence-Index.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
