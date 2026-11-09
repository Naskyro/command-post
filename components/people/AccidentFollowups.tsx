'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {ArrowLeft, RefreshCw} from 'lucide-react';
import AccidentReportsPanel from '@/components/ccr/AccidentReportsPanel';
import {DelegatedAccessBanner,DelegatedAccessTabSync,returnToAdminUrl,type DelegatedView} from '@/components/admin/DelegatedAccessBanner';
import {DelegatedWorkspace} from '@/components/admin/DelegatedWorkspace';
import {lockDelegatedClient, timedFetch, delegatedUrl} from '@/lib/shared/client';
import {auditDay} from '@/lib/shared/audit-format';
import type {MedicalCaseSummary} from '@/lib/hr/accident-reports';
import type {Viewer} from '@/lib/finance/model';
import '@/components/ccr/accident-reports.css';

function keyOf(record:MedicalCaseSummary){return `${record.claimKey}:${record.driverId}`;}
function searchText(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();}
function nextCheckIn(record:MedicalCaseSummary){
 const outstanding=record.schedule.filter(item=>item.status!=='Completed');
 return outstanding.find(item=>item.canReport)||outstanding[0];
}

export default function AccidentFollowups(){
 const [session,setSession]=useState<{viewer?:Viewer;delegation?:DelegatedView;error?:string}|null>(null);
 const identity=useRef<string|null>(null);
 useEffect(()=>{
  let closed=false,sequence=0;
  const verify=async()=>{
   const attempt=++sequence;
   try{
    const response=await timedFetch('/api/session',{},30000);
    const value=await response.json() as {viewer?:Viewer;delegation?:DelegatedView;error?:string};
    if(closed||attempt!==sequence)return;
    const delegation=value.delegation;
    if(delegation)lockDelegatedClient();
    const key=delegation?.state==='active'?'view:'+delegation.subjectId:delegation?.state==='ended'?'ended':response.ok&&value.viewer?'own:'+value.viewer.person:'unverified';
    // A fresh document is required at every identity boundary. A failed or
    // expired employee session never renders the operator's own records here.
    if(identity.current!==null&&identity.current!==key){window.location.replace(delegatedUrl(key.startsWith('own:')?returnToAdminUrl:window.location.pathname+window.location.search));return;}
    identity.current=key;
    if(delegation?.state==='ended'){setSession({delegation});return;}
    if(!response.ok||!value.viewer||delegation?.state==='active'&&(!value.viewer.delegatedReadOnly||value.viewer.person!==delegation.subjectId)){
     setSession({delegation,error:value.error||'The account could not be verified. Refresh to try again.'});return;
    }
    setSession({viewer:value.viewer,delegation});
   }catch(e){if(!closed&&attempt===sequence)setSession(current=>({delegation:current?.delegation,error:e instanceof Error?e.message:'The account could not be verified. Refresh to try again.'}));}
  };
  void verify();const refresh=()=>{if(document.visibilityState==='visible')void verify();};document.addEventListener('visibilitychange',refresh);
  return()=>{closed=true;document.removeEventListener('visibilitychange',refresh);};
 },[]);
 const delegation=session?.delegation;
 if(!session)return <main className="accident-followups" aria-busy="true"><p role="status">Verifying your account…</p></main>;
 if(delegation?.state==='ended')return <><DelegatedAccessTabSync/><DelegatedAccessBanner delegation={delegation}/><main className="accident-followups"><h1>Employee View Has Ended</h1><p>Return to your account to continue.</p></main></>;
 if(!session.viewer)return <><DelegatedAccessTabSync/>{delegation&&<DelegatedAccessBanner delegation={delegation}/>}<main className="accident-followups"><h1>Account Verification Required</h1><p role="alert">{session.error}</p><button type="button" className="ar-button" onClick={()=>window.location.reload()}>Refresh Page</button>{!delegation&&<Link className="af-back" href="/" prefetch={false}>Back to Command</Link>}</main></>;
 return <><DelegatedAccessTabSync/>{delegation?.state==='active'?<><DelegatedAccessBanner delegation={delegation}/><DelegatedWorkspace module="Accident Follow-Ups"><FollowupRecords key={session.viewer.person} readOnly/></DelegatedWorkspace></>:<FollowupRecords key={session.viewer.person}/>}</>;
}

function FollowupRecords({readOnly=false}:{readOnly?:boolean}){
 const [cases,setCases]=useState<MedicalCaseSummary[]|null>(null),[selectedKey,setSelectedKey]=useState(''),[query,setQuery]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const mounted=useRef(true),sequence=useRef(0);
 const load=useCallback(async()=>{
  const request=++sequence.current;setLoading(true);
  try{
   const driverId=new URLSearchParams(window.location.search).get('driverId');
   const response=await timedFetch('/api/hr/accident-reports'+(driverId?'?'+new URLSearchParams({driverId}):''));
   if(!mounted.current||request!==sequence.current)return;
   if(response.status===401||response.status===403){setCases(null);setSelectedKey('');setError('Sign in with your own authorized account to view your accident follow-ups. Reports are restricted to the driver and designated reviewers.');return;}
   let value:{cases?:MedicalCaseSummary[];error?:string};
   try{value=await response.json();}catch{throw Error('The server returned an unreadable response. Try refreshing this page.');}
   if(!mounted.current||request!==sequence.current)return;
   if(!response.ok)throw Error(value.error||'The follow-up list could not be loaded.');
   const next=Array.isArray(value.cases)?value.cases:[];
   setCases(next);setSelectedKey(current=>next.some(record=>keyOf(record)===current)?current:next.length===1?keyOf(next[0]):'');setError('');
  }catch(e){if(mounted.current&&request===sequence.current)setError(e instanceof Error?e.message:'The follow-up list could not be loaded.');}
  finally{if(mounted.current&&request===sequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{mounted.current=true;const initial=setTimeout(()=>void load(),0),refresh=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('focus',refresh);return()=>{mounted.current=false;clearTimeout(initial);window.removeEventListener('focus',refresh);};},[load]);
 const selected=cases?.find(record=>keyOf(record)===selectedKey);
 const needle=searchText(query.trim());
 const visible=(cases||[]).filter(record=>searchText(`${record.title} ${record.driverName}`).includes(needle));
 return <main className="accident-followups">
  <Link className="af-back" href="/" prefetch={false}><ArrowLeft size={14} aria-hidden="true"/> Back to Command</Link>
  <header className="af-heading"><div><h1>Accident Follow-Ups</h1><p>{readOnly?'Review this employee’s permitted accident reports, scheduled check-ins, and signatures. Changes are disabled during employee view.':'Review reports and complete the three weekly check-ins after a driver-involved accident. Add new information whenever needed, including after the scheduled dates.'}</p></div><button type="button" className="ar-button" disabled={loading} onClick={()=>void load()}><RefreshCw size={14} aria-hidden="true"/>{loading?'Refreshing…':'Refresh List'}</button></header>
  {error&&<p className="ar-alert" role="alert">{error}</p>}
  {!cases&&loading&&<div className="af-empty" role="status"><p>Loading your follow-ups…</p></div>}
  {cases?.length===0&&<section className="af-empty"><h2>No Linked Accident Follow-Ups</h2><p>No accident follow-up records are currently available to your account. If an accident should be listed, contact your supervisor to confirm that you are linked to the claim.</p></section>}
  {!!cases?.length&&<div className="af-layout">
   <section className="af-list" aria-label="Linked accidents"><h2>Linked Accidents</h2><label className="af-search"><span>Find a Record</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Claim or driver name"/></label><div className="af-cases">{visible.map(record=>{
    const due=nextCheckIn(record),key=keyOf(record);
    return <button type="button" className="af-case" data-delegated-allow="true" key={key} aria-current={selectedKey===key?'true':undefined} onClick={()=>setSelectedKey(key)}><strong>{record.title||'Accident Report'}</strong><span>{record.driverName}</span><small>{record.accidentOn?`Accident ${auditDay(record.accidentOn)}`:'Accident date not recorded'}</small>{due?<span className="af-due">Week {due.week} · {auditDay(due.dueOn)} · {due.status}</span>:<span className="af-due">{record.schedule.length?'Scheduled check-ins completed':'Check-in dates pending'}</span>}{record.pendingSignatures>0&&<small>{record.pendingSignatures} {record.pendingSignatures===1?'report awaits':'reports await'} driver review</small>}</button>;
   })}{!visible.length&&<p className="af-empty-list">No matching records.</p>}</div></section>
   {selected?<AccidentReportsPanel key={selectedKey} claimKey={selected.claimKey} driverId={selected.driverId} accidentOn={selected.accidentOn} onChanged={()=>void load()}/>:<section className="af-placeholder"><h2>Select an Accident</h2><p>Choose a linked record to review the driver’s reports, check-in dates and signatures.</p></section>}
  </div>}
 </main>;
}
