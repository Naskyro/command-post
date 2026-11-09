'use client';
import {useState} from 'react';
import {Paperclip} from 'lucide-react';
import {unzipSync} from 'fflate';
import {requestJson,timedFetch} from '@/lib/shared/client';
import {stageDocument} from '@/lib/ccr/document-stage-client';
import {evidenceItem,tdlrEvidenceFormat,tdlrEvidenceStageQuery,tdlrDirectMax,type TdlrEvidenceItem} from '@/lib/ccr/tdlr-evidence';
const api='/api/ccr/register/mail-evidence';
type Item=TdlrEvidenceItem&{data:Uint8Array<ArrayBuffer>};
async function packet(file:File):Promise<Item[]>{
 const max=24*1048576;if(!file.size||file.size>96*1048576)throw Error('Choose a reviewed ZIP under 96 MB.');
 let size=0;const seen=new Set<string>();
 const data=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter(e){if(!(/^(manifest\.json|pdf\/[a-f0-9]{64}\.pdf)$/.test(e.name))||seen.has(e.name)||seen.size>=61||e.originalSize>(e.name==='manifest.json'?200000:max)||(size+=e.originalSize)>100*1048576)throw Error('The archive contains an unexpected, repeated, or oversized entry.');seen.add(e.name);return true;}});
 const m=JSON.parse(new TextDecoder().decode(data['manifest.json']||new Uint8Array()));if(m.format!==tdlrEvidenceFormat||!Array.isArray(m.files)||!m.files.length||m.files.length>60)throw Error('Choose a reviewed TDLR evidence packet.');
 const hits=new Set<string>();const out:Item[]=[];
 for(const input of m.files){const f=evidenceItem(input),path='pdf/'+f.sha256+'.pdf',b=data[path];if(!b||b.length!==Number(f.size)||hits.has(path))throw Error('A listed PDF is missing, repeated, or has changed.');hits.add(path);const bytes=new Uint8Array(b),sum=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));if(Array.from(sum,n=>n.toString(16).padStart(2,'0')).join('')!==f.sha256)throw Error('Incorrect PDF fingerprint: '+f.name);out.push({...f,data:bytes});}
 if(seen.size!==out.length+1)throw Error('Remove documents not listed in the reviewed manifest.');return out;
}
export default function TdlrEvidenceImporter(){
 const [open,O]=useState(false),[items,I]=useState<Item[]>([]),[busy,B]=useState(false),[err,E]=useState(''),[state,S]=useState<Record<string,string>>({});
 const status=(key:string,value:string)=>S(old=>({...old,[key]:value}));
 async function run(doFile:boolean){if(busy)return;B(true);E('');try{for(const row of items){const {data,...entry}=row,k=entry.sha256;try{
  status(k,'Checking Source Message…');
  const read=async(action:'receipt'|'verify')=>{for(let attempt=0;;attempt++){try{return await requestJson<{id:string;sha256?:string;verified:boolean}>(api,{action,entry},90000);}catch(e){if(attempt>=2||!/unreadable|timed out|connection lost|unavailable/i.test((e as Error).message))throw e;status(k,'Rechecking Saved Source…');await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));}}};
  let receipt=await read('receipt');
  if(!receipt.sha256&&!doFile){status(k,'Ready to File');continue;}
  if(!receipt.sha256){try{const file=new File([data],entry.name,{type:'application/pdf'});
   if(file.size<=tdlrDirectMax){const form=new FormData();form.set('entry',JSON.stringify(entry));form.set('file',file);status(k,'Uploading PDF…');const response=await timedFetch(api,{method:'POST',body:form},90000);const saved=await response.json().catch(()=>null) as {id?:string;error?:string}|null;if(!response.ok||saved?.id!==receipt.id)throw Error(saved?.error||'The site did not confirm the PDF upload (HTTP '+response.status+').');}
   else await stageDocument(api+tdlrEvidenceStageQuery,file,{...entry,id:receipt.id},(n,t)=>status(k,'Uploading · '+Math.floor(n*100/t)+'%'));}catch(e){const maybe=await read('receipt');if(maybe.sha256!==k)throw e;}}
  status(k,'Verifying Saved PDF…');receipt=await read('verify');if(!receipt.verified||receipt.sha256!==k)throw Error('Saved file could not be verified.');status(k,'Verified on This Complaint');
 }catch(e){status(k,(e as Error).message||'Could not verify this document.');}}}finally{B(false);}}
 if(!open)return <button type="button" className="ccrr-button" onClick={()=>O(true)}><Paperclip size={15}/> File TDLR Evidence</button>;
 return <div className="regmail-mask"><section className="regmail-dialog" role="dialog" aria-modal="true" aria-label="File TDLR Evidence"><header><h2>File TDLR Evidence</h2><button className="ccrr-button" disabled={busy} onClick={()=>O(false)}>Close</button></header>
 <p>Attach reviewed PDFs to an existing complaint and its saved source message.</p><label>Reviewed Evidence ZIP<input type="file" accept=".zip" disabled={busy} onChange={async e=>{const f=e.currentTarget.files?.[0];I([]);S({});E('');if(!f)return;B(true);try{I(await packet(f));}catch(ex){E((ex as Error).message);}finally{B(false);}}}/></label>
 {err&&<p role="alert">{err}</p>}{items.length>0&&<><p role="status">{Object.values(state).filter(v=>v==='Verified on This Complaint').length} of {items.length} PDFs Verified</p><div className="regmail-tools"><button className="ccrr-button" disabled={busy} onClick={()=>void run(false)}>Check Saved Files</button><button className="ccrr-primary" disabled={busy} onClick={()=>void run(true)}>File Reviewed PDFs</button></div><table><thead><tr><th>Agency Case</th><th>Document</th><th>Filing Status</th></tr></thead><tbody>{items.map(f=><tr key={f.sha256}><td>{f.reference}</td><td>{f.originalName}<br/><small>{f.kind} · {f.medium}</small></td><td>{state[f.sha256]||'Fingerprint Checked'}</td></tr>)}</tbody></table></>}</section></div>;
}
