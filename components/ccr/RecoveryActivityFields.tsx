'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {CalendarClock,MessageSquare,Plus,Trash2,Handshake} from 'lucide-react';
import {auditDay} from '@/lib/shared/audit-format';
import {blankRecoveryAppointment,blankRecoveryContact,blankRecoverySettlement,recoveryAppointmentStatuses,recoveryContactMethods,recoveryContactOutcomes,recoverySettlementStatuses,recoveryTimeZones,type RecoveryActivity,type RecoveryAppointment,type RecoveryContact,type RecoverySettlement} from '@/lib/ccr/recovery-activity';

const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
function Amount({cents,onChange}:{cents:number|null;onChange:(cents:number|null)=>void}){
 const [text,setText]=useState(cents===null?'':(cents/100).toFixed(2));
 return <input inputMode="decimal" type="number" min="0" step="0.01" value={text} onChange={e=>{setText(e.target.value);onChange(e.target.value===''?null:Math.round(Number(e.target.value)*100));}}/>;
}
function Zone({value,onChange}:{value:string;onChange:(value:string)=>void}){return <label>Time zone<select value={value} onChange={e=>onChange(e.target.value)}><option value="">Unknown / Not stated</option>{Object.entries(recoveryTimeZones).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>;}
function When({day,time,zone}:{day:string;time:string;zone:string}){return <>{day?auditDay(day):'Date not recorded'}{time?' · '+time:' · Time not recorded'}{time?' · '+(recoveryTimeZones[zone as keyof typeof recoveryTimeZones]||'Time zone not stated'):''}</>;}
type Props={value:RecoveryActivity;onChange:(value:RecoveryActivity)=>void;files?:{id:string;name:string}[];initialSection?:'contact'|'appointment'};

export function RecoveryActivityFields({value,onChange,files=[],initialSection}:Props){
 const refs=useId(),contacts=value.contactLog||[],appointments=value.appointments||[],settlement=value.settlement,patch=(part:RecoveryActivity)=>onChange({...value,...part}),refProps={list:refs,maxLength:240};
 const contactSection=useRef<HTMLDetailsElement>(null),appointmentSection=useRef<HTMLDetailsElement>(null),shortcutInput=useRef<HTMLInputElement>(null),shortcut=useRef<{section:'contact'|'appointment';id:string;focused:boolean}|null>(null),shortcutStarted=useRef(false);
 const [shortcutMessage,setShortcutMessage]=useState('');
 useEffect(()=>{
  if(!initialSection||shortcutStarted.current)return;shortcutStarted.current=true;
  if(initialSection==='contact'){
   if(contacts.length>=150){contactSection.current?.scrollIntoView({block:'start'});setShortcutMessage('This case already has 150 contact entries. Review the existing contact log.');return;}
   const entry=blankRecoveryContact();shortcut.current={section:'contact',id:entry.id,focused:false};patch({contactLog:[...contacts,entry]});
  }else{
   if(appointments.length>=100){appointmentSection.current?.scrollIntoView({block:'start'});setShortcutMessage('This case already has 100 appointments. Review the existing appointments.');return;}
   const entry={...blankRecoveryAppointment(),status:'Scheduled' as const};shortcut.current={section:'appointment',id:entry.id,focused:false};patch({appointments:[...appointments,entry]});
  }
 },[initialSection]);
 useEffect(()=>{
  const pending=shortcut.current;if(!pending||pending.focused||!shortcutInput.current)return;
  const section=pending.section==='contact'?contactSection.current:appointmentSection.current;if(!section)return;
  section.open=true;shortcutInput.current.scrollIntoView({block:'center'});shortcutInput.current.focus({preventScroll:true});pending.focused=true;
 },[contacts.length,appointments.length]);
 function contact(id:string,part:Partial<RecoveryContact>){patch({contactLog:contacts.map(c=>c.id===id?{...c,...part}:c)});}
 function appointment(id:string,part:Partial<RecoveryAppointment>){patch({appointments:appointments.map(a=>a.id===id?{...a,...part}:a)});}
 function agreement(part:Partial<RecoverySettlement>){patch({settlement:{...(settlement||blankRecoverySettlement()),...part}});}
 return <section className="ccrr-formsection cb-activity"><h3><MessageSquare size={17}/> Contact, agreements & appointments</h3><datalist id={refs}>{files.map(file=><option key={file.id} value={file.name}/>)}</datalist>
 <p className="cb-help">Keep a dated record of contact attempts and what was agreed. A promise, settlement, or appointment does not record a payment.</p>
 {shortcutMessage&&<p className="cb-help" role="status">{shortcutMessage}</p>}
 <details ref={contactSection} className="cb-stage" open><summary>Contact log{contacts.length?' · '+contacts.length:''}</summary><div className="cb-ledger">
 {contacts.length===0&&<p className="cb-help">Add calls, emails, messages, letters, and in-person conversations as they happen.</p>}
 {contacts.map((entry,index)=><fieldset key={entry.id} className="ccrr-formsteps"><legend>Contact {index+1}</legend><div className="ccrr-fields">
 <label>Contact date<input ref={shortcut.current?.id===entry.id?shortcutInput:undefined} type="date" required value={entry.day} onChange={e=>contact(entry.id,{day:e.target.value})}/></label>
 <label>Time (if known)<input type="time" value={entry.time} onChange={e=>contact(entry.id,{time:e.target.value})}/></label>
 <Zone value={entry.zone} onChange={zone=>contact(entry.id,{zone})}/>
 <label>Direction<select value={entry.direction} onChange={e=>contact(entry.id,{direction:e.target.value as RecoveryContact['direction']})}><option>Outgoing</option><option>Incoming</option></select></label>
 <label>Contact method<select value={entry.method} onChange={e=>contact(entry.id,{method:e.target.value as RecoveryContact['method']})}>{recoveryContactMethods.map(method=><option key={method}>{method}</option>)}</select></label>
 <label>Outcome<select required value={entry.outcome} onChange={e=>contact(entry.id,{outcome:e.target.value as RecoveryContact['outcome']})}><option value="">Choose what happened</option>{recoveryContactOutcomes.map(outcome=><option key={outcome}>{outcome}</option>)}</select></label>
 <label>Person contacted<input maxLength={180} value={entry.person} onChange={e=>contact(entry.id,{person:e.target.value})}/></label>
 <label>Phone, email, or contact details<input maxLength={240} value={entry.contact} onChange={e=>contact(entry.id,{contact:e.target.value})}/></label>
 <label className="ccrr-span">What happened?<textarea rows={3} maxLength={3000} value={entry.notes} onChange={e=>contact(entry.id,{notes:e.target.value})} placeholder="Record what was said, the result, and the next step."/></label>
 <label className="ccrr-span">Message, call log, or evidence reference<input {...refProps} value={entry.reference} onChange={e=>contact(entry.id,{reference:e.target.value})}/></label>
 </div><button type="button" className="cb-remove" onClick={()=>patch({contactLog:contacts.filter(c=>c.id!==entry.id)})}><Trash2 size={14}/>Remove contact entry</button></fieldset>)}
 <button type="button" className="ccrr-button" disabled={contacts.length>=150} onClick={()=>patch({contactLog:[...contacts,blankRecoveryContact()]})}><Plus size={14}/>Add contact entry</button>
 </div></details>
 <details className="cb-stage" open={!!settlement}><summary>Settlement terms</summary><div className="cb-ledger">
 {!settlement?<><p className="cb-help">Record an offer or agreement here. Received payments belong in Recovery Payments & Additional Costs.</p><button type="button" className="ccrr-button" onClick={()=>patch({settlement:blankRecoverySettlement()})}><Plus size={14}/>Add settlement terms</button></>:<><div className="ccrr-fields">
 <label>Agreement status<select value={settlement.status} onChange={e=>agreement({status:e.target.value as RecoverySettlement['status']})}>{recoverySettlementStatuses.map(status=><option key={status}>{status}</option>)}</select></label>
 <label>{settlement.status==='Agreed'?'Agreed amount':'Proposed amount'} ($ USD)<Amount cents={settlement.amountCents} onChange={amountCents=>agreement({amountCents})}/></label>
 <label>Person involved<input maxLength={180} value={settlement.person} onChange={e=>agreement({person:e.target.value})}/></label>
 <label>Phone, email, or contact details<input maxLength={240} value={settlement.contact} onChange={e=>agreement({contact:e.target.value})}/></label>
 <label>Proposed on<input type="date" value={settlement.proposedDay} onChange={e=>agreement({proposedDay:e.target.value})}/></label>
 <label>Agreed on<input required={settlement.status==='Agreed'} type="date" value={settlement.agreedDay} onChange={e=>agreement({agreedDay:e.target.value})}/></label>
 <label>Payment deadline (if agreed)<input type="date" value={settlement.dueDay} onChange={e=>agreement({dueDay:e.target.value})}/></label>
 <label>Deadline time (if stated)<input type="time" value={settlement.dueTime} onChange={e=>agreement({dueTime:e.target.value})}/></label>
 <Zone value={settlement.zone} onChange={zone=>agreement({zone})}/>
 <label className="ccrr-span">Terms<textarea rows={4} required={['Proposed','Agreed'].includes(settlement.status)} maxLength={6000} value={settlement.terms} onChange={e=>agreement({terms:e.target.value})} placeholder="Amount, installments, payment method, deadline, and any conditions actually proposed or agreed."/></label>
 <label className="ccrr-span">Agreement document, message, or reference<input {...refProps} required={settlement.status==='Agreed'} value={settlement.agreementReference} onChange={e=>agreement({agreementReference:e.target.value})}/></label>
 </div><p className="cb-help">This records the terms only. It does not change the disputed principal, create a receipt, or mark the case recovered. If the agreement falls through, update its status and add the reason to the case note.</p></>}
 </div></details>
 <details ref={appointmentSection} className="cb-stage" open={appointments.length>0?true:undefined}><summary>Yard payment appointments{appointments.length?' · '+appointments.length:''}</summary><div className="cb-ledger">
 <p className="cb-help">Record where and when the person plans to bring payment, then update whether they attended. Use Record Payment for money actually received.</p>
 {appointments.map((entry,index)=><fieldset key={entry.id} className="ccrr-formsteps"><legend>Appointment {index+1}</legend><div className="ccrr-fields">
 <label>Appointment status<select value={entry.status} onChange={e=>appointment(entry.id,{status:e.target.value as RecoveryAppointment['status'],...(e.target.value!=='Rescheduled'?{rescheduledToId:''}:{})})}>{recoveryAppointmentStatuses.map(status=><option key={status}>{status}</option>)}</select></label>
 <label>Appointment date<input ref={shortcut.current?.id===entry.id?shortcutInput:undefined} required={['Scheduled','Confirmed','Completed','No Show'].includes(entry.status)} type="date" value={entry.day} onChange={e=>appointment(entry.id,{day:e.target.value})}/></label>
 <label>Time (if known)<input type="time" value={entry.time} onChange={e=>appointment(entry.id,{time:e.target.value})}/></label>
 <Zone value={entry.zone} onChange={zone=>appointment(entry.id,{zone})}/>
 <label>Person bringing payment<input maxLength={180} value={entry.person} onChange={e=>appointment(entry.id,{person:e.target.value})}/></label>
 <label>Phone, email, or contact details<input maxLength={240} value={entry.contact} onChange={e=>appointment(entry.id,{contact:e.target.value})}/></label>
 <label className="ccrr-span">Yard or meeting location<input maxLength={400} value={entry.location} onChange={e=>appointment(entry.id,{location:e.target.value})} placeholder="Yard name and address"/></label>
 <label>Expected payment ($ USD)<Amount cents={entry.expectedAmountCents} onChange={expectedAmountCents=>appointment(entry.id,{expectedAmountCents})}/><small>For planning only; not a payment receipt.</small></label>
 {entry.status==='Rescheduled'&&<label>Replacement appointment (if recorded)<select value={entry.rescheduledToId} onChange={e=>appointment(entry.id,{rescheduledToId:e.target.value})}><option value="">Not linked yet</option>{appointments.filter(a=>a.id!==entry.id).map(a=><option key={a.id} value={a.id}>{a.day?auditDay(a.day):'Date pending'}{a.time?' · '+a.time:''} · {a.person||a.contact||a.status}</option>)}</select></label>}
 <label className="ccrr-span">Appointment notes<textarea rows={3} maxLength={3000} value={entry.notes} onChange={e=>appointment(entry.id,{notes:e.target.value})} placeholder="Arrival instructions, confirmation, cancellation reason, or what happened."/></label>
 <label className="ccrr-span">Confirmation or evidence reference<input {...refProps} value={entry.reference} onChange={e=>appointment(entry.id,{reference:e.target.value})}/></label>
 </div><button type="button" className="cb-remove" onClick={()=>patch({appointments:appointments.filter(a=>a.id!==entry.id).map(a=>a.rescheduledToId===entry.id?{...a,rescheduledToId:''}:a)})}><Trash2 size={14}/>Remove appointment</button></fieldset>)}
 <button type="button" className="ccrr-button" disabled={appointments.length>=100} onClick={()=>patch({appointments:[...appointments,blankRecoveryAppointment()]})}><Plus size={14}/>Add payment appointment</button>
 </div></details>
 </section>;
}

export function RecoveryActivityReadout({value}:{value:RecoveryActivity}){
 const contacts=[...(value.contactLog||[])].sort((a,b)=>b.day.localeCompare(a.day)||b.time.localeCompare(a.time)),appointments=value.appointments||[],settlement=value.settlement;
 if(!contacts.length&&!appointments.length&&!settlement)return null;
 return <section className="ccrr-block cb-activity-readout"><header><h3><MessageSquare size={17}/> Recovery activity</h3></header>
 {!!contacts.length&&<section className="ccrr-block"><h3>Contact log</h3><ul className="ccrr-events">{contacts.map(entry=><li key={entry.id}><i><MessageSquare size={14}/></i><div><header><strong>{entry.method} · {entry.outcome}</strong><time><When day={entry.day} time={entry.time} zone={entry.zone}/></time></header><small>{[entry.direction,entry.person,entry.contact].filter(Boolean).join(' · ')}</small>{entry.notes&&<p>{entry.notes}</p>}{entry.reference&&<small>Reference: {entry.reference}</small>}</div></li>)}</ul></section>}
 {settlement&&<section className="ccrr-block"><header><h3><Handshake size={16}/> Settlement terms</h3><span>{settlement.status}</span></header><dl className="ccrr-meta">
 <div><dt>{settlement.status==='Agreed'?'Agreed amount':'Proposed amount'}</dt><dd>{settlement.amountCents===null?'Not recorded':money(settlement.amountCents)}</dd></div>
 <div><dt>Person / contact</dt><dd>{[settlement.person,settlement.contact].filter(Boolean).join(' · ')||'Not recorded'}</dd></div>
 {settlement.proposedDay&&<div><dt>Proposed on</dt><dd>{auditDay(settlement.proposedDay)}</dd></div>}{settlement.agreedDay&&<div><dt>Agreed on</dt><dd>{auditDay(settlement.agreedDay)}</dd></div>}
 {(settlement.dueDay||settlement.dueTime)&&<div><dt>Payment deadline</dt><dd><When day={settlement.dueDay} time={settlement.dueTime} zone={settlement.zone}/></dd></div>}
 {settlement.agreementReference&&<div className="ccrr-span"><dt>Agreement reference</dt><dd>{settlement.agreementReference}</dd></div>}</dl>
 {settlement.terms&&<p className="cb-help" style={{whiteSpace:'pre-wrap'}}>{settlement.terms}</p>}<p className="cb-help">Agreement amount only. Actual received payments and posted credits are shown in the payment ledger.</p>
 </section>}
 {!!appointments.length&&<section className="ccrr-block"><header><h3><CalendarClock size={16}/> Yard payment appointments</h3></header><ul className="ccrr-events">{appointments.map(entry=>{const replacement=appointments.find(a=>a.id===entry.rescheduledToId);return <li key={entry.id}><i><CalendarClock size={14}/></i><div><header><strong>{entry.status} · {entry.person||entry.contact||'Payment appointment'}</strong><time><When day={entry.day} time={entry.time} zone={entry.zone}/></time></header>{entry.contact&&<small>{entry.contact}</small>}{entry.location&&<small>{entry.location}</small>}{entry.expectedAmountCents!==null&&<small>Expected: {money(entry.expectedAmountCents)} · Payment receipt not implied</small>}{entry.notes&&<p>{entry.notes}</p>}{entry.reference&&<small>Reference: {entry.reference}</small>}{replacement&&<small>Rescheduled to: <When day={replacement.day} time={replacement.time} zone={replacement.zone}/></small>}</div></li>;})}</ul><p className="cb-help">Completed records attendance. Record a separate payment entry for money received.</p></section>}
 </section>;
}
