'use client';
import ActivityFields from '@/components/shared/ActivityFields';
import {useRef,useState} from 'react';
import {CheckCheck,ChevronRight,FileText,Send,ShieldCheck} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {Audience,Policy,SopData} from '@/lib/sop/model';
import {bulkPublicationAttestation} from '@/lib/sop/signature-terms';
import {requestJson} from '@/lib/shared/client';
import {audienceText,when} from './view-model';
import {SearchChoices} from './SopEditor';
import {isCorrectivePolicy} from '@/lib/sop/corrective-content';
import {CorrectiveAudience} from './CorrectiveAudience';
import './workshop-publication.css';

const missingAudience='Choose who can read this policy before publishing.';
const noAudience=():Audience=>({all:false,departments:[],levels:[],people:[]});
const hasAudience=(a:Audience)=>a.all||!!(a.people.length+a.departments.length+a.levels.length);
const onlyMissingAudience=(p:Policy)=>!isCorrectivePolicy(p)&&!hasAudience(p.audience)&&(!p.publishBlocker||p.publishBlocker===missingAudience);
const selectable=(p:Policy)=>p.canEditPolicy!==false&&p.status==='Draft'&&(!p.publishBlocker||onlyMissingAudience(p));
const itemKey=(p:Policy)=>`${p.id}@${p.version}`;
const nPolicies=(n:number)=>`${n} ${n===1?'Policy':'Policies'}`;
type Receipt={published:number;publishedAt:string;batchId:string};

export function PublicationDetails({policy}:{policy:Policy}){
 const record=policy.publication;
 if(!record)return null;
 return <div className="sop-publication-detail"><ShieldCheck size={16} aria-hidden="true"/><ActivityFields by={record.signerName} at={record.publishedAt} byLabel="Last Revised By" whenLabel="Published At"/></div>;
}

export default function WorkshopPublication({data,matches,pageRows,selected,setSelected,onRead,onPublished,onRefresh}:{data:SopData;selected:Set<string>;setSelected:(value:Set<string>)=>void;matches:Policy[];pageRows:Policy[];onRead:(p:Policy)=>void;onPublished:(receipt:Receipt)=>void;onRefresh:()=>Promise<void>}){
 const [snapshot,setSnapshot]=useState<Policy[]>([]),[open,setOpen]=useState(false),[err,error]=useState(''),[busy,setBusy]=useState(false),locked=useRef(false);
 const [newAudience,setAudience]=useState<Audience>(noAudience),[scope,setScope]=useState<'none'|'all'|'choose'>('none');
 const candidates=matches.filter(selectable),chosen=candidates.filter(p=>selected.has(itemKey(p))),missing=snapshot.filter(onlyMissingAudience),signer=data.signerNames[0]||'';
 const topicNames=new Map(data.topics.map(t=>[t.id,t.name]));
 function toggle(p:Policy){if(!selectable(p))return;const next=new Set(selected),k=itemKey(p);if(next.has(k))next.delete(k);else next.add(k);setSelected(next);}
 function review(){if(!chosen.length)return;setSnapshot([...chosen]);setAudience(noAudience());setScope('none');error('');setOpen(true);}
 function chooseScope(value:'none'|'all'|'choose'){setScope(value);setAudience(a=>({...a,all:value==='all'}));error('');}
 const resolveAudience=(p:Policy):Audience=>isCorrectivePolicy(p)?{all:true,departments:[],levels:[],people:[]}:onlyMissingAudience(p)?scope==='none'?noAudience():newAudience:p.audience;
 const complete=!!snapshot.length&&snapshot.length<=1000&&!!signer&&(!missing.length||scope!=='none'&&hasAudience(newAudience));
 async function publish(){if(locked.current||!complete)return;setBusy(true);locked.current=true;error('');try{
   const result=await requestJson<Receipt>('/api/sop',{action:'publishSelected',policies:snapshot.map(p=>({id:p.id,version:p.version,etag:p.etag})),signerName:signer,assent:true,...(missing.length?{audienceForUnassigned:newAudience}:{})},120000);
   setOpen(false);setSelected(new Set());setSnapshot([]);onPublished(result);
  }catch(e){error((e as Error).message);}finally{locked.current=false;setBusy(false);}}
 return <>
  <div className="sop-pub-tools"><div><strong>Approve Drafts for Publication</strong><p>{chosen.length?`${chosen.length} selected across all pages of this view.`:'Select individual drafts or all eligible drafts matching these filters.'}</p></div><div className="sop-tools"><button className="sop-btn" type="button" disabled={!candidates.length||chosen.length===candidates.length} onClick={()=>setSelected(new Set(candidates.map(itemKey)))}><CheckCheck size={16}/>Select All Eligible ({candidates.length})</button>{chosen.length>0&&<button type="button" className="sop-btn" onClick={()=>setSelected(new Set())}>Clear</button>}<button type="button" className="sop-btn primary" disabled={!chosen.length} onClick={review}><Send size={15}/>Review & Publish{chosen.length?' ('+chosen.length+')':''}</button></div></div>
  {pageRows.map(p=>{const can=selectable(p),needs=can&&onlyMissingAudience(p);return <div className="sop-pub-row" key={itemKey(p)}><label className="sop-pub-check" title={can?'Select '+p.code:p.publishBlocker}><input type="checkbox" aria-label={'Select '+p.code+' for Publication'} checked={can&&selected.has(itemKey(p))} disabled={!can} onChange={()=>toggle(p)}/></label><button type="button" className="sop-result" onClick={()=>onRead(p)}><span className="sop-doc"><FileText size={18}/></span><span className="sop-result-body"><small>{p.code} · {topicNames.get(p.topicId)||'Policy'} · Version {p.version}</small><strong>{p.content.title}</strong>{!can&&<small>{p.publishBlocker}</small>}</span><span className="sop-result-meta">{!can?'Needs Review':needs?'Choose Audience':'Ready to Publish'}</span><ChevronRight size={16}/></button></div>;})}
  <Dialog open={open} onOpenChange={v=>{if(!locked.current)setOpen(v);}}><DialogContent className="sop-pub-dialog" showCloseButton={!busy}>
   <DialogTitle>Review Publication of {nPolicies(snapshot.length)}</DialogTitle><DialogDescription>These drafts will become the current versions in the Published Library. Earlier published versions and acknowledgments will remain in history.</DialogDescription>
   {snapshot.some(isCorrectivePolicy)&&<div className="sop-corrective-review"><strong>Corrective Action Policies</strong><CorrectiveAudience/><p>Publishing makes the employee policy available company-wide. Internal response instructions remain restricted. Approval does not acknowledge a policy on anyone’s behalf.</p></div>}
   {missing.length>0&&<fieldset className="sop-pub-audience" disabled={busy}><legend>Set the Audience for {nPolicies(missing.length)}</legend><p>{missing.length===1?'This draft has':'These drafts have'} no saved audience. This audience applies to each of these policies in full. Existing audiences on other drafts and corrective action section permissions will stay unchanged.</p><div className="sop-tools"><button type="button" className="sop-btn" aria-pressed={scope==='choose'} onClick={()=>chooseScope('choose')}>Select Departments, Levels, or People</button><button type="button" className="sop-btn" aria-pressed={scope==='all'} onClick={()=>chooseScope('all')}>All Employees</button></div>
    {scope==='choose'&&<div className="sop-pub-pickers"><SearchChoices label="Departments" options={data.departments} selected={newAudience.departments} onChange={value=>setAudience(a=>({...a,departments:value}))}/><SearchChoices label="Organizational Levels" options={data.levels.map(l=>({id:l,name:l}))} selected={newAudience.levels} onChange={value=>setAudience(a=>({...a,levels:value}))}/><SearchChoices label="Individual Employees" options={data.people} selected={newAudience.people} onChange={value=>setAudience(a=>({...a,people:value}))}/></div>}</fieldset>}
   <ul className="sop-pub-editions" aria-label="Drafts and Audiences to Publish">{snapshot.map(p=>{const audience=resolveAudience(p);return <li key={itemKey(p)}><small>{p.code} · Version {p.version}{p.content.revision&&' · Revision '+p.content.revision}</small><button type="button" disabled={busy} className="sop-pub-read" aria-label={'Read '+p.code+' Before Publishing'} title={'Read '+p.code+' Before Publishing'} onClick={()=>{setOpen(false);onRead(p);}}>{p.content.title}</button><span><b>Audience:</b> {isCorrectivePolicy(p)?'Employee policy: all employees · Supervisor instructions: managers and above only':hasAudience(audience)?audienceText({...p,audience},data):'Choose an audience above'}</span></li>;})}</ul>
   <p className="sop-pub-signature-impact"><ShieldCheck size={17}/><span>Employees in each listed audience must acknowledge the newly published version. Publication does not sign for them. {snapshot.filter(p=>p.requireOnboardingSignature!==false).length} of {snapshot.length} also require a signature during onboarding.</span></p>
   <div className="sop-pub-reviser"><span>Last Revised By <b>{signer||'Verified Account Name Required'}</b></span><span>Publication Date <b>{when(new Date().toISOString())}</b></span></div>
   {err&&<div role="alert" className="sop-error"><p>{err}</p><button type="button" className="sop-btn" disabled={busy} onClick={async()=>{try{await onRefresh();setOpen(false);setSelected(new Set());}catch(e){error((e as Error).message);}}}>Refresh Drafts</button></div>}
   {snapshot.length>1000&&<p role="alert" className="sop-error">Choose up to 1,000 drafts in one publication. Narrow the topic or search filter to split the selection.</p>}
   <p className="sop-pub-approval-note">{bulkPublicationAttestation}</p><div className="sop-tools sop-pub-confirm"><button type="button" className="sop-btn" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="sop-btn primary" disabled={busy||!complete} onClick={()=>void publish()}><Send size={15}/>{busy?'Publishing…':`Approve & Publish as ${signer||'…'}`}</button></div>
  </DialogContent></Dialog>
 </>;
}
