'use client';
import {useRef,useState} from 'react';
import {FolderInput,ArchiveRestore,FileCheck2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {openTransfer,resolveTarget,fileSource,type TransferPacket} from '@/lib/source-files/transfer-client';
import './source-files.css';
type Row={state:'saved'|'reference'|'pending'|'error'|'checking';label:string};
export default function DriveTransferButton({onFiled}:{onFiled?:()=>void}={}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[pack,setPack]=useState<TransferPacket>(),[err,setErr]=useState(''),[rows,setRows]=useState<Record<string,Row>>({});const running=useRef(false),input=useRef<HTMLInputElement>(null),changed=useRef(false);
 function put(k:string,state:Row['state'],label:string){setRows(r=>({...r,[k]:{state,label}}));}
 function close(){if(!running.current){setOpen(false);if(changed.current){changed.current=false;onFiled?.();window.dispatchEvent(new Event('command-source-files-changed'));}}}
 async function choose(f?:File){if(!f||running.current)return;running.current=true;setBusy(true);setErr('');try{if(f.size>145*1048576)throw Error('Choose a reviewed packet under 145 MB.');setPack(openTransfer(new Uint8Array(await f.arrayBuffer())));setRows({});}catch(e){setPack(undefined);setErr((e as Error).message);}finally{running.current=false;setBusy(false);}}
 async function process(save:boolean){if(!pack||running.current)return;const p=pack;running.current=true;setBusy(true);setErr('');if(save)changed.current=true;
  const ids=new Map<string,string>();async function parallel<T>(items:T[],fn:(item:T)=>Promise<void>,limit=3){let i=0;await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{while(i<items.length)await fn(items[i++]);}));}
  try{
   await parallel(p.targets,async t=>{const k='t:'+t.key;try{put(k,'checking','Matching Destination');const id=await resolveTarget(t,save,s=>put(k,'checking',s));if(id)ids.set(t.key,id);put(k,id?'saved':'pending',id?'Record Confirmed':'Record Not Yet Filed');}catch(e){put(k,'error',(e as Error).message);}},2);
   await parallel(p.files,async f=>{const k=f.driveId;if(f.targetFrom&&!ids.has(f.targetFrom)){put(k,'pending','Waiting for Verified Destination');return;}
    try{put(k,'checking','Checking Source');const b=f.localName?new Blob([new Uint8Array(p.data[f.localName])],{type:f.mime}):undefined;const state=await fileSource(f,f.targetFrom?ids.get(f.targetFrom):f.targetId,b,save,s=>put(k,'checking',/^\d+%$/.test(s)?'Transferring · '+s:s));
    put(k,state==='confirmed'?'saved':state==='reference'?'reference':'pending',state==='confirmed'?(f.representation==='Google Export'?'Export Verified':'Original Verified'):state==='reference'?'Reference Only · Manual Upload Pending':'Original Not Yet Filed');}catch(e){put(k,'error',(e as Error).message);}
   },3);
  }finally{running.current=false;setBusy(false);}
 }
 const totals={records:pack?.targets.filter(t=>rows['t:'+t.key]?.state==='saved').length||0,saved:pack?.files.filter(f=>rows[f.driveId]?.state==='saved').length||0,refs:pack?.files.filter(f=>rows[f.driveId]?.state==='reference').length||0,errors:Object.values(rows).filter(r=>r.state==='error').length};
 return <><button className="source-action" type="button" onClick={()=>setOpen(true)}><FolderInput size={15}/>Import Drive Records</button><Dialog open={open} onOpenChange={v=>{if(!v)close();}}><DialogContent className="source-transfer" showCloseButton={!busy}><header><span>Restricted Records</span><DialogTitle>Import Drive Records</DialogTitle><DialogDescription>File reviewed records in their assigned workspace. Originals keep their source folder, fingerprint, and filing history.</DialogDescription></header>
 <input hidden type="file" ref={input} accept=".zip" aria-label="Reviewed Drive Transfer ZIP" onChange={e=>{const f=e.target.files?.[0];e.target.value='';void choose(f);}}/><button className="source-choose" type="button" disabled={busy} onClick={()=>input.current?.click()}><ArchiveRestore size={20}/>{busy?'Transfer in Progress':pack?'Choose Another Packet':'Choose Transfer Packet'}</button>
 {pack&&<><p><b>{pack.targets.length} Destination Records · {pack.files.length} Source Files</b></p><div className="source-counts" role="status"><FileCheck2 size={20}/><b>{totals.records} Records Confirmed · {totals.saved} Files Verified · {totals.refs} Reference Only · {totals.errors} Errors</b></div>
 <ul>{pack.targets.map(t=><li key={'t:'+t.key}><b>{String(t.record.title||t.record.sourceName||t.key)}</b><span>{rows['t:'+t.key]?.label||'Destination Record'}</span></li>)}{pack.files.map(f=><li key={f.driveId}><b>{f.name}</b><small>{f.path}</small><span>{rows[f.driveId]?.label||f.missingReason||f.category}</span></li>)}</ul>
 <footer><button className="source-action" disabled={busy} onClick={()=>void process(false)}>Check Receipts</button><button className="source-action primary" disabled={busy} onClick={()=>void process(true)}>File Reviewed Records</button><button className="source-action" disabled={busy} onClick={close}>Done</button></footer></>}{err&&<p role="alert">{err}</p>}</DialogContent></Dialog></>;
}
