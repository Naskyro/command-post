'use client';
import { useState, useEffect } from 'react';
import { ArrowRight, Building2, CheckCircle2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {PropertyContactEditor} from './PropertyContactEditor';
import {operatingFields} from '@/lib/accounts/profile-summary';
import { current, forms, type Row } from '@/lib/accounts/model';
import { onboardingReadiness, type OnboardingStep } from '@/lib/accounts/onboarding';
import { profilePhoto } from '@/lib/accounts/contact-details';
import { InlineUpload } from './RecordUploads';

export function PendingAccounts({accounts,all,onOpen,onNew,onAction}:{accounts:Row[];all:Row[];onOpen:(id:string)=>void;onNew?:()=>void;onAction:(body:Record<string,unknown>,message:string)=>Promise<unknown>}) {
  const [search,setSearch]=useState('');
  const [confirm,setConfirm]=useState<{id:string;name:string;version:number}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const rows=accounts.filter(a=>(a.name+' '+(a.address||'')).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
  const close=()=>{setConfirm(null);setError('');};
  async function run(body:Record<string,unknown>,message:string){setBusy(true);setError('');try{await onAction(body,message);close();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="am-pending"><header className="am-pending-heading"><div><h2>Pending Accounts <span className="am-count">{accounts.length}</span></h2><p>Build each property profile here. Completed properties move into Accounts when activated.</p></div>{onNew&&<Button onClick={onNew}><Plus size={17}/>New Property</Button>}</header>
    <label className="am-pending-search">Search pending properties<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Property name or address"/></label>
    <div className="am-pending-grid">{rows.map(a=>{const r=onboardingReadiness(a,all),photo=profilePhoto(all,a);return <article className="am-pending-card" key={a.id}>
      <button className="am-pending-close" aria-label={'Remove '+a.name} onClick={(e)=>{e.stopPropagation();setConfirm({id:a.id,name:a.name,version:a.version});}}><X size={18}/></button>
      <div className="am-pending-card-body" onClick={()=>onOpen(a.id)}><div className="am-pending-thumbnail">{photo?<img src={photo} alt=""/>:<Building2 size={28}/>}</div><div className="am-pending-card-content"><span className={r.ready?'am-ready-label':'am-pending-label'}>{r.ready?'Ready to activate':'In onboarding'}</span><h3>{a.name}</h3><p>{a.address||'Address still needed'}</p><progress value={r.completed} max={r.total} aria-label={a.name+' onboarding progress'}/><small>{r.completed} of {r.total} sections complete</small><span className="am-pending-next">{r.ready?'Review and activate':r.steps.find(s=>!s.done)?.title}<ArrowRight size={17}/></span></div></div>
    </article>;})}</div>
    {!rows.length&&<p className="am-empty">{accounts.length?'No pending properties match your search.':'No properties are currently onboarding. Select New Property to start.'}</p>}
    <Dialog open={!!confirm} onOpenChange={c=>{if(!c)close();}}>
      <DialogContent className="am-pending-dialog" aria-describedby="am-pending-confirm-desc">
        <DialogHeader><DialogTitle>Remove {confirm?.name}</DialogTitle><DialogDescription id="am-pending-confirm-desc">Choose what to do with this pending property. You can bring a terminated property back later.</DialogDescription></DialogHeader>
        {error&&<p role="alert" className="am-error">{error}</p>}
        <div className="am-pending-choices">
          <Button variant="outline" disabled={busy} onClick={()=>void run({action:'terminateAccount',accountId:confirm?.id,accountVersion:confirm?.version},'Property terminated')}>
            <span><b>Send to terminated accounts</b><small>Keep the record for reference</small></span>
          </Button>
          <Button variant="outline" disabled={busy} onClick={()=>void run({action:'deleteAccount',id:confirm?.id},'Property deleted permanently')}>
            <span><b>Delete permanently</b><small>Remove the property and all related records</small></span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}

const taskPayload = (t: Row, extra: Partial<Row>) => ({ ...Object.fromEntries(['id', 'kind', 'version', 'name', 'accountId', ...forms.task.map(f => f.key)].filter(k => t[k] !== undefined).map(k => [k, t[k]])), ...extra });

function TaskStep({task, account, all, editable, canFiles, onAction, onRefresh}: {task: Row; account: Row; all: Row[]; editable: boolean; canFiles: boolean; onAction: (body: Record<string, unknown>, message: string) => Promise<unknown>; onRefresh: () => Promise<void>;}) {
  const done = task.status === 'Completed';
  const name = String(task.name || '').toLowerCase();
  const detail = String(task.details || '').toLowerCase();
  const resText = String(task.resolution || '').toLowerCase();
  const oldAutoSignage = resText.includes('gate fob') || resText.includes('rfid');
  const isSignage = oldAutoSignage || name.includes('sign') || name.includes('property access') || detail.includes('photograph') || detail.includes('sign') || detail.includes('property access') || detail.includes('gate fob') || detail.includes('rfid') || detail.includes('entrance');
  const isResident = name.includes('resident') || name.includes('communication');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState(String(task.completionNotes || ''));
  const [outcome, setOutcome] = useState(String(task.resolution || ''));
  const [gateTested, setGateTested] = useState(false);
  const [accessProvided, setAccessProvided] = useState(false);
  const [accessCode, setAccessCode] = useState(String(account.gateCode || ''));
  const complete = async () => {
    setSaving(true); setError('');
    try {
      let completionNotes = notes.trim(), resolution = outcome.trim();
      if (isSignage) {
        completionNotes = notes.trim();
        resolution = 'Signage and property access verified';
        if (accessCode.trim()) resolution += ` · Access code: ${accessCode.trim()}`;
      }
      await onAction({ record: taskPayload(task, { status: 'Completed', completionNotes, resolution }) }, 'Step completed');
      if (isSignage && accessProvided && accessCode.trim()) {
        await onAction({ record: { id: account.id, kind: account.kind, version: account.version, name: account.name, gateCode: accessCode.trim() } }, 'Access code saved');
      }
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const reopen = () => { setError(''); void onAction({ record: taskPayload(task, { status: 'Open' }) }, 'Step reopened').catch(e => setError((e as Error).message)); };
  return <div className="am-task-step">
    <p>{task.details}</p>
    {done ? <>
      {!!task.completionNotes && <p><small><b>Notes:</b> {String(task.completionNotes)}</small></p>}
      {!!task.resolution && !isSignage && <p><small><b>Outcome:</b> {String(task.resolution)}</small></p>}
      {isSignage && <p><small><b>Outcome:</b> Signage and property access verified</small></p>}
      <p className="am-ready-label"><CheckCircle2 size={16}/> Complete</p>
      {editable && <button type="button" className="am-text-button" onClick={reopen}>Reopen</button>}
    </> : <>
      {isSignage ? <div className="am-form-grid">
        {editable && canFiles && <><div className="am-wide"><InlineUpload accountId={account.id} category="Signage" label="Upload signage photos" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple={true} onUploaded={onRefresh}/></div><div className="am-wide"><InlineUpload accountId={account.id} category="Signage" label="Upload video / body cam footage" accept=".mp4,.mov,.webm" multiple={true} hint="Video / body cam footage (MP4, MOV, WebM)" onUploaded={onRefresh}/></div></>}
        <label className="am-wide">Entrance / access notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}/></label>
        <label className="am-check"><input type="checkbox" checked={gateTested} onChange={e => setGateTested(e.target.checked)}/> Gate fob / key / RFID tested</label>
        <label className="am-check"><input type="checkbox" checked={accessProvided} onChange={e => setAccessProvided(e.target.checked)}/> Access code provided</label>
        {accessProvided && <label>Access code / gate code<input value={accessCode} onChange={e => setAccessCode(e.target.value)}/></label>}
      </div> : isResident ? <div className="am-form-grid">
        {editable && canFiles && <><div className="am-wide"><InlineUpload accountId={account.id} category="Welcome letter" label="Upload welcome letter" onUploaded={onRefresh}/></div><div className="am-wide"><InlineUpload accountId={account.id} category="Resident letter" label="Upload resident letter" onUploaded={onRefresh}/></div></>}
        <label className="am-wide">Notes / communications saved<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}/></label>
      </div> : <div className="am-form-grid">
        <label className="am-wide">Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}/></label>
        <label className="am-wide">Outcome / next step<textarea value={outcome} onChange={e => setOutcome(e.target.value)} rows={2}/></label>
      </div>}
      {editable && <div className="am-actions"><Button disabled={saving} onClick={() => void complete()}>{saving ? 'Saving…' : 'Mark step complete'}</Button></div>}
    </>}
    {error && <p role="alert" className="am-error">{error}</p>}
  </div>;
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
  const agreementFields=['agreementStart','agreementEnd','agreementTerm','renewalDate','cancellationDays','noticeDeadline','cancellationTerms','agreementVerified'];
  const labelFor=(k:string)=>forms.account.find(f=>f.key===k)?.label||k;
  const text=(v:unknown)=>v===undefined||v===null?'':String(v);
  const initialAgreement=(a:Row)=>Object.fromEntries(agreementFields.map(k=>[k,k==='agreementVerified'?!!a[k]:text(a[k])])) as Record<string,string|boolean>;
  const [editing,setEditing]=useState(!account.agreementVerified);
  const [form,setForm]=useState<Record<string,string|boolean>>(()=>initialAgreement(account));
  const [saving,setSaving]=useState(false);
  const launchFields=['launchDate','jurisdiction','instructions','gateCode','contactPreference','enforcementHours','towAuthorization','spaceCallAuthority','towAuthorizationNotes'];
  const initialLaunch=(a:Row)=>Object.fromEntries(launchFields.map(k=>[k,text(a[k])])) as Record<string,string>;
  const [editingLaunch,setEditingLaunch]=useState(!account.onboardingStartedAt);
  const [launchForm,setLaunchForm]=useState<Record<string,string>>(()=>initialLaunch(account));
  const [savingLaunch,setSavingLaunch]=useState(false);
  const [finishDialog,setFinishDialog]=useState(false);
  useEffect(()=>{setEditing(!account.agreementVerified);setForm(initialAgreement(account));setEditingLaunch(!account.onboardingStartedAt);setLaunchForm(initialLaunch(account));},[account.id]);
  async function saveAgreement(){setSaving(true);setError('');try{
    const record:Record<string,unknown>={id:account.id,kind:account.kind,version:account.version,name:account.name};
    for(const k of agreementFields){record[k]=k==='agreementVerified'?!!form[k]:k==='cancellationDays'?(form[k]===''?'':Number(form[k])):String(form[k]);}
    await onAction({action:'save',record},'Agreement details saved');
    setEditing(!form['agreementVerified']);
  }catch(e){setError((e as Error).message);}finally{setSaving(false);}}
  async function saveLaunch(){setSavingLaunch(true);setError('');try{
    const record:Record<string,unknown>={id:account.id,kind:account.kind,version:account.version,name:account.name};
    for(const k of launchFields){record[k]=String(launchForm[k]);}
    await onAction({action:'save',record},'Launch plan saved');
    if(!account.onboardingStartedAt){await onAction({action:'onboard',id:account.id},'Launch checklist started');}
    setEditingLaunch(false);
  }catch(e){setError((e as Error).message);}finally{setSavingLaunch(false);}}
  const active=readiness.steps.find(s=>s.id===step)||readiness.steps[0]||{id:'',title:'',missing:[],done:true},index=Math.max(0,readiness.steps.findIndex(s=>s.id===step));
  const activeTask=readiness.tasks.find(t=>t.id===step);
  const primary=all.find(r=>r.kind==='contact'&&r.id===account.primaryContactId);
  const affiliations=all.filter(r=>r.kind==='affiliation'&&r.accountId===account.id&&r.contactId===primary?.id&&current(r));
  const files=all.filter(r=>r.kind==='file'&&r.accountId===account.id&&r.category==='Agreement'&&r.status!=='Archived');
  const photo=profilePhoto(all,account);
  async function run(body:Record<string,unknown>,message:string){setError('');try{await onAction(body,message);}catch(e){setError((e as Error).message);}}
  return <div className="am-onboarding"><header className="am-pending-heading"><div><span className="am-pending-label">Pending account</span><h2>{account.name}</h2><p>{readiness.completed} of {readiness.total} sections complete · Save each section and return whenever you’re ready.</p><div className="am-onboarding-completion">{readiness.steps.filter(s=>s.done&&s.id!=='finish').map(s=><span key={s.id}><CheckCircle2 size={14}/>{s.title}</span>)}</div></div><Button variant="outline" onClick={onViewProfile}>View full profile</Button></header>

    <section className="am-panel am-onboarding-panel"><header><h3>{index+1}. {active.title}</h3>{active.done&&<span className="am-ready-label"><CheckCircle2 size={16}/>Complete</span>}</header><div className="am-onboarding-body">
      {step==='details'&&<><p>Confirm the property address, service level, account manager and primary contact.</p><dl className="am-onboarding-facts">{[['Address',account.address],['Property type',account.propertyType],['Service',account.service],['Office phone',account.phone],['Office email',account.officeContact]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{value||'Not entered'}</dd></div>)}</dl>{editable&&<Button onClick={()=>onEdit(account,['name','address','propertyType','service','assignee','companyId','ownerId','units','parkingSpaces','officeContact','phone','primaryContactId'],'Property details')}>Edit property details</Button>}<h4 style={{margin:'22px 0 8px',fontSize:'1rem'}}>Primary contact</h4>{primary?<div className="am-onboarding-contact"><h4>{primary.name}</h4>{affiliations.map(a=><div key={a.id}><p>{a.role}</p><p>{a.workEmail||primary.email||'Email not entered'}</p><p>{a.workPhone||primary.personalPhone||'Phone not entered'}</p></div>)}</div>:<p style={{color:'var(--ws-muted,#5d7385)',fontSize:'.9375rem'}}>No primary contact linked yet.</p>}{editable&&canRelationships&&<Button onClick={()=>setContactTarget(account)}>{primary?'Edit / change primary contact':'Add primary contact'}</Button>}</>}
      {step==='photos'&&<><p>Add a clear property photo so the team can recognize this location.</p>{photo&&<img className="am-onboarding-photo" src={photo} alt={account.name+' property'}/>} {editable&&<InlineUpload accountId={account.id} category="Account photo" label={photo?'Replace property photo':'Upload property photo'} onUploaded={onRefresh}/>}</>}
      {step==='agreement'&&<><p>Upload the signed towing agreement, then enter and submit the agreement details.</p>{files.map(f=><a className="am-onboarding-file" key={f.id} href={f.sourceOnly?String(f.sourceUrl):'/api/accounts/files?id='+encodeURIComponent(f.id)} target="_blank" rel="noreferrer">{f.name} · {f.status}</a>)}{editable&&canFiles&&<InlineUpload accountId={account.id} category="Agreement" label="Upload signed towing agreement" onUploaded={onRefresh}/>}
      {account.agreementVerified&&!editing?<>
        <dl className="am-onboarding-facts">{agreementFields.filter(k=>k!=='agreementVerified').map(k=><div key={k}><dt>{labelFor(k)}</dt><dd>{text(account[k])||'Not entered'}</dd></div>)}{account.agreementVerified&&<div><dt>Status</dt><dd><span className="am-ready-label"><CheckCircle2 size={16}/> Agreement verified</span></dd></div>}</dl>
        {editable&&<Button variant="outline" onClick={()=>{setEditing(true);setForm(initialAgreement(account));}}>Edit agreement details</Button>}
      </>:<>
        <div className="am-form-grid">{agreementFields.filter(k=>k!=='agreementVerified').map(k=>
          <label key={k} className={k==='agreementTerm'||k==='cancellationTerms'?'am-wide':''}>
            {labelFor(k)}
            {k==='agreementTerm'||k==='cancellationTerms'?<textarea value={String(form[k])} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={4} />
            :k==='cancellationDays'?<input type="number" value={String(form[k])} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} min={0} />
            :<input type="date" value={String(form[k])} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} />}
          </label>
        )}<label className="am-check am-wide"><input type="checkbox" checked={!!form['agreementVerified']} onChange={e=>setForm(f=>({...f,agreementVerified:e.target.checked}))}/>Agreement terms verified</label></div>
        <div className="am-actions"><Button disabled={saving} onClick={()=>void saveAgreement()}>{saving?'Saving…':'Submit agreement details'}</Button>{account.agreementVerified&&<Button variant="outline" disabled={saving} onClick={()=>{setEditing(false);setForm(initialAgreement(account));}}>Cancel</Button>}</div>
      </>}</>}
            {step==='launch'&&account.onboardingStartedAt&&!editingLaunch&&<>
        <p>Review the launch plan and operating instructions.</p>
        <dl className="am-onboarding-facts">{launchFields.map(k=><div key={k}><dt>{labelFor(k)}</dt><dd>{text(account[k])||'Not entered'}</dd></div>)}</dl>
        {editable&&<Button variant="outline" onClick={()=>{setEditingLaunch(true);setLaunchForm(initialLaunch(account));}}>Edit launch plan</Button>}
      </>}
      {step==='launch'&&(!account.onboardingStartedAt||editingLaunch)&&<>
        <p>Enter the launch date and operating instructions, then confirm to start the checklist.</p>
        <div className="am-form-grid">{launchFields.map(k=>{
          const field=forms.account.find(f=>f.key===k);
          return <label key={k} className={field?.type==='textarea'?'am-wide':''}><span>{labelFor(k)}</span>
            {field?.type==='textarea'?<textarea value={launchForm[k]} onChange={e=>setLaunchForm(f=>({...f,[k]:e.target.value}))} rows={4}/>
            :field?.type==='select'?<select value={launchForm[k]} onChange={e=>setLaunchForm(f=>({...f,[k]:e.target.value}))}><option></option>{(field.options||[]).map(o=><option key={o} value={o}>{o}</option>)}</select>
            :<input type={field?.type||'text'} value={launchForm[k]} onChange={e=>setLaunchForm(f=>({...f,[k]:e.target.value}))}/>}
          </label>;
        })}</div>
        <div className="am-actions"><Button disabled={savingLaunch} onClick={()=>void saveLaunch()}>{savingLaunch?'Saving…':'Confirm launch plan'}</Button>{account.onboardingStartedAt&&<Button variant="outline" disabled={savingLaunch} onClick={()=>setEditingLaunch(false)}>Cancel</Button>}</div>
      </>}{activeTask&&<TaskStep task={activeTask} account={account} all={all} editable={!!editable&&canWork} canFiles={canFiles} onAction={onAction} onRefresh={onRefresh}/>}
      {step==='finish'&&<>
        <p>Review every section before you onboard this property.</p>
        <div className="am-onboarding-finish">{readiness.steps.filter(s=>s.id!=='finish').map((s,i)=><div key={s.id} className={s.done?'am-finish-done':'am-finish-pending'}><span>{s.done?<CheckCircle2 size={16}/>:<b>{i+1}</b>}</span><span>{s.title}</span></div>)}</div>
        {editable&&canActivate&&(readiness.ready?<div className="am-actions"><Button disabled={busy} onClick={()=>setFinishDialog(true)}>Onboard</Button></div>:<p className="am-pending-label">Complete all sections to onboard.</p>)}
      </>}
      {!active.done&&<div className="am-onboarding-missing"><b>Still needed</b><ul>{active.missing.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
    </div><footer className="am-onboarding-footer"><Button variant="outline" disabled={!index} onClick={()=>setStep(readiness.steps[index-1].id)}>Previous</Button><span>Progress updates as you save.</span>{index<readiness.steps.length-1&&<Button onClick={()=>setStep(readiness.steps[index+1].id)}>Next section<ArrowRight size={16}/></Button>}</footer></section>
    {error&&<p role="alert" className="am-error">{error}</p>}
    <Dialog open={finishDialog} onOpenChange={setFinishDialog}>
      <DialogContent className="am-pending-dialog" aria-describedby="am-finish-confirm-desc">
        <DialogHeader>
          <DialogTitle>Ready to onboard?</DialogTitle>
          <DialogDescription id="am-finish-confirm-desc">Are you sure you’re ready to activate this property?</DialogDescription>
        </DialogHeader>
        <div className="am-actions">
          <Button variant="outline" onClick={()=>setFinishDialog(false)}>Cancel</Button>
          <Button disabled={busy||!readiness.ready} onClick={()=>{setFinishDialog(false);void run({action:'activateOnboarding',accountId:account.id,accountVersion:account.version},'Property activated');}}>Yes, onboard</Button>
        </div>
      </DialogContent>
    </Dialog>
    {contactTarget&&<PropertyContactEditor account={contactTarget} contactId={String(contactTarget.primaryContactId||'')} forcePrimary all={all} onClose={()=>setContactTarget(undefined)} onSave={async body=>{await onAction(body,'Property contact saved');setContactTarget(undefined);}}/>}
  </div>;
}
