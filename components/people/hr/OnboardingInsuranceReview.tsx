'use client';
import type {Dispatch,SetStateAction} from 'react';
import type {HrRecord} from '@/lib/hr/model';
import {DocumentLink,Field,UploadPanel,text} from './ui';

type Props={personId:string;recordId?:string;documents:HrRecord[];review:Record<string,unknown>;onChange:Dispatch<SetStateAction<Record<string,unknown>>>;ensureSaved:()=>Promise<HrRecord>;onChanged:()=>Promise<void>;disabled:boolean};
export default function OnboardingInsuranceReview({personId,recordId,documents,review,onChange,ensureSaved,onChanged,disabled}:Props){
 const update=(key:string,value:unknown)=>onChange(previous=>({...previous,[key]:value}));
 const evidence=documents.filter(row=>row.data.category==='Driver Insurance Confirmation');
 return <>
  <p className="hr2-callout">The supervisor must add the driver through the insurer or agent and record the confirmation here before approving their start.</p>
  <div className="hr2-form">
   <Field field={{key:'insuranceCarrier',label:'Insurance Carrier',required:true}} value={review.insuranceCarrier} onChange={value=>update('insuranceCarrier',value)} disabled={disabled}/>
   <Field field={{key:'insurancePolicyNumber',label:'Commercial Auto Policy Number',required:true}} value={review.insurancePolicyNumber} onChange={value=>update('insurancePolicyNumber',value)} disabled={disabled}/>
   <Field field={{key:'insuranceEffectiveDate',label:'Driver Coverage Effective Date',type:'date',required:true}} value={review.insuranceEffectiveDate} onChange={value=>update('insuranceEffectiveDate',value)} disabled={disabled}/>
   <Field field={{key:'insuranceConfirmedOn',label:'Insurer / Agent Confirmation Date',type:'date',required:true}} value={review.insuranceConfirmedOn} onChange={value=>update('insuranceConfirmedOn',value)} disabled={disabled}/>
  </div>
  <Field field={{key:'insuranceConfirmationReference',label:'Confirmation Reference',multiline:true,required:true,hint:'Insurer or agent name, endorsement or confirmation number, and confirmation email/date.'}} value={review.insuranceConfirmationReference} onChange={value=>update('insuranceConfirmationReference',value)} disabled={disabled}/>
  <details><summary>Attach Insurance Confirmation</summary>
   <UploadPanel personId={personId} parentId={recordId} category="Driver Insurance Confirmation" disabled={disabled} beforeUpload={async()=>({parentId:(await ensureSaved()).id})} onUploaded={async document=>{update('insuranceDocumentId',document.id);await onChanged();}}/>
   {!!evidence.length&&<label className="hr2-field"><span>Supporting Document</span><select disabled={disabled} value={text(review.insuranceDocumentId)} onChange={event=>update('insuranceDocumentId',event.target.value)}><option value="">Use Recorded Confirmation Reference</option>{evidence.map(document=><option key={document.id} value={document.id}>{text(document.data.fileName||document.data.name||document.data.filename)}</option>)}</select></label>}
   {evidence.filter(document=>document.id===review.insuranceDocumentId).map(document=><DocumentLink key={document.id} record={document}/>)}
  </details>
  <Field field={{key:'insuranceConfirmed',label:'I Confirm the Insurer or Agent Added This Driver and Coverage Is Effective',type:'checkbox'}} value={review.insuranceConfirmed} onChange={value=>update('insuranceConfirmed',value===true)} disabled={disabled}/>
 </>;
}
