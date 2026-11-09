'use client';
import {useEffect,useState} from 'react';
import {Mail} from 'lucide-react';
import {requestJson} from '@/lib/shared/client';
import {auditStamp} from '@/lib/shared/audit-format';
import {supportEmailUrl} from '@/lib/ccr/support-email';
import type {HistoricalMessage} from '@/lib/ccr/damage-correspondence';
const path='/api/ccr/damage-intake/correspondence?id=';
export default function DamageMailHistory({id}:{id:string}){
 const [rows,setRows]=useState<HistoricalMessage[]>([]),[err,setErr]=useState(''),[busy,setBusy]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true;setBusy(true);setRows([]);setErr('');requestJson<{messages:HistoricalMessage[]}>(path+encodeURIComponent(id),undefined,35000).then(d=>{if(live)setRows(d.messages);}).catch(e=>{if(live)setErr(e.message);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false};},[id,retry]);
 return <section className="ccrc-block"><h3><Mail size={17}/>Claim Correspondence</h3>{busy?<p role="status">Loading Messages…</p>:err?<p role="alert">{err} <button type="button" className="ccrc-btn" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:rows.length?<><p>{rows.length} Source Messages · Earliest First</p><ol className="ccrc-events">{rows.map(m=><li key={m.messageId}><div><strong>{m.direction}</strong> · {m.senderLabel===m.direction?'':m.senderLabel+' · '}{auditStamp(m.sentAt)}</div><details open={rows.length===1||undefined}><summary>{m.subject}</summary>{m.body&&<p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p>}{m.omissions.length>0&&<small>{m.omissions.join(' · ')}</small>}<p><a href={supportEmailUrl(m.messageId)} target="_blank" rel="noopener noreferrer">Open Source Email</a></p></details></li>)}</ol></>:<p>No reviewed message text has been filed for this claim. Source notes and documents are listed below.</p>}</section>;
}
