'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,RefreshCw} from 'lucide-react';
import type {DriverClaimReference} from '@/lib/hr/driver-claims';
import {requestJson} from '@/lib/shared/client';
import {Button,Card,Tag,dateLabel} from './ui';

type Props={personId:string;canReadClaims:boolean;canOpenAccidentReports:boolean;onOpen?:(key:string)=>void};
export default function PersonnelDamageClaims({personId,canReadClaims,canOpenAccidentReports,onOpen}:Props){
 const [rows,setRows]=useState<DriverClaimReference[]>(),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let current=true;setRows(undefined);setError('');if(canReadClaims)requestJson<{rows:DriverClaimReference[]}>('/api/hr/damage-claims?'+new URLSearchParams({personId})).then(result=>{if(current)setRows(result.rows);}).catch(failure=>{if(current)setError(failure.message);});return()=>{current=false;};},[personId,canReadClaims,refresh]);
 return <>
  {canReadClaims&&<Card title="Linked Damage Claims" description="Claim references remain in the personnel file after employment ends." action={<Button onClick={()=>setRefresh(value=>value+1)}><RefreshCw size={14}/>Refresh</Button>}>
   {error&&<p className="hr2-error" role="alert">{error}</p>}{!rows&&!error&&<p>Loading linked claims…</p>}
   {rows?.map(row=><article key={row.key} className="hr2-record"><div><b>{row.reference}</b><small>{row.source} · {dateLabel(row.date)||'Date Not Recorded'}</small></div><Tag>{row.status}</Tag>{row.canOpen&&onOpen&&<Button onClick={()=>onOpen(row.key)}>Open Claim <ArrowUpRight size={14}/></Button>}</article>)}
   {rows&&!rows.length&&<p className="hr2-help">No damage claims are linked to this personnel record.</p>}
   {rows?.length&&!rows.some(row=>row.canOpen)?<p className="hr2-help">Opening the full claim requires access to Damage Claims in Compliance, Claims &amp; Recovery.</p>:null}
  </Card>}
  {canOpenAccidentReports&&<Card title="Accident / Injury Reports"><p>Open the separate report area to review or submit an accident follow-up.</p><a className="hr2-button" href={'/people/accident-followups?'+new URLSearchParams({driverId:personId})}>Open Accident / Injury Reports <ArrowUpRight size={14}/></a></Card>}
 </>;
}
