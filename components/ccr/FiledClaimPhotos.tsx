'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ChevronLeft,ChevronRight,Images,LockKeyhole,Mail,Search} from 'lucide-react';
import {auditDay} from '@/lib/shared/audit-format';
import {requestJson} from '@/lib/shared/client';
import {CasePhotoPreviews} from './DamagePreviews';
import DamageMailHistory from './DamageMailHistory';
import './filed-claim-photos.css';
type Claim={id:string;title:string;status:string;reportedOn?:string;photos:number};
type Page={rows:Claim[];total:number;nextScan?:number|null};
const PAGE=12,endpoint='/api/ccr/damage-intake/photo-previews',damage='/?module=Compliance%2C%20Claims%20%26%20Recovery&tab=damage';
export default function FiledClaimPhotos(){
 const [input,setInput]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[refresh,R]=useState(0),[page,P]=useState<Page>(),[error,E]=useState(''),[selected,S]=useState<Claim>(),[mail,M]=useState(false);
 const detail=useRef<HTMLHeadingElement>(null),cache=useRef<{query:string;refresh:number;rows:Claim[]}|undefined>(undefined);
 useEffect(()=>{let here=true;P(undefined);E('');const p=new URLSearchParams({directory:'1',offset:String(offset)});
 async function load(){if(!query)return requestJson<Page>(endpoint+'?'+p,undefined,45000);
  let all=cache.current;
  if(!all||all.query!==query||all.refresh!==refresh){const matches=new Map<string,Claim>();let scan=0;
   while(here){const segment=await requestJson<Page>(endpoint,{action:'directory',query,offset:0,scan},45000);for(const row of segment.rows)matches.set(row.id,row);if(segment.nextScan==null)break;if(!Number.isSafeInteger(segment.nextScan)||segment.nextScan<=scan)throw Error('The directory did not confirm the next search window.');scan=segment.nextScan;}
   all={query,refresh,rows:[...matches.values()]};if(here)cache.current=all;}
  return {rows:all.rows.slice(offset,offset+PAGE),total:all.rows.length};}
 load().then(data=>{if(here)P(data);}).catch(err=>{if(here)E(err instanceof Error?err.message:'The private claim directory could not be opened.');});return()=>{here=false;};},[offset,query,refresh]);
 useEffect(()=>{if(selected)detail.current?.focus();},[selected]);
 function search(e:FormEvent){e.preventDefault();const q=input.trim();if(q===query&&offset===0)R(x=>x+1);setQuery(q);setOffset(0);S(undefined);M(false);}
 function open(row:Claim){S(row);M(false);}
 function back(){S(undefined);M(false);const id=selected?.id;requestAnimationFrame(()=>{if(id)document.getElementById('fp-row-'+id)?.focus();});}
 return <main className="filed-photos"><header className="fp-head"><a href={damage}><ArrowLeft size={16}/> Damage Claims</a><span><LockKeyhole size={15}/>Restricted Case Records</span></header><div className="fp-inner">
 <div className="fp-title"><span className="fp-icon"><Images aria-hidden size={25}/></span><div><p>Compliance, Claims &amp; Recovery</p><h1>Claim Photos</h1></div></div>
 {!selected?<section aria-label="Claim Photo Directory"><form className="fp-search" onSubmit={search}><label htmlFor="photo-search">Find a Claim</label><div><input id="photo-search" type="search" value={input} maxLength={160} placeholder="Claim, reference, or vehicle" onChange={e=>setInput(e.target.value)}/><button type="submit"><Search size={16}/> Search</button></div></form>
 {error?<div className="fp-message" role="alert">{error} <button type="button" onClick={()=>R(x=>x+1)}>Retry</button></div>:!page?<p role="status">Loading Claim Directory…</p>:!page.rows.length?<div className="fp-message"><h2>{query?'No Matching Claims':'No Filed Claims'}</h2><p>{query?'Try a different claim name or vehicle reference.':'Reviewed claim records will appear here when filed.'}</p>{query&&<button type="button" onClick={()=>{setInput('');setQuery('');setOffset(0);}}>Clear Search</button>}</div>:<>
 <p className="fp-count" aria-live="polite">{offset+1}–{offset+page.rows.length} of {page.total} {page.total===1?'Claim':'Claims'}</p>
 <ul className="fp-list">{page.rows.map(row=><li key={row.id}><button id={'fp-row-'+row.id} type="button" onClick={()=>open(row)}><span className="fp-rowlead"><Images aria-hidden size={19}/></span><span><strong>{row.title}</strong><small>{row.reportedOn?auditDay(row.reportedOn)+' · ':''}{row.status}</small></span><span className="fp-badge">{row.photos} {row.photos===1?'Preview':'Previews'}</span><ChevronRight size={16} aria-hidden/></button></li>)}</ul>
 <nav className="fp-pager" aria-label="Claim Directory Pages"><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-PAGE))}><ChevronLeft size={15}/> Previous</button><button disabled={offset+page.rows.length>=page.total} onClick={()=>setOffset(offset+PAGE)}>Next <ChevronRight size={15}/></button></nav></>}</section>:
 <article className="fp-case"><button className="fp-back" onClick={back}><ArrowLeft size={15}/> Back to Results</button><h2 tabIndex={-1} ref={detail}>{selected.title}</h2><p className="fp-meta">{selected.status}{selected.reportedOn?' · Reported '+auditDay(selected.reportedOn):''}</p><CasePhotoPreviews key={selected.id} id={selected.id} version={refresh} initiallyOpen/><button className="fp-mail" type="button" aria-expanded={mail} onClick={()=>M(v=>!v)}><Mail size={16}/>{mail?'Hide Correspondence':'View Claim Correspondence'}</button>{mail&&<DamageMailHistory id={selected.id}/>}</article>}
 </div></main>;
}
