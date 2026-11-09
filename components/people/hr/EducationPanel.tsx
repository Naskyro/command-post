'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {GraduationCap,Plus,Pencil,Trash2} from 'lucide-react';
import {educationLevels,educationStatuses,highestCompletedEducation,type EducationCredential} from '@/lib/hr/education';
import {requestJson} from '@/lib/shared/client';
import {auditDay} from '@/lib/shared/audit-format';
import ActivityFields from '@/components/shared/ActivityFields';
import {Button,Card,Modal} from './ui';

type Response={entries:EducationCredential[];version:number;canEdit:boolean;secureStorageAvailable:boolean;updatedBy:string;updatedAt:string};
type Draft={level:string;status:string;school:string;fieldOfStudy:string;degree:string;completedOn:string};
const blank=():Draft=>({level:'',status:'',school:'',fieldOfStudy:'',degree:'',completedOn:''});
export default function EducationPanel({personId,personName}:{personId:string;personName:string}){
 const [data,setData]=useState<Response|null>(null),[error,setError]=useState(''),[mode,setMode]=useState<''|'edit'|'remove'>(''),[entryId,setId]=useState(''),[draft,setDraft]=useState(blank),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const form=useRef<HTMLFormElement>(null),seq=useRef(0),lock=useRef(false);
 async function load(){const n=++seq.current;try{const r=await requestJson<Response>('/api/people/education?personId='+encodeURIComponent(personId));if(n===seq.current){setData(r);setError('');}}catch(e){if(n===seq.current)setError((e as Error).message);}}
 useEffect(()=>{setData(null);setError('');setMode('');setNotice('');void load();return()=>{seq.current++;};},[personId]);
 function edit(e?:EducationCredential){setId(e?.id||'');setDraft(e?{level:e.level,status:e.status,school:e.school||'',fieldOfStudy:e.fieldOfStudy||'',degree:e.degree||'',completedOn:e.completedOn||''}:blank());setMode('edit');setError('');setNotice('');}
 function remove(e:EducationCredential){setId(e.id);setReason('');setMode('remove');setError('');setNotice('');}
 function close(){if(lock.current)return;setMode('');setError('');}
 async function submit(e:FormEvent){e.preventDefault();if(!data||lock.current)return;lock.current=true;setBusy(true);setError('');try{
 const res=await requestJson<Response>('/api/people/education',{personId,version:data.version,entryId,action:mode==='remove'?'remove':'save',...(mode==='remove'?{reason}:{entry:draft})});
 setData(res);setMode('');setNotice(mode==='remove'?'Education entry removed.':'Education saved.');
 }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}
 const highest=highestCompletedEducation(data?.entries||[]),writable=!!data?.canEdit&&data.secureStorageAvailable;
 const removed=data?.entries.find(e=>e.id===entryId);
 const set=(k:keyof Draft,s:string)=>setDraft(d=>({...d,[k]:s,...(k==='status'&&s!=='Completed'?{completedOn:''}:{})}));
 if(data&&!data.canEdit&&!data.entries.length)return null;
 return <Card title="Education" action={data?.canEdit&&<Button disabled={!writable} onClick={()=>edit()}><Plus size={16}/>Add Education</Button>}>
  {!data&&!error&&<p className="hr2-help">Loading education…</p>}
  {data&&!data.secureStorageAvailable&&<p className="hr2-error">Secure personnel storage is unavailable. Education cannot be saved right now.</p>}
  {highest&&<p className="hr2-help"><b>Highest Completed Level:</b> {highest}</p>}
  {data?.canEdit&&!data.entries.length&&<p className="hr2-help">Add a completed credential or a program currently in progress.</p>}
  <div className="hr2-timeline">{data?.entries.map(entry=><article key={entry.id}>
   <div><GraduationCap size={16} aria-hidden="true"/> <b>{entry.degree||entry.level}</b> <span className={'hr2-tag '+(entry.status==='Completed'?'green':'')}>{entry.status}</span></div>
   <div>{[entry.degree?entry.level:'',entry.fieldOfStudy,entry.school,entry.completedOn?'Completed '+auditDay(entry.completedOn):''].filter(Boolean).join(' · ')}</div>
   {writable&&<div className="hr2-actions"><Button aria-label={'Edit '+(entry.degree||entry.level)} onClick={()=>edit(entry)}><Pencil size={14}/>Edit</Button><Button aria-label={'Remove '+(entry.degree||entry.level)} onClick={()=>remove(entry)}><Trash2 size={14}/>Remove</Button></div>}
  </article>)}</div>
  {data?.updatedAt&&<ActivityFields by={data.updatedBy} at={data.updatedAt} byLabel="Updated By" whenLabel="Updated At"/>}
  {notice&&<p role="status" className="hr2-success">{notice}</p>}
  {error&&!mode&&<div role="alert" className="hr2-error">{error} <Button onClick={()=>void load()}>Reload Education</Button></div>}
  {mode&&data&&<Modal title={mode==='remove'?'Remove Education':entryId?'Edit Education':'Add Education'} subtitle={personName} onClose={close} footer={<><Button onClick={close} disabled={busy}>Cancel</Button><Button primary disabled={busy||!writable} onClick={()=>form.current?.requestSubmit()}>{busy?'Saving…':mode==='remove'?'Remove Entry':'Save Education'}</Button></>}>
    <form ref={form} onSubmit={submit} className="hr2-form">
    {mode==='remove'?<><p className="full">Remove <b>{removed?.degree||removed?.level}</b> from this personnel file? Earlier versions remain in the restricted audit history.</p><label className="hr2-field full">Reason for Removal<textarea required maxLength={350} value={reason} onChange={e=>setReason(e.target.value)}/></label></>:<>
     <label className="hr2-field">Education Level<select required value={draft.level} onChange={e=>set('level',e.target.value)}><option value="">Select Level</option>{educationLevels.map(v=><option key={v}>{v}</option>)}</select></label>
     <label className="hr2-field">Status<select required value={draft.status} onChange={e=>set('status',e.target.value)}><option value="">Select Status</option>{educationStatuses.map(v=><option key={v}>{v}</option>)}</select></label>
     <label className="hr2-field">Field of Study<input maxLength={160} value={draft.fieldOfStudy} onChange={e=>set('fieldOfStudy',e.target.value)} placeholder="e.g., Business Administration"/></label>
     <label className="hr2-field">Degree or Credential Name<input maxLength={160} value={draft.degree} onChange={e=>set('degree',e.target.value)} placeholder="e.g., Associate of Applied Science"/></label>
     <label className="hr2-field">School or Institution<input maxLength={160} value={draft.school} onChange={e=>set('school',e.target.value)}/></label>
     {draft.status==='Completed'&&<label className="hr2-field">Completion Date (If Known)<input type="date" value={draft.completedOn} onChange={e=>set('completedOn',e.target.value)}/></label>}
    </>}
    {error&&<div role="alert" className="hr2-error full">{error} <Button onClick={()=>{setMode('');void load();}}>Reload Education</Button></div>}
    </form>
  </Modal>}
 </Card>;
}
