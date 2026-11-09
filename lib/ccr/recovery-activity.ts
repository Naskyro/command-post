import {AppError} from '../shared/errors.ts';
import {auditDay} from '../shared/audit-format.ts';

export const recoveryContactMethods=['Phone Call','Email','Text Message','In Person','Letter','Other'] as const;
export const recoveryContactOutcomes=['Reached Person','No Answer','Voicemail Left','Message Sent','Reply Received','Payment Discussed','Payment Promised','Disputed Claim','Declined Payment','Wrong Contact','Other'] as const;
export const recoveryAppointmentStatuses=['Needs Scheduling','Scheduled','Confirmed','Completed','No Show','Cancelled','Rescheduled'] as const;
export const recoverySettlementStatuses=['Draft','Proposed','Agreed','Declined','Cancelled'] as const;
export const recoveryTimeZones={'America/Chicago':'Central (Austin)','America/Denver':'Mountain','America/Los_Angeles':'Pacific','America/New_York':'Eastern','America/Phoenix':'Arizona','Pacific/Honolulu':'Hawaii','America/Anchorage':'Alaska','UTC':'UTC'} as const;
export type RecoveryContact={id:string;day:string;time:string;zone:string;direction:'Outgoing'|'Incoming';method:typeof recoveryContactMethods[number];person:string;contact:string;outcome:typeof recoveryContactOutcomes[number]|'';notes:string;reference:string};
export type RecoveryAppointment={id:string;day:string;time:string;zone:string;status:typeof recoveryAppointmentStatuses[number];person:string;contact:string;location:string;expectedAmountCents:number|null;notes:string;reference:string;rescheduledToId:string};
export type RecoverySettlement={status:typeof recoverySettlementStatuses[number];amountCents:number|null;currency:'USD';person:string;contact:string;proposedDay:string;agreedDay:string;dueDay:string;dueTime:string;zone:string;terms:string;agreementReference:string};
export type RecoveryActivity={contactLog?:RecoveryContact[];settlement?:RecoverySettlement;appointments?:RecoveryAppointment[]};

export function blankRecoveryContact():RecoveryContact{return {id:crypto.randomUUID(),day:'',time:'',zone:'',direction:'Outgoing',method:'Phone Call',person:'',contact:'',outcome:'',notes:'',reference:''};}
export function blankRecoveryAppointment():RecoveryAppointment{return {id:crypto.randomUUID(),day:'',time:'',zone:'',status:'Needs Scheduling',person:'',contact:'',location:'',expectedAmountCents:null,notes:'',reference:'',rescheduledToId:''};}
export function blankRecoverySettlement():RecoverySettlement{return {status:'Draft',amountCents:null,currency:'USD',person:'',contact:'',proposedDay:'',agreedDay:'',dueDay:'',dueTime:'',zone:'',terms:'',agreementReference:''};}
const fail=(message:string):never=>{throw new AppError(message);};
function object(value:unknown,label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail('Enter valid '+label+'.');return value as Record<string,unknown>;}
function text(value:unknown,max:number,label:string,multiline=false){if(value===null||value===undefined)return '';if(typeof value!=='string'||value.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value))return fail('Check the '+label+' text and length.');return value.trim();}
function one<T extends string>(value:unknown,values:readonly T[],label:string):T{if(!values.includes(value as T))return fail('Choose a listed '+label+'.');return value as T;}
function day(value:unknown,label:string){const d=text(value,10,label);if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!auditDay(d)))return fail('Enter a valid '+label+' date.');return d;}
function amount(value:unknown,label:string){if(value===null||value===undefined||value==='')return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>99999999999)return fail('Enter a valid '+label+' amount in cents.');return value;}
function timed(value:Record<string,unknown>,date:string,label:string,timeKey='time',zoneKey='zone'){
 const time=text(value[timeKey],5,label+' time'),zone=text(value[zoneKey],50,label+' time zone');
 if(time&&(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))return fail('Enter a valid '+label+' date and time, or leave an unknown time blank.');
 if(zone&&!Object.hasOwn(recoveryTimeZones,zone))return fail('Choose a listed time zone, or leave it unknown.');
 // Keep an explicitly stated local clock and an unknown zone as separate facts.
 // No UTC instant, reminder, or payment is inferred from this record.
 return {time,zone};
}
function list(value:unknown,label:string,max:number){if(!Array.isArray(value)||value.length>max)return fail('Use up to '+max+' '+label+' per recovery case.');return value;}
function rowId(value:unknown,seen:Set<string>,label:string){const id=text(value,64,label+' ID');if(!/^[\w-]{1,64}$/.test(id)||seen.has(id))return fail('Each '+label+' needs its own saved reference.');seen.add(id);return id;}

export function checkedRecoveryContacts(value:unknown):RecoveryContact[]{
 const seen=new Set<string>();
 return list(value,'contact entries',150).map(raw=>{
  const b=object(raw,'contact log details'),date=day(b.day,'contact'),clock=timed(b,date,'contact');
  const n:RecoveryContact={id:rowId(b.id,seen,'contact entry'),day:date,...clock,direction:one(b.direction??'Outgoing',['Outgoing','Incoming'],'contact direction'),method:one(b.method,recoveryContactMethods,'contact method'),person:text(b.person,180,'contact person'),contact:text(b.contact,240,'phone, email, or contact details'),outcome:one(b.outcome,recoveryContactOutcomes,'contact outcome'),notes:text(b.notes,3000,'contact notes',true),reference:text(b.reference,240,'contact evidence reference')};
  if(!n.day)return fail('Enter the date of each contact attempt or conversation.');
  if(!n.person&&!n.contact&&!n.reference)return fail('Identify the person, phone or email, or source reference for each contact entry.');
  if((n.method==='Other'||n.outcome==='Other')&&!n.notes)return fail('Describe the contact method or outcome in the notes.');
  return n;
 });
}

export function checkedRecoveryAppointments(value:unknown):RecoveryAppointment[]{
 const seen=new Set<string>();
 const rows:RecoveryAppointment[]=list(value,'payment appointments',100).map(raw=>{
  const b=object(raw,'payment appointment'),date=day(b.day,'appointment'),clock=timed(b,date,'appointment');
  const n:RecoveryAppointment={id:rowId(b.id,seen,'appointment'),day:date,...clock,status:one(b.status,recoveryAppointmentStatuses,'appointment status'),person:text(b.person,180,'appointment person'),contact:text(b.contact,240,'appointment contact'),location:text(b.location,400,'appointment location'),expectedAmountCents:amount(b.expectedAmountCents,'expected payment'),notes:text(b.notes,3000,'appointment notes',true),reference:text(b.reference,240,'appointment evidence reference'),rescheduledToId:text(b.rescheduledToId,64,'replacement appointment reference')};
  if(['Scheduled','Confirmed','Completed','No Show'].includes(n.status)&&!n.day)return fail('Enter the appointment date before marking it '+n.status.toLowerCase()+'.');
  if(!n.person&&!n.contact&&!n.reference)return fail('Identify the person, contact details, or source reference for the appointment.');
  if(['Completed','No Show','Cancelled','Rescheduled'].includes(n.status)&&!n.notes&&!n.reference)return fail('Add a note or source reference explaining the appointment outcome.');
  if(n.rescheduledToId&&!/^[\w-]{1,64}$/.test(n.rescheduledToId))return fail('Choose an existing replacement appointment.');
  return n;
 });
 const byId=new Map(rows.map(row=>[row.id,row]));
 for(const row of rows){
  if(!row.rescheduledToId)continue;
  if(row.status!=='Rescheduled'||row.rescheduledToId===row.id||!byId.has(row.rescheduledToId))return fail('A rescheduled appointment must link to a different appointment in this case.');
  const trail=new Set<string>([row.id]);let current:RecoveryAppointment|undefined=row;
  while(current?.rescheduledToId){if(trail.has(current.rescheduledToId))return fail('Appointment replacements cannot link back to an earlier appointment in the same chain.');trail.add(current.rescheduledToId);current=byId.get(current.rescheduledToId);}
 }
 return rows;
}

export function checkedRecoverySettlement(value:unknown):RecoverySettlement|undefined{
 if(value===undefined||value===null)return undefined;
 const b=object(value,'settlement terms'),dueDay=day(b.dueDay,'settlement deadline'),clock=timed(b,dueDay,'settlement deadline','dueTime');
 const n:RecoverySettlement={status:one(b.status,recoverySettlementStatuses,'settlement status'),amountCents:amount(b.amountCents,'settlement'),currency:one(b.currency??'USD',['USD'],'settlement currency'),person:text(b.person,180,'settlement person'),contact:text(b.contact,240,'settlement contact'),proposedDay:day(b.proposedDay,'proposal'),agreedDay:day(b.agreedDay,'agreement'),dueDay,dueTime:clock.time,zone:clock.zone,terms:text(b.terms,6000,'settlement terms',true),agreementReference:text(b.agreementReference,240,'agreement evidence reference')};
 if(['Proposed','Agreed'].includes(n.status)&&(n.amountCents===null||!n.terms))return fail('Record the proposed or agreed amount and settlement terms.');
 if(n.status==='Agreed'&&(!n.agreedDay||!n.agreementReference))return fail('An agreed settlement needs the agreement date and supporting document, message, or reference.');
 if(n.agreedDay&&n.proposedDay&&n.agreedDay<n.proposedDay)return fail('The agreement date cannot precede the proposal date.');
 if(n.status==='Agreed'&&n.dueDay&&n.dueDay<n.agreedDay)return fail('The settlement deadline cannot precede the agreement date.');
 return n;
}
