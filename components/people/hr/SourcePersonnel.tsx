'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight,ChevronRight,FolderArchive,ShieldCheck} from 'lucide-react';
import {requestJson} from '@/lib/shared/client';
import {auditDay} from '@/lib/shared/audit-format';
import {Card,Button} from './ui';
import {SourceFileShelf} from '@/components/shared/SourceFileShelf';

type License={type:string;agency?:string;number?:string;issuedOn?:string;expiresOn?:string;registerId?:string;asRecorded?:string;sourcePage?:number};
type Entry={name:string;sourceRosterStatus:string;filedAt:string;credentials:License[]};
type Retained={id:string;name:string;sourceRosterStatus:string;credentialCount:number};

export function PersonnelLicenses({personId,onOpen}:{personId:string;onOpen?:(id:string)=>void}){
 const [result,setResult]=useState<{entries:Entry[]}>(),[error,setError]=useState(''),[serial,retry]=useState(0);
 useEffect(()=>{let alive=true;setResult(undefined);setError('');void requestJson<{entries:Entry[]}>('/api/source-records/hr?person='+encodeURIComponent(personId)).then(r=>{if(alive)setResult(r)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[personId,serial]);
 const rows=result?.entries.flatMap(e=>e.credentials)||[];
 return <Card title="Documented Licenses">{error?<p role="alert">{error} <Button onClick={()=>retry(n=>n+1)}>Retry</Button></p>:!result?<p role="status">Loading license records…</p>:!rows.length?<p>No license has been indexed from this person’s source records.</p>:<><p>Dates and statuses come from historical records. They do not establish current licensing authority.</p><ul className="hr-source-licenses">{rows.map((c,i)=><li key={i}><div><b><ShieldCheck size={15}/>{c.type}</b>{c.agency&&<span>{c.agency}</span>}</div><dl>{c.number&&<div><dt>License Number</dt><dd>{c.number}</dd></div>}{c.issuedOn&&<div><dt>Issued</dt><dd>{auditDay(c.issuedOn)}</dd></div>}<div><dt>Expiration</dt><dd>{c.expiresOn?auditDay(c.expiresOn):'Not Recorded'}</dd></div>{c.sourcePage&&<div><dt>Source Page</dt><dd>{c.sourcePage}</dd></div>}</dl>{c.asRecorded&&<small>Status on the Source: {c.asRecorded}</small>}{c.registerId&&onOpen&&<Button onClick={()=>onOpen(c.registerId!)}>Open License Record <ArrowUpRight size={13}/></Button>}</li>)}</ul></>}</Card>;
}
export function HistoricalPersonnel(){
 const [open,setOpen]=useState(false),[people,setPeople]=useState<Retained[]>(),[person,setPerson]=useState<Retained>(),[error,setError]=useState(''),[query,setQuery]=useState(''),[rev,retry]=useState(0);
 useEffect(()=>{if(!open)return;let alive=true;setError('');setPeople(undefined);void requestJson<{people:Retained[]}>('/api/source-records/hr?history=1').then(r=>{if(alive)setPeople(r.people.sort((a,b)=>a.name.localeCompare(b.name)))}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[open,rev]);
 return <Card title="Historical Personnel Files"><p>Source folders awaiting a verified match to a personnel file. Folder labels describe the source roster; these people have no account or access created by this import.</p><Button onClick={()=>setOpen(o=>!o)}><FolderArchive size={15}/>{open?'Close Historical Directory':'Open Historical Directory'}</Button>{open&&(error?<p role="alert">{error} <Button onClick={()=>retry(n=>n+1)}>Retry</Button></p>:!people?<p role="status">Loading historical files…</p>:<><label>Find a Historical File<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by Name"/></label>{!people.length&&<p>No unmatched personnel folders on file.</p>}<ul className="hr-source-list">{people.filter(p=>p.name.toLowerCase().includes(query.trim().toLowerCase())).map(p=><li key={p.id}><button aria-pressed={p.id===person?.id} type="button" onClick={()=>setPerson(p)}><b>{p.name}</b><span>{p.sourceRosterStatus} Source Folder</span><ChevronRight size={14}/></button></li>)}</ul>{person&&<section key={person.id}><h3>{person.name}</h3><PersonnelLicenses personId={person.id}/><SourceFileShelf scope="hr" targetId={person.id}/></section>}</>)}</Card>;
}
