'use client';
import {useEffect,useState} from 'react';
import {ShieldAlert} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {requestJson} from '@/lib/shared/client';
import type {SafetyAlert} from '@/lib/safety/model';
import TrespassRegister from './TrespassRegister';
import './safety.css';
export default function SafetyCenter(){
 const [data,setData]=useState<{alerts:SafetyAlert[];canView:boolean;canReview:boolean}>(),[error,setError]=useState(''),[open,setOpen]=useState(false),[caseId,setCaseId]=useState('');
 useEffect(()=>{let live=true;const load=()=>{if(document.visibilityState!=='visible')return;void requestJson<{alerts:SafetyAlert[];canView:boolean;canReview:boolean}>('/api/safety?mode=alerts').then(d=>{if(live){setData(d);setError('');}}).catch(()=>{if(live)setError('Safety alerts could not refresh. Check with Dispatch for current alerts.');});};const show=(e:Event)=>{setCaseId((e as CustomEvent).detail?.caseId||'');setOpen(true);};load();const timer=setInterval(load,20000);window.addEventListener('focus',load);window.addEventListener('safety-changed',load);window.addEventListener('open-safety',show);return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('safety-changed',load);window.removeEventListener('open-safety',show);};},[]);
 return <><div className={'safety-global '+(data?.alerts.length?'safety-global-active':'')}>
 <button className="safety-launch" onClick={()=>{setCaseId('');setOpen(true);}}><ShieldAlert size={18}/>{data?.alerts.length?data.alerts.length+' active safety alert'+(data.alerts.length===1?'':'s'):'Safety'}{!!data?.alerts.length&&<span>Review before assisting</span>}</button>{error&&<span role="status">{error}</span>}
 {!!data?.alerts.length&&<div role="alert" className="safety-global-items">{data.alerts.slice(0,2).map(a=><button key={a.id} onClick={()=>{setCaseId(a.caseId);setOpen(true);}}><b>{a.name}</b><span>{a.vehicle||a.accountName} · {a.reason}</span></button>)}{data.alerts.length>2&&<button onClick={()=>setOpen(true)}>View all {data.alerts.length} alerts</button>}</div>}
 </div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="safety-center-dialog"><DialogHeader><DialogTitle>Staff safety</DialogTitle><DialogDescription>Active alerts are shared with all employees. Case history is retained after review.</DialogDescription></DialogHeader>{data?.canView?<TrespassRegister initialCase={caseId}/>:<div className="safety-workspace">{data?.alerts.map(a=><article key={a.id} className="safety-active-card"><ShieldAlert/><div><h3>{a.name}</h3><p>{a.accountName} · {a.date}</p><p>{a.vehicle}</p><b>{a.reason}</b></div></article>)}{!data?.alerts.length&&<p>No active staff safety alerts.</p>}<p>Contact Dispatch for case details. An Account Manager or department head can acknowledge and clear an active alert.</p><Button onClick={()=>setOpen(false)}>Close</Button></div>}</DialogContent></Dialog></>;
}
