'use client';
import {useRef,useState,type FormEvent} from 'react';
import {UserMinus} from 'lucide-react';
import type {FinRecord} from '@/lib/finance/model';
import {today} from '@/lib/finance/model';
import type {HrRecord} from '@/lib/hr/model';
import {requestJson} from '@/lib/shared/client';
import {Button,Modal,text} from './ui';

const reasons:Record<string,string[]>={
 'Termination':['Attendance','Job Abandonment','Performance','Policy Violation','Position Eliminated','Other'],
 'Resignation':['Another Opportunity','Personal Reasons','Reason Not Provided','Retirement','Other'],
 'End of Assignment':['Assignment Completed','Contract Ended','Seasonal Work Completed','Other'],
 'Other':['Other'],
};
export type SeparationResult={record:HrRecord;personId:string;followUpCount:number;alreadyRecorded?:boolean;credentialLifecycle?:{state:string;message:string}};

export default function SeparationDialog({person,onClose,onSaved}:{person:FinRecord;onClose:()=>void;onSaved:(result:SeparationResult)=>Promise<void>}){
 const contractor=person.workerType==='Contractor',label=contractor?'End Assignment':'End Employment';
 const [separationType,setSeparationType]=useState(contractor?'End of Assignment':'Termination');
 const [separationDate,setSeparationDate]=useState(today()),[reason,setReason]=useState(''),[otherReason,setOtherReason]=useState(''),[rehireEligibility,setRehireEligibility]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const requestId=useRef(''),saving=useRef(false),form=useRef<HTMLFormElement>(null);
 async function save(event:FormEvent){
  event.preventDefault();if(saving.current)return;
  if(!form.current?.reportValidity())return;
  if(separationDate>today()){setError('Choose today or an earlier last day. This action ends access now.');return;}
  if(!requestId.current)requestId.current=crypto.randomUUID();
  saving.current=true;setBusy(true);setError('');
  try{
   const result=await requestJson<SeparationResult>('/api/hr/separation',{personId:person.id,personVersion:person.version,requestId:requestId.current,separationType,separationDate,reason:reason==='Other'?otherReason.trim():reason,rehireEligibility,notes:notes.trim()});
   await onSaved(result);onClose();
  }catch(e){setError((e as Error).message);}finally{saving.current=false;setBusy(false);}
 }
 return <Modal title={label} subtitle={text(person.name)} onClose={()=>{if(!saving.current)onClose();}} footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button className="hrx-separation-confirm" disabled={busy} onClick={()=>form.current?.requestSubmit()}><UserMinus size={16}/>{busy?'Saving…':label}</Button></>}>
  <form ref={form} className="hrx-separation-form" onSubmit={event=>void save(event)}>
   <fieldset disabled={busy}>
    <div className="hr2-form">
     <label className="hr2-field"><span>Departure Type *</span><select required value={separationType} onChange={e=>{setSeparationType(e.target.value);setReason(e.target.value==='Other'?'Other':'');setOtherReason('');}}>{Object.keys(reasons).sort().map(type=><option key={type}>{type}</option>)}</select></label>
     <label className="hr2-field"><span>Last Day *</span><input required type="date" max={today()} value={separationDate} onChange={e=>setSeparationDate(e.target.value)}/></label>
     <label className="hr2-field"><span>Reason *</span><select required value={reason} onChange={e=>setReason(e.target.value)}><option value="">Select a Reason</option>{[...reasons[separationType]].sort().map(option=><option key={option}>{option}</option>)}</select></label>
     <label className="hr2-field"><span>Rehire Eligibility *</span><select required value={rehireEligibility} onChange={e=>setRehireEligibility(e.target.value)}><option value="">Select Eligibility</option>{['Eligible','Needs Review','Not Eligible'].map(option=><option key={option}>{option}</option>)}</select></label>
     {reason==='Other'&&<label className="hr2-field full"><span>Reason Details *</span><input required maxLength={1000} value={otherReason} onChange={e=>setOtherReason(e.target.value)} placeholder="Briefly state the reason"/></label>}
    </div>
    <details className="hrx-separation-notes"><summary>Add Notes (Optional)</summary><label className="hr2-field"><span>Personnel File Notes</span><textarea rows={3} maxLength={5000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add context for the personnel file, if needed"/></label></details>
   </fieldset>
   <div className="hrx-separation-effect"><b>What Happens When You Save</b><p>{text(person.name)} moves to Former Employees and their Command Post access ends immediately. Existing records stay in the personnel file.</p><p>Final pay, equipment, and benefit closeout become assigned follow-ups. They do not delay recording this departure.</p></div>
   {error&&<p className="hr2-error" role="alert">{error}</p>}
  </form>
 </Modal>;
}
