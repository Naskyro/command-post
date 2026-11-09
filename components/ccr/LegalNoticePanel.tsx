'use client';
import {useId} from 'react';
import {FileText,Mail,Plus,Trash2} from 'lucide-react';
import {auditDay} from '@/lib/shared/audit-format';
import {blankLegalMailing,legalDirections,legalMailStages,legalMailingCost,legalStages,legalTypes,type LegalAccountChoice,type LegalMailing,type LegalNotice} from '@/lib/ccr/legal-notice';
import ClaimChoicePicker from './ClaimChoicePicker';
import './legal-notice.css';

const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const shownDay=(value:string)=>auditDay(value)||'Not recorded';
const sourceZones=['America/Chicago','America/New_York','America/Denver','America/Los_Angeles','America/Phoenix','UTC'];
type Props={value:LegalNotice;onChange:(notice:LegalNotice)=>void;files:{id:string;name:string}[];accounts?:LegalAccountChoice[]};
export function LegalNoticeFields({value:n,onChange,files,accounts=[]}:Props){
 const refs=useId(),patch=(part:Partial<LegalNotice>)=>onChange({...n,...part}),refProps={list:refs,maxLength:240};
 function changeMail(id:string,part:Partial<LegalMailing>){patch({mailings:n.mailings.map(m=>m.id===id?{...m,...part}:m)});}
 return <section className="ccrr-formsection legal-editor"><h3><FileText size={17}/> Legal notice details</h3><datalist id={refs}>{files.map(f=><option key={f.id} value={f.name}/>)}</datalist>
 <p className="legal-help">Keep the letter, follow-up, and mailing evidence together. Record what the documents say and update the matter as it progresses.</p>
 <details open className="legal-section"><summary>Notice and people involved</summary><div className="ccrr-fields">
 <label>Direction<select value={n.direction} onChange={e=>patch({direction:e.target.value as LegalNotice['direction'],...(e.target.value==='Received'&&n.stage==='Draft'?{stage:'Open' as const}:{})})}>{legalDirections.map(x=><option key={x} value={x}>{x==='Sent'?'Sent by us':'Received by us'}</option>)}</select></label>
 <label>Notice type<select value={n.type} onChange={e=>patch({type:e.target.value as LegalNotice['type']})}>{legalTypes.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Current stage<select value={n.stage} onChange={e=>patch({stage:e.target.value as LegalNotice['stage']})}>{legalStages.filter(s=>n.direction!=='Received'||s!=='Draft').map(x=><option key={x}>{x}</option>)}</select></label>
 <label>{n.direction==='Sent'?'Recipient name(s)':'Sender name(s)'}<input required maxLength={300} value={n.otherParty} onChange={e=>patch({otherParty:e.target.value})}/></label>
 <label>Organization<input maxLength={240} value={n.organization} onChange={e=>patch({organization:e.target.value})}/></label>
 <label>Contact email<input type="email" maxLength={254} value={n.email} onChange={e=>patch({email:e.target.value})}/></label>
 <label>Contact phone<input type="tel" maxLength={80} value={n.phone} onChange={e=>patch({phone:e.target.value})}/></label>
 <label className="ccrr-span">Mailing address<textarea rows={2} maxLength={1000} value={n.address} onChange={e=>patch({address:e.target.value})}/></label>
 <div className="ccrr-span"><ClaimChoicePicker label="Related account or property" value={n.accountId} options={accounts} selectedLabel={n.accountName} onChange={accountId=>patch({accountId,accountName:accounts.find(a=>a.id===accountId)?.name||''})}/></div>
 <label className="ccrr-span">Related court, claim, or recovery reference<input maxLength={300} value={n.relatedReference} onChange={e=>patch({relatedReference:e.target.value})} placeholder="Case number or existing record reference, if related"/></label>
 <label className="ccrr-span">What is the matter about?<textarea rows={4} maxLength={6000} value={n.summary} onChange={e=>patch({summary:e.target.value})} placeholder="Describe the issue, what each party is requesting, and what is known so far."/></label>
 <label>Assigned counsel<input maxLength={240} value={n.counsel} onChange={e=>patch({counsel:e.target.value})}/></label>
 <label>Counsel contact<input maxLength={400} value={n.counselContact} onChange={e=>patch({counselContact:e.target.value})}/></label>
 </div></details>
 <details open className="legal-section"><summary>Dates and follow-up</summary><div className="ccrr-fields">
 <label>Date on letter<input type="date" value={n.documentOn} onChange={e=>patch({documentOn:e.target.value})}/></label>
 <label>{n.direction==='Sent'?'Sent on (if confirmed)':'Received on'}<input type="date" value={n.direction==='Sent'?n.sentOn:n.receivedOn} onChange={e=>patch(n.direction==='Sent'?{sentOn:e.target.value}:{receivedOn:e.target.value})}/></label>
 <label>Response deadline (if stated)<input type="date" value={n.responseDue} onChange={e=>patch({responseDue:e.target.value})}/></label>
 {n.responseDue&&<label>Source of deadline<input {...refProps} required value={n.deadlineRef} onChange={e=>patch({deadlineRef:e.target.value})} placeholder="Letter or other source that states the date"/></label>}
 <label>Response received on<input type="date" required={n.stage==='Response Received'} value={n.responseOn} onChange={e=>patch({responseOn:e.target.value})}/></label>
 <label>Response document or message<input {...refProps} required={!!n.responseOn||n.stage==='Response Received'} value={n.responseRef} onChange={e=>patch({responseRef:e.target.value})}/></label>
 {(n.stage==='Resolved'||n.resolvedOn||n.resolutionRef)&&<><label>Resolved on<input type="date" required={n.stage==='Resolved'} value={n.resolvedOn} onChange={e=>patch({resolvedOn:e.target.value})}/></label><label>Resolution evidence or reference<input {...refProps} required={n.stage==='Resolved'||!!n.resolvedOn} value={n.resolutionRef} onChange={e=>patch({resolutionRef:e.target.value})}/></label></>}
 <p className="legal-help ccrr-span">Leave dates blank when they are unknown. Enter a response deadline only when its source states one.</p>
 </div></details>
 <details className="legal-section" open={n.mailings.length>0?true:undefined}><summary>Mailing records{n.mailings.length?' · '+n.mailings.length:''}</summary><div className="legal-mailings">
 <p className="legal-help">Add each mailing or recipient separately when the evidence identifies them. A submission certificate records the request to mail; attach delivery proof when it becomes available.</p>
 {n.mailings.map((m,index)=>{const update=(p:Partial<LegalMailing>)=>changeMail(m.id,p);return <fieldset className="legal-mailing" key={m.id}><legend>Mailing {index+1}</legend><div className="ccrr-fields">
 <label>Recipient<input required maxLength={240} value={m.recipient} onChange={e=>update({recipient:e.target.value})}/></label>
 <label>Mailing provider<input maxLength={100} value={m.provider} onChange={e=>update({provider:e.target.value})} placeholder="e.g., DocuPost or USPS"/></label>
 <label className="ccrr-span">Recipient address<textarea rows={2} maxLength={1000} value={m.address} onChange={e=>update({address:e.target.value})}/></label>
 <label>Mailing status<select value={m.stage} onChange={e=>update({stage:e.target.value as LegalMailing['stage']})}>{legalMailStages.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Tracking number<input maxLength={100} value={m.tracking} onChange={e=>update({tracking:e.target.value})}/></label>
 <label>Submitted for mailing on<input type="date" required={m.stage==='Submitted for Mailing'} value={m.submittedOn} onChange={e=>update({submittedOn:e.target.value})}/></label>
 <label>Submission time (if shown)<input type="time" value={m.submittedTime} onChange={e=>update({submittedTime:e.target.value})}/></label>
 <label>Provider reported production on<input type="date" required={m.stage==='Production Reported'} value={m.productionOn} onChange={e=>update({productionOn:e.target.value})}/></label>
 <label>Production time (if shown)<input type="time" value={m.productionTime} onChange={e=>update({productionTime:e.target.value})}/></label>
 <label>Source time zone<select value={m.timeZone} onChange={e=>update({timeZone:e.target.value})}><option value="">Not stated</option>{sourceZones.map(z=><option key={z}>{z}</option>)}{m.timeZone&&!sourceZones.includes(m.timeZone)&&<option>{m.timeZone}</option>}</select></label>
 <label>Confirmed mailing date<input type="date" required={m.stage==='Mailed'} value={m.mailedOn} onChange={e=>update({mailedOn:e.target.value})}/></label>
 <label className="ccrr-span">Submission or mailing evidence<input {...refProps} required={['Submitted for Mailing','Production Reported','Mailed'].includes(m.stage)} value={m.sourceRef} onChange={e=>update({sourceRef:e.target.value})} placeholder="Certificate, mailing receipt, or document name"/></label>
 <label>Delivery or return date<input type="date" required={['Delivered','Returned or Unclaimed'].includes(m.stage)} value={m.deliveryOn} onChange={e=>update({deliveryOn:e.target.value})}/></label>
 <label>Delivery or return proof<input {...refProps} required={!!m.deliveryOn||['Delivered','Returned or Unclaimed'].includes(m.stage)} value={m.deliveryRef} onChange={e=>update({deliveryRef:e.target.value})} placeholder="USPS delivery record or return receipt"/></label>
 <label>Actual amount billed ($)<input type="number" min="0" step="0.01" defaultValue={m.billedCents===null?'':(m.billedCents/100).toFixed(2)} onChange={e=>update({billedCents:e.target.value===''?null:Math.round(Number(e.target.value)*100)})}/><small>Use the historical charge on the receipt.</small></label>
 <label>Billed on<input type="date" required={m.billedCents!==null} value={m.billedOn} onChange={e=>update({billedOn:e.target.value})}/></label>
 <label className="ccrr-span">Billing receipt or source<input {...refProps} required={m.billedCents!==null} value={m.billedRef} onChange={e=>update({billedRef:e.target.value})}/></label>
 <label className="ccrr-span">Mailing notes<textarea rows={2} maxLength={2400} value={m.notes} onChange={e=>update({notes:e.target.value})}/></label>
 </div><button type="button" className="legal-remove" onClick={()=>patch({mailings:n.mailings.filter(x=>x.id!==m.id)})}><Trash2 size={14}/>Remove mailing record</button></fieldset>;})}
 <button type="button" className="ccrr-button" disabled={n.mailings.length>=40} onClick={()=>patch({mailings:[...n.mailings,{...blankLegalMailing(),recipient:n.direction==='Sent'?n.otherParty:'',address:n.direction==='Sent'?n.address:''}]})}><Plus size={14}/>Add mailing record</button>
 </div></details>
 </section>;
}

function localStamp(day:string,time:string,zone:string){return [auditDay(day),time,zone||(time?'Time zone not stated':'')].filter(Boolean).join(' · ');}
export function LegalNoticeReadout({value:n}:{value:LegalNotice}){
 return <section className="ccrr-block legal-readout"><header><h3><FileText size={17}/> Legal notice</h3></header><dl className="ccrr-meta">
 <div><dt>Direction</dt><dd>{n.direction==='Sent'?'Sent by us':'Received by us'}</dd></div><div><dt>Notice type</dt><dd>{n.type}</dd></div><div><dt>Current stage</dt><dd>{n.stage}</dd></div>
 <div><dt>{n.direction==='Sent'?'Recipient':'Sender'}</dt><dd>{n.otherParty}</dd>{n.organization&&<small>{n.organization}</small>}</div>
 {n.address&&<div className="ccrr-span"><dt>Address</dt><dd className="legal-prose">{n.address}</dd></div>}
 {(n.email||n.phone)&&<div><dt>Contact</dt><dd>{[n.email,n.phone].filter(Boolean).join(' · ')}</dd></div>}
 <div><dt>Letter date</dt><dd>{shownDay(n.documentOn)}</dd></div>{n.sentOn&&<div><dt>Sent on</dt><dd>{shownDay(n.sentOn)}</dd></div>}{n.receivedOn&&<div><dt>Received on</dt><dd>{shownDay(n.receivedOn)}</dd></div>}
 <div><dt>Response deadline</dt><dd>{shownDay(n.responseDue)}</dd>{n.deadlineRef&&<small>{n.deadlineRef}</small>}</div>
 {n.accountId&&<div><dt>Related account</dt><dd>{n.accountName||'Linked account'}</dd></div>}{n.relatedReference&&<div><dt>Related case reference</dt><dd>{n.relatedReference}</dd></div>}
 {(n.counsel||n.counselContact)&&<div><dt>Counsel</dt><dd>{n.counsel||'Not assigned'}</dd>{n.counselContact&&<small>{n.counselContact}</small>}</div>}
 {(n.responseOn||n.responseRef)&&<div><dt>Response received</dt><dd>{shownDay(n.responseOn)}</dd><small>{n.responseRef}</small></div>}
 {(n.resolvedOn||n.resolutionRef)&&<div><dt>Resolution</dt><dd>{shownDay(n.resolvedOn)}</dd><small>{n.resolutionRef}</small></div>}
 </dl>{n.summary&&<div className="legal-summary"><h4>Matter summary</h4><p className="legal-prose">{n.summary}</p></div>}
 {!!n.mailings.length&&<div className="legal-mailings"><h4><Mail size={16}/> Mailing records</h4>{n.mailings.map(m=><article className="legal-mail-card" key={m.id}><header><strong>{m.recipient}</strong><span>{m.stage}</span></header>{m.address&&<p className="legal-prose">{m.address}</p>}<dl className="ccrr-meta">
 <div><dt>Provider / tracking</dt><dd>{[m.provider,m.tracking].filter(Boolean).join(' · ')||'Not recorded'}</dd></div>
 {m.submittedOn&&<div><dt>Submission reported</dt><dd>{localStamp(m.submittedOn,m.submittedTime,m.timeZone)}</dd></div>}
 {m.productionOn&&<div><dt>Production reported</dt><dd>{localStamp(m.productionOn,m.productionTime,m.timeZone)}</dd></div>}
 {m.mailedOn&&<div><dt>Confirmed mailing</dt><dd>{shownDay(m.mailedOn)}</dd></div>}
 <div><dt>Delivery or return proof</dt><dd>{m.deliveryOn?shownDay(m.deliveryOn):'Not recorded'}</dd>{m.deliveryRef&&<small>{m.deliveryRef}</small>}</div>
 {m.sourceRef&&<div className="ccrr-span"><dt>Mailing source</dt><dd>{m.sourceRef}</dd></div>}
 {m.billedCents!==null&&<div><dt>Actual billed mailing cost</dt><dd>{money(m.billedCents)}</dd><small>{[auditDay(m.billedOn),m.billedRef].filter(Boolean).join(' · ')}</small></div>}
 </dl>{m.notes&&<p className="legal-prose">{m.notes}</p>}</article>)}<p className="legal-cost-total">Recorded mailing costs <strong>{money(legalMailingCost(n))}</strong></p></div>}
 </section>;
}
