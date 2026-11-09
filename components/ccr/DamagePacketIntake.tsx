'use client';
import {useRef,useState} from 'react';
import {Archive,CheckCircle2,FileStack,LoaderCircle} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {readDamagePackage,verifyDamageBytes,uploadLimit,type DamagePackage} from '@/lib/ccr/damage-package';
import {fileDamage,damageReceipt} from '@/lib/ccr/damage-intake-client';
import './docket.css';
type Entry={label:string;ok?:boolean;files?:number;problem?:boolean};
export default function DamagePacketIntake({onComplete,onClose}:{onComplete:()=>void;onClose:()=>void}){
 const [pack,setPack]=useState<DamagePackage>(),[busy,setBusy]=useState(false),[entries,setEntries]=useState<Record<string,Entry>>({}),[error,setError]=useState('');const input=useRef<HTMLInputElement>(null),running=useRef(false),edited=useRef(false);
 function close(){if(!running.current){if(edited.current)onComplete();onClose();}}
 async function choose(f?:File){if(!f||running.current)return;running.current=true;setBusy(true);setError('');try{if(f.size>uploadLimit)throw Error('Choose a reviewed ZIP of 180 MB or less.');const parsed=readDamagePackage(new Uint8Array(await f.arrayBuffer()));await verifyDamageBytes(parsed);setPack(parsed);setEntries({});}catch(e){setPack(undefined);setError((e as Error).message);}finally{running.current=false;setBusy(false);}}
 function report(key:string,value:Entry){setEntries(a=>({...a,[key]:value}));}
 async function run(save:boolean){if(!pack||running.current)return;running.current=true;setBusy(true);setError('');const queue=pack.records.filter(c=>!save||!entries[c.threadId]?.ok);if(save)edited.current=true;
  try{let cursor=0;async function worker(){while(cursor<queue.length){const c=queue[cursor++],k=c.threadId;
   try{report(k,{label:'Checking Saved Record'});const s=save?await fileDamage(c,pack!.data,x=>report(k,{label:x})):await damageReceipt(c);
    report(k,{ok:s.complete,files:s.matched,label:s.complete?'Verified · '+s.matched+' of '+c.documents.length+' Originals':s.caseSaved?'Claim Saved · '+s.matched+' of '+c.documents.length+' Originals':'Not Yet Filed'});}
   catch(e){report(k,{problem:true,label:(e as Error).message});}
  }}await Promise.all(Array.from({length:Math.min(2,queue.length)},worker));}finally{running.current=false;setBusy(false);}
 }
 const done=Object.values(entries).filter(x=>x.ok).length,files=Object.values(entries).reduce((n,x)=>n+(x.files||0),0),total=pack?.records.reduce((n,x)=>n+x.documents.length,0)||0,all=!!pack&&done===pack.records.length;
 return <Dialog open onOpenChange={ok=>{if(!ok)close();}}><DialogContent className="ccr-jp-intake" showCloseButton={!busy}><header><span><Archive size={16}/>Damage Claims</span><DialogTitle>Import Support Claims</DialogTitle><DialogDescription>File reviewed cases from the support mailbox with their source messages and original evidence. A claim can be filed before its property is known.</DialogDescription></header>
 <input hidden ref={input} type="file" accept=".zip" aria-label="Reviewed Damage Claims ZIP" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void choose(f);}}/>
 {!pack?<><button type="button" className="ccr-jp-choose" disabled={busy} onClick={()=>input.current?.click()}><FileStack size={23}/><b>{busy?'Checking File Fingerprints…':'Choose Reviewed Claims'}</b><span>ZIP with records.json and source originals</span></button><details><summary>Packet Format</summary><p>Each record needs a support thread, reported date, factual summary and original message references. Include a basis for a confirmed status. List original evidence by its path, filename, document type and SHA-256 fingerprint.</p></details></>:<>
 <strong>{pack.records.length} Reviewed Claims · {total} Originals</strong>
 <p role="status">{done} of {pack.records.length} Claims Confirmed · {files} of {total} Originals Matched</p>
 <ul className="ccr-jp-list">{pack.records.map(c=><li key={c.threadId}><b>{c.title}</b><small>{c.reportedOn} · {c.status} · {c.references.length} Source Messages · {c.documents.length} Originals</small>{entries[c.threadId]&&<small data-ok={entries[c.threadId].ok} role={entries[c.threadId].problem?'alert':undefined}>{entries[c.threadId].label}</small>}</li>)}</ul>
 {busy&&<span role="status"><LoaderCircle size={15}/> Working…</span>}
 <footer><button type="button" className="cd-secondary" disabled={busy} onClick={close}>{all?'View Damage Claims':'Close'}</button><button type="button" className="cd-secondary" disabled={busy} onClick={()=>void run(false)}>Check Filing Receipts</button>{!all&&<button type="button" className="cd-primary" disabled={busy} onClick={()=>void run(true)}>File Reviewed Claims</button>}{all&&<CheckCircle2 aria-label="All claims confirmed" size={18}/>}</footer>
 </>}{error&&<p role="alert">{error}</p>}</DialogContent></Dialog>;
}
