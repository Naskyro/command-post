'use client';
import {useEffect,useState} from 'react';
import {Download,FolderLock,ChevronDown,ChevronRight,Search,ExternalLink,RefreshCw} from 'lucide-react';
import {timedFetch} from '@/lib/shared/client';
import {auditStamp} from '@/lib/shared/audit-format';
import type {SourceScope,SourceEntry} from '@/lib/source-files/model';
import './source-files.css';
export default function SourceFileShelf({scope,targetId,title}:{scope:SourceScope;targetId?:string;title?:string}){
 const [open,O]=useState(false),[list,L]=useState<SourceEntry[]>(),[error,E]=useState(''),[denied,D]=useState(false),[query,Q]=useState(''),[refresh,R]=useState(0);
 useEffect(()=>{const f=()=>R(n=>n+1);window.addEventListener('command-source-files-changed',f);return()=>window.removeEventListener('command-source-files-changed',f);},[]);
 useEffect(()=>{let ok=true;D(false);L(undefined);E('');if(open){const p=new URLSearchParams({scope});if(targetId)p.set('targetId',targetId);timedFetch('/api/source-files?'+p).then(async r=>{if(r.status===403){if(ok)D(true);return;}if(!r.ok)throw Error('The source documents could not be loaded.');const v=await r.json() as {files:SourceEntry[]};if(!Array.isArray(v.files))throw Error('Could not verify source documents.');if(ok)L(v.files);}).catch(e=>{if(ok)E(e.message);});}return()=>{ok=false;};},[open,scope,targetId,refresh]);
 const name=title||(targetId?'Archived Source Documents':'Drive Source Archive'),filtered=(list||[]).filter(x=>[x.name,x.path,x.category,x.reason].some(t=>t?.toLowerCase().includes(query.toLowerCase())));
 return <section className="source-shelf"><button type="button" className="source-shelf-toggle" aria-expanded={open} onClick={()=>O(!open)}><FolderLock size={17}/><strong>{name}</strong>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>{open&&<div className="source-shelf-body">{denied?<p>Restricted to authorized executive records staff.</p>:error?<p role="alert">{error} <button type="button" className="source-action" onClick={()=>R(n=>n+1)}><RefreshCw size={14}/>Retry</button></p>:!list?<p role="status">Loading documents…</p>:<><div className="source-shelf-info"><span>{list.filter(x=>!x.state).length} Files on Record · {list.filter(x=>x.state).length} Pending Manual Upload</span><label><Search size={15}/><input type="search" placeholder="Search Source Files" aria-label="Search Source Files" value={query} onChange={e=>Q(e.target.value)}/></label></div><ul>{filtered.map(x=><li key={x.id}><div><b>{x.name}</b><small>{x.path}</small><small>{x.category} · {x.representation} · {auditStamp(x.filedAt)} · {x.filedBy}</small>{x.reason&&<p>{x.reason}</p>}</div>{x.state?<a href={'https://drive.google.com/open?id='+encodeURIComponent(x.driveId)} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Source Only</a>:<a download href={'/api/source-files?file='+encodeURIComponent(x.id)+'&version='+x.version}><Download size={15}/>Download</a>}</li>)}</ul>{!filtered.length&&<p>{list.length?'No matching documents.':'No archived documents have been filed here.'}</p>}</>}</div>}</section>;
}

export {SourceFileShelf};
