import type {RegisterRecord} from './register-model.ts';
import {blankChargeback,chargebackFinancialSummary,chargebackRecoveryQueue,type Chargeback} from './chargeback.ts';
import type {RecoveryAppointment} from './recovery-activity.ts';
import {auditDay} from '../shared/audit-format.ts';

export const recoveryFilters=['All','Find Release','Prepare Demand','Awaiting Delivery / Payment','Appointments','Court Review','Final Loss'] as const;
export const recoveryMetricFilters=['Bank Losses','Recovered','Active Recovery','Final Loss','Court Review','Pending Bank Review','Bank Credits To Verify','Unverified'] as const;
export type RecoveryQueueFilter=typeof recoveryFilters[number];
export type RecoveryMetricFilter=typeof recoveryMetricFilters[number];
export type RecoveryFilter=RecoveryQueueFilter|RecoveryMetricFilter;
export const recoveryFilterMeta:Record<RecoveryFilter,{label:string;description:string}>={
 'All':{label:'All recovery cases',description:'Every case in the recovery directory, including other recovery matters.'},
 'Find Release':{label:'Find release records',description:'Match the payment to its Towbook release, then confirm the customer and mailing address.'},
 'Prepare Demand':{label:'Prepare certified demands',description:'Review the release details and mailing address. Returned mail is included for another review.'},
 'Awaiting Delivery / Payment':{label:'Awaiting delivery or payment',description:'Check mailing progress, record replies, and follow up on the outstanding balance.'},
 'Appointments':{label:'Payment appointments',description:'Cases with an appointment to schedule, attend, or confirm. An appointment is not a recorded payment.'},
 'Court Review':{label:'Court review',description:'Verified cases explicitly marked for court review or filing with a remaining balance.'},
 'Final Loss':{label:'Final losses',description:'Cases explicitly marked as final losses after recovery efforts ended.'},
 'Bank Losses':{label:'Bank losses',description:'Original disputes decided in the cardholder’s favor, including cases later recovered.'},
 'Recovered':{label:'Recovery recorded',description:'Cases with recorded customer payments, processor credits, or recovery refunds.'},
 'Active Recovery':{label:'Active recovery',description:'Verified cases with an outstanding balance still being pursued.'},
 'Pending Bank Review':{label:'Pending bank review',description:'Cases with a processor notice and a bank outcome still pending.'},
 'Bank Credits To Verify':{label:'Bank credits to verify',description:'Bank wins whose full processor credit has not been recorded.'},
 'Unverified':{label:'Unverified cases',description:'Cases awaiting a verified processor match. Their balances are separate from active recovery.'},
};
export type RecoveryMetric={cents:number;count:number;unknownCount:number};
export type RecoveryAppointmentItem={record:RegisterRecord;appointment:RecoveryAppointment;timing:'Past Date'|'Today'|'Upcoming'|'Date Needed'};
const isChargeback=(row:RegisterRecord)=>row.section==='recovery'&&row.category==='Chargeback';
const principal=(row:RegisterRecord)=>typeof row.amountCents==='number'&&Number.isSafeInteger(row.amountCents)&&row.amountCents>=0?row.amountCents:null;
const details=(row:RegisterRecord):Chargeback=>row.chargeback||blankChargeback();
const hasPendingAppointment=(c:Chargeback)=>Boolean(c.appointments?.some(a=>['Needs Scheduling','Scheduled','Confirmed'].includes(a.status)));
function metric():RecoveryMetric{return {cents:0,count:0,unknownCount:0};}
function add(target:RecoveryMetric,cents:number|null){target.count++;if(cents===null||!Number.isSafeInteger(cents))target.unknownCount++;else target.cents+=cents;}
function uniqueRows(rows:RegisterRecord[]){const current=new Map<string,RegisterRecord>();for(const row of rows){const old=current.get(row.id);if(!old||row.version>old.version)current.set(row.id,row);}return [...current.values()];}

/** The cards and their case lists share these exact membership rules. */
function financialMembership(c:Chargeback,f:ReturnType<typeof chargebackFinancialSummary>):Record<RecoveryMetricFilter,boolean>{
 return {
  'Bank Losses':c.decision==='Cardholder Prevailed',
  'Recovered':f.receiptStatus==='Receipts Recorded',
  'Active Recovery':f.activeRecovery&&!f.unverified,
  'Final Loss':f.finalLoss,
  'Court Review':f.courtReview&&!f.unverified,
  'Pending Bank Review':f.pendingBankReview,
  'Bank Credits To Verify':f.bankWinAwaitingCredit,
  'Unverified':f.unverified,
 };
}

/** All preserves other recovery categories; metric and work filters select chargebacks. */
export function matchesRecoveryFilter(row:RegisterRecord,filter:RecoveryFilter):boolean{
 if(row.section!=='recovery')return false;
 if(filter==='All')return true;
 if(!isChargeback(row))return false;
 const c=details(row),amount=principal(row),membership=financialMembership(c,chargebackFinancialSummary(c,amount,row.status));
 if(Object.hasOwn(membership,filter))return membership[filter as RecoveryMetricFilter];
 const queue=chargebackRecoveryQueue(c,amount,row.status);
 switch(filter){
  case 'Find Release':return queue?.stage==='Find Release Record';
  case 'Prepare Demand':return queue?.stage==='Prepare Certified Demand'||queue?.stage==='Review Returned Mail';
  case 'Awaiting Delivery / Payment':return queue?.stage==='Awaiting Demand Delivery'||queue?.stage==='Awaiting Payment';
  case 'Appointments':return row.status!=='Closed'&&c.disposition!=='Final Loss'&&hasPendingAppointment(c);
  default:return false;
 }
}

/** De-duplicate before filtering so an old version cannot appear in a former stage. */
export function filterRecoveryRecords(rows:RegisterRecord[],filter:RecoveryFilter):RegisterRecord[]{
 return uniqueRows(rows).filter(row=>matchesRecoveryFilter(row,filter));
}

export function recoveryDashboardStats(rows:RegisterRecord[],today:string){
 const unique=filterRecoveryRecords(rows,'All'),cases=unique.filter(isChargeback),bankLosses=metric(),netRecovery=metric(),activeRecovery=metric(),finalLosses=metric(),court=metric(),pendingBankReview=metric(),bankWinsAwaitingCredit=metric(),unverified=metric(),unclassifiedClosed=metric();
 const queueCounts=Object.fromEntries(recoveryFilters.map(filter=>[filter,unique.filter(row=>matchesRecoveryFilter(row,filter)).length])) as Record<RecoveryQueueFilter,number>;
 const appointments:RecoveryAppointmentItem[]=[],closedBalanceCases:RegisterRecord[]=[];let noReceiptsCount=0,customerPaymentsCents=0,postedProcessorCreditsCents=0,recoveryRefundsCents=0;
 for(const row of cases){
  const c=details(row),amount=principal(row),f=chargebackFinancialSummary(c,amount,row.status),membership=financialMembership(c,f);
  if(membership['Bank Losses'])add(bankLosses,f.bankLossCents);
  if(membership.Recovered)add(netRecovery,f.netRecoveryCents);else noReceiptsCount++;
  customerPaymentsCents+=f.customerPaymentsCents;postedProcessorCreditsCents+=f.postedProcessorCreditsCents;recoveryRefundsCents+=f.recoveryRefundsCents;
  if(membership['Active Recovery'])add(activeRecovery,f.verifiedActiveOutstandingCents);
  if(membership['Final Loss'])add(finalLosses,f.finalLossCents);
  if(membership['Court Review'])add(court,f.courtReviewCents);
  if(membership['Pending Bank Review'])add(pendingBankReview,f.pendingPrincipalCents);
  if(membership['Bank Credits To Verify'])add(bankWinsAwaitingCredit,amount===null?null:Math.max(0,amount-f.postedProcessorCreditsCents));
  // A legacy notice can be the same debt as a processor case. Keep its remaining
  // principal and selected costs out of the verified active total until matched.
  if(membership.Unverified)add(unverified,f.activeRecovery?f.unverifiedActiveOutstandingCents:f.unverifiedPrincipalCents);
  if(f.unclassifiedClosed){add(unclassifiedClosed,f.unclassifiedClosedCents);closedBalanceCases.push(row);}
  if(row.status==='Closed'||c.disposition==='Final Loss')continue;
  for(const appointment of c.appointments||[]){
   if(!['Needs Scheduling','Scheduled','Confirmed'].includes(appointment.status))continue;
   const date=/^\d{4}-\d{2}-\d{2}$/.test(appointment.day)&&auditDay(appointment.day)?appointment.day:'';
   const timing:RecoveryAppointmentItem['timing']=!date?'Date Needed':date<today?'Past Date':date===today?'Today':'Upcoming';appointments.push({record:row,appointment,timing});
  }
 }
 const order={'Past Date':0,Today:1,Upcoming:2,'Date Needed':3};
 appointments.sort((a,b)=>order[a.timing]-order[b.timing]||a.appointment.day.localeCompare(b.appointment.day)||a.appointment.time.localeCompare(b.appointment.time)||a.record.title.localeCompare(b.record.title)||a.appointment.id.localeCompare(b.appointment.id));
 return {caseCount:cases.length,bankLosses,netRecovery,activeRecovery,finalLosses,courtReview:court,pendingBankReview,bankWinsAwaitingCredit,unverified,unclassifiedClosed,closedBalanceCases,noReceiptsCount,customerPaymentsCents,postedProcessorCreditsCents,recoveryRefundsCents,queueCounts,appointments};
}
