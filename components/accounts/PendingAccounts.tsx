'use client';
import {uiTitle} from '@/lib/shared/ui-title';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';
import { useMemo,useState } from 'react';
import { ArrowRight, Building2, Check, CheckCircle2, Plus, Search, Flag, Layers3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {PropertyContactEditor} from './PropertyContactEditor';
import {operatingFields} from '@/lib/accounts/profile-summary';
import { current, type Row } from '@/lib/accounts/model';
import { onboardingReadiness, type OnboardingStep } from '@/lib/accounts/onboarding';
import { profilePhoto } from '@/lib/accounts/contact-details';
import { InlineUpload } from './RecordUploads';

export function PendingAccounts({accounts,all,onOpen,onNew}:{accounts:Row[];all:Row[];onOpen:(id:string)=>void;onNew?:()=>void}) {
  const [search,setSearch]=useState(''),[slice,setSlice]=useState<'all'|'setup'|'ready'>('all');
  const list=useMemo(()=>accounts.map(a=>({a,r:onboardingReadiness(a,all)})).sort((x,y)=>x.a.name.localeCompare(y.a.name)),[accounts,all]);
  const ready=list.filter(x=>x.r.ready).length,rows=list.filter(({a,r})=>(slice==='all'||(slice==='ready'?r.ready:!r.ready))&&[a.name,a.address].filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="am-pending ap-pending"><header className="ap-directory-head"><div><span className="ap-caption">PROPERTY ONBOARDING</span><h1>Pending Accounts</h1></div>{onNew&&<Button onClick={onNew}><Plus size={16}/>New Property</Button>}</header>
    <div className="ap-onboard-summary"><div><Flag size={21}/><h2>Launch Readiness</h2></div><p><strong>{ready}</strong> of {list.length} {list.length===1?'property':'properties'} ready to activate</p><progress aria-label="Properties ready to activate" value={ready} max={Math.max(1,list.length)}/></div>
    <div className="ap-onboard-tools"><div role="group" aria-label="Onboarding Status">{([['all','All',list.length],['setup','In Onboarding',list.length-ready],['ready','Ready to Activate',ready]] as const).map(([key,label,n])=><button type="button" key={key} aria-pressed={slice===key} onClick={()=>setSlice(key)}>{label} <b>{n}</b></button>)}</div><label><Search size={16}/><ResponsiveSearchInput type="search" aria-label="Search Pending Properties" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search properties or addresses"/></label></div>
    <div className="ap-launch-list">{rows.map(({a,r})=>{const photo=profilePhoto(all,a);return <button type="button" key={a.id} onClick={()=>onOpen(a.id)}><span className="ap-launch-thumb">{photo?<img src={photo} loading="lazy" alt=""/>:<Building2 size={24}/>}</span><span className="ap-launch-name"><strong>{a.name}</strong>{a.address&&<small>{a.address}</small>}</span><span className="ap-launch-progress"><strong>{r.ready?'Ready to Activate':'In Onboarding'}</strong><progress value={r.completed} max={Math.max(1,r.total)} aria-label={a.name+' onboarding progress'}/><small>{r.completed} of {r.total} sections complete</small></span><span className="ap-launch-next">{r.ready?'Review and Activate':r.steps.find(step=>!step.done)?.title}<ArrowRight size={15}/></span></button>;})}</div>
    {!rows.length&&<div className="ap-no-results"><Layers3/><strong>{list.length?'No Matching Pending Properties':'No Properties in Onboarding'}</strong><span>{list.length?'Clear your search or select All.':onNew?'Select New Property to start onboarding.':'New properties will appear here when onboarding starts.'}</span></div>}
  </section>;
}

export function PropertyOnboarding({account,all,editable,canFiles,canRelationships,canWork,canActivate,busy,onEdit,onRefresh,onAction,onViewProfile}: {
  account:Row;all:Row[];editable:boolean;canFiles:boolean;canRelationships:boolean;canWork:boolean;canActivate:boolean;busy:boolean;
  onEdit:(row:Row,fields?:string[],title?:string)=>void;onRefresh:()=>Promise<void>;
  onAction:(body:Record<string,unknown>,message:string)=>Promise<unknown>;onViewProfile:()=>void;
}) {
  const readiness=onboardingReadiness(account,all);
  const [step,setStep]=useState<OnboardingStep>(()=>readiness.steps.find(s=>!s.done)?.id||'launch');
  const [contactTarget,setContactTarget]=useState<Row>();
  const [error,setError]=useState('');
  const active=readiness.steps.find(s=>s.id===step)!,index=readiness.steps.findIndex(s=>s.id===step);
  const primary=all.find(r=>r.kind==='contact'&&r.id===account.primaryContactId);
  const affiliations=all.filter(r=>r.kind==='affiliation'&&r.accountId===account.id&&r.contactId===primary?.id&&current(r));
  const files=all.filter(r=>r.kind==='file'&&r.accountId===account.id&&r.category==='Agreement'&&r.status!=='Archived');
  const photo=profilePhoto(all,account);
  async function run(body:Record<string,unknown>,message:string){setError('');try{await onAction(body,message);}catch(e){setError((e as Error).message);}}
  return <div className="am-onboarding"><header className="am-pending-heading"><div><span className="am-pending-label">Pending Account</span><h2>{account.name}</h2><p>{readiness.completed} of {readiness.total} sections complete · Save each section and return whenever you’re ready.</p></div><Button variant="outline" onClick={onViewProfile}>View Full Profile</Button></header>
    <nav className="am-onboarding-steps" aria-label="Property onboarding steps">{readiness.steps.map((s,i)=><button key={s.id} onClick={()=>setStep(s.id)} aria-current={step===s.id?'step':undefined}><span>{s.done?<Check size={17}/>:i+1}</span>{s.title}</button>)}</nav>
    <section className="am-panel am-onboarding-panel"><header><h3>{index+1}. {active.title}</h3>{active.done&&<span className="am-ready-label"><CheckCircle2 size={16}/>Complete</span>}</header><div className="am-onboarding-body">
      {step==='details'&&<><p>Confirm the property address, service level and account manager.</p><dl className="am-onboarding-facts">{[['Address',account.address],['Property type',account.propertyType],['Service',account.service],['Office phone',account.phone],['Office email',account.officeContact]].map(([label,value])=><div key={String(label)}><dt>{uiTitle(String(label))}</dt><dd>{value||'Not entered'}</dd></div>)}</dl>{editable&&<Button onClick={()=>onEdit(account,['name','address','propertyType','service','assignee','companyId','ownerId','units','parkingSpaces','officeContact','phone'],'Property details')}>Edit Property Details</Button>}</>}
      {step==='photos'&&<><p>Add a clear property photo so the team can recognize this location.</p>{photo&&<img className="am-onboarding-photo" src={photo} alt={account.name+' property'}/>} {editable&&<InlineUpload accountId={account.id} category="Account photo" label={photo?'Replace property photo':'Upload property photo'} onUploaded={onRefresh}/>}</>}
      {step==='contacts'&&<><p>Link a primary contact. Work phone numbers and emails stay attached to this property’s affiliation.</p>{primary&&<div className="am-onboarding-contact"><h4>{primary.name}</h4>{affiliations.map(a=><div key={a.id}><p>{a.role}</p><p>{a.workEmail||primary.email||'Email not entered'}</p><p>{a.workPhone||primary.personalPhone||'Phone not entered'}</p></div>)}</div>}{editable&&canRelationships&&<Button onClick={()=>setContactTarget(account)}>{primary?'Edit / Change Primary Contact':'Add Primary Contact'}</Button>}</>}
      {step==='agreement'&&<><p>Upload the signed towing agreement, record its dates and terms, then confirm the agreement has been verified.</p>{files.map(f=><a className="am-onboarding-file" key={f.id} href={f.sourceOnly?String(f.sourceUrl):'/api/accounts/files?id='+encodeURIComponent(f.id)} target="_blank" rel="noreferrer">{f.name} · {f.status}</a>)}{editable&&canFiles&&<InlineUpload accountId={account.id} category="Agreement" label="Upload Signed Towing Agreement" onUploaded={onRefresh}/>}<p>{account.agreementVerified?'Agreement marked verified':'Agreement still needs verification'}</p>{editable&&<Button variant="outline" onClick={()=>onEdit(account,['agreementStart','agreementEnd','agreementTerm','renewalDate','cancellationDays','noticeDeadline','cancellationTerms','agreementVerified'],'Towing agreement details')}>Edit Agreement Details</Button>}</>}
      {step==='launch'&&<><p>Finish the launch checklist, confirm operating instructions and set the service start date.</p><div className="am-actions"><span>Launch date: <b>{account.launchDate||'Not set'}</b></span>{editable&&<Button variant="outline" onClick={()=>onEdit(account,['launchDate','jurisdiction','instructions','gateCode','contactPreference',...operatingFields],'Launch plan & operating instructions')}>Edit Launch Plan</Button>}{editable&&canWork&&!account.onboardingStartedAt&&<Button disabled={busy} onClick={()=>void run({action:'onboard',id:account.id},'Launch checklist started')}>Start Launch Checklist</Button>}</div><div className="am-launch-checklist">{readiness.tasks.map(task=><article key={task.id}><span className={task.status==='Completed'?'am-step-complete':''}>{task.status==='Completed'?<CheckCircle2 size={20}/>:<span className="am-step-outline"/>}</span><div><h4>{task.name}{task.required&&<small>Required</small>}</h4><p>{task.details}</p><small>{task.status}</small></div>{editable&&canWork&&<Button variant="outline" size="sm" onClick={()=>onEdit(task,['name','details','assignee','dueDate','status','resolution','checklist','completedSteps'],'Onboarding step')}>{task.status==='Completed'?'Review':'Update Step'}</Button>}</article>)}</div></>}
      {!active.done&&<div className="am-onboarding-missing"><b>Still Needed</b><ul>{active.missing.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
    </div><footer className="am-onboarding-footer"><Button variant="outline" disabled={!index} onClick={()=>setStep(readiness.steps[index-1].id)}>Previous</Button><span>Progress updates as you save.</span>{index<readiness.steps.length-1&&<Button onClick={()=>setStep(readiness.steps[index+1].id)}>Next Section<ArrowRight size={16}/></Button>}</footer></section>
    {error&&<p role="alert" className="am-error">{error}</p>}
    <section className="am-onboarding-activate"><div><h3>{readiness.ready?'Ready for the Active Account List':'Complete Onboarding to Activate'}</h3><p>{readiness.ready?'Activation moves this property out of Pending Accounts and makes it available to Dispatch.':'This property stays in Pending Accounts until all required sections are complete.'}</p></div>{canActivate&&editable&&<Button disabled={busy||!readiness.ready} onClick={()=>void run({action:'activateOnboarding',accountId:account.id,accountVersion:account.version},'Property activated')}>Activate Property<ArrowRight size={17}/></Button>}</section>
    {contactTarget&&<PropertyContactEditor account={contactTarget} contactId={String(contactTarget.primaryContactId||'')} forcePrimary all={all} onClose={()=>setContactTarget(undefined)} onSave={async body=>{await onAction(body,'Property contact saved');setContactTarget(undefined);}}/>}
  </div>;
}
