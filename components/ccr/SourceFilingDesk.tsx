'use client';
import {lazy,Suspense,useCallback,useEffect,useState} from 'react';
import SourceFileShelf from '@/components/shared/SourceFileShelf';
import {requestJson} from '@/lib/shared/client';
import type {DeskGrants} from '@/lib/ccr/source-desk-server';
import type {Matter} from '@/lib/ccr/docket-model';
import {auditDay,auditStamp} from '@/lib/shared/audit-format';
import './source-desk.css';
const Counsel=lazy(()=>import('./CourtCounsel').then(m=>({default:m.CourtCounsel})));
const endpoint='/api/ccr/source-desk',docketURL='/?module=Compliance%2C%20Claims%20%26%20Recovery&tab=hearings';
const workspaceURL=(tab:string)=>'/?module=Compliance%2C%20Claims%20%26%20Recovery&tab='+tab;
type Mini=Pick<Matter,'id'|'title'|'courtName'|'number'|'status'>;
function CaseInspector({counsel,counselEdit}:{counsel:boolean;counselEdit:boolean}){
 const [num,N]=useState(''),[found,F]=useState<Mini[]>(),[record,R]=useState<Matter>(),[err,E]=useState(''),[busy,B]=useState(false);
 async function show(id:string){B(true);E('');try{R((await requestJson<{record:Matter}>(endpoint+'?'+new URLSearchParams({id}),undefined,90000)).record);}catch(e){E((e as Error).message);}finally{B(false)}}
 async function search(e:React.FormEvent){e.preventDefault();B(true);F(undefined);R(undefined);E('');try{const {rows,record:match}=await requestJson<{rows:Mini[];record?:Matter}>(endpoint+'?'+new URLSearchParams({number:num}),undefined,90000);F(rows);if(match)R(match);else if(rows.length===1)await show(rows[0].id);}catch(e){E((e as Error).message);}finally{B(false)}}
 const out=record?.statements.findLast(s=>s.outcome);
 return <div><form onSubmit={search}><label>Exact Cause Number<input type="search" value={num} onChange={e=>N(e.target.value)} required minLength={3} maxLength={100} placeholder="Enter a Saved Cause Number"/></label><button disabled={busy}>{busy?'Checking…':'Find Court Case'}</button></form>{err&&<p role="alert">{err}</p>}{found?.length===0&&<p>No court case matches this number.</p>}{!!found?.length&&found.length>1&&<div>{found.map(m=><button key={m.id} onClick={()=>void show(m.id)}>{m.courtName||'Court Not Recorded'} · {m.title}</button>)}</div>}{record&&<section className="source-inspection"><h3>{record.title}</h3><p>{record.number} · {record.courtName||'Court Not Recorded'} · {record.status}</p>{out?.outcome&&<p>{out.outcome.result} · {auditDay(out.outcome.on)} · {out.text}</p>}<p>{(record.files||[]).length} Documents · {(record.hearingFacts||[]).length} Hearing Facts · {record.accountId?'Property Linked':'No Property Linked'}</p><small>Last Updated {auditStamp(record.updatedAt)} · {record.updatedBy}</small><details><summary>Filed Court Documents</summary>{(record.files||[]).map(d=><p key={d.id}><a href={'/api/ccr/docket/file?'+new URLSearchParams({id:record.id,file:d.id})}>{d.name}</a> · {d.documentType}</p>)}</details>{counsel&&<Suspense fallback="Loading counsel tools…"><Counsel m={record} editGranted={counselEdit}/></Suspense>}</section>}</div>;
}
export default function SourceFilingDesk(){
 const [g,G]=useState<DeskGrants>(),[loading,L]=useState(true),[err,E]=useState('');const check=useCallback(async()=>{L(true);E('');try{G(await requestJson<DeskGrants>(endpoint,undefined,90000));}catch(e){G(undefined);E((e as Error).message);}finally{L(false)}},[]);
 useEffect(()=>{void check();},[check]);
 return <main className="source-desk"><header><a href="/">Command Home</a><span>Compliance, Claims &amp; Recovery</span></header><div className="source-desk-title"><span>Private Filing Workspace</span><h1>Source Filing Desk</h1>{g&&<p>Signed in as {g.name}.</p>}</div>
 {loading&&<p role="status">Checking Your Access…</p>}{err&&<div role="alert"><p>{err}</p><button onClick={()=>void check()}>Retry Access Check</button> <a href="/command-access/sign-in">Sign In to Command</a></div>}
 {g&&<>{g.hearings&&<section><h2>Court Docket</h2><p>Find a saved case to check its outcome, evidence and filing history. Add new cases, documents and updates in Court Docket.</p><CaseInspector counsel={g.counsel} counselEdit={g.counselEdit}/><div className="source-desk-tools"><a href={docketURL}>Open Full Court Docket</a></div></section>}
 {g.tdlr&&<section><h2>TDLR Complaints</h2><p>Open a complaint to add an update or attach correspondence. Create a new complaint when a new matter arrives.</p><a href={workspaceURL('tdlr')}>Open TDLR Complaints</a></section>}
 {g.damage&&<section><h2>Damage Claims</h2><p>Open a claim to update its details, add a case note or attach new evidence.</p><div className="source-desk-tools"><a href={workspaceURL('damage')}>Open Damage Claims</a><a href="/ccr/claim-photos">Browse Filed Claim Photos</a></div></section>}
 {g.drive&&<section><h2>Original Documents</h2><p>Browse documents already filed with each workspace. Attach new evidence from the relevant case.</p>{g.hearings&&<SourceFileShelf scope="hearings" title="Court Documents"/>}{g.tdlr&&<SourceFileShelf scope="tdlr" title="TDLR Documents"/>}{g.damage&&<SourceFileShelf scope="damage" title="Damage Claim Documents"/>}</section>}{!g.hearings&&!g.damage&&!g.tdlr&&!g.drive&&<p>Your account does not have a source filing permission. Open the CCR module to view your assigned records.</p>}</>}</main>;
}
