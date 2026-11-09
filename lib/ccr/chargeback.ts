import {AppError} from '../shared/errors.ts';
import {auditDay} from '../shared/audit-format.ts';
import {checkedRecoveryContacts,checkedRecoveryAppointments,checkedRecoverySettlement,type RecoveryActivity} from './recovery-activity.ts';
import {blankChargebackDetails,checkedChargebackDetails,checkedServiceFees,checkedMailings,recoveryDispositions,recoveryStages,trespassReviews,transactionZones,paymentMethods,textField,dayField,type ChargebackDetails,type ServiceFee,type ChargeMailing} from './chargeback-case.ts';
export {blankChargebackDetails,blankChargeMailing,cardBrands,recoveryDispositions,recoveryStages,trespassReviews,transactionZones,paymentMethods,mailingStages} from './chargeback-case.ts';
export type {ChargebackDetails,ServiceFee,ChargeMailing} from './chargeback-case.ts';
export const processors=['GoDaddy Payments','Other','Square'] as const;
export const replies=['Not Yet Verified','Preparing Response','PTE Submitted','Processor Responded for PTE','Response Reported (Submitter Unknown)','Response Deadline Missed'] as const;
export const decisions=['Pending','Cardholder Prevailed','Merchant Prevailed'] as const;
export const mailStages=['Not Started','Preparing Certified Letter','Submitted for Mailing','Reported Mailed','Sent by Certified Mail','Delivered','Returned or Unclaimed'] as const;
export const entryKinds=['Cash Repayment','Processor Credit','Recovery Refund','Certified Mail Postage','Court Filing Cost','Other Case Cost','Processor Fee','Service of Process Cost'] as const;
export const noticeZones=transactionZones;
export type ChargeEntry={id:string;kind:typeof entryKinds[number];day:string;cents:number;reference:string;dateUnknown?:boolean;method?:typeof paymentMethods[number];allocation?:'Principal'|'Fees';includeInRecovery?:boolean};
export const elections=['Awaiting Election','Accepted','Contested'] as const;
export type PreArbitration={noticeRef:string;deadlineDay:string;deadlineTime:string;zone:string;election:typeof elections[number];sentDay:string;signedRef:string};
export const blankPreArbitration=():PreArbitration=>({noticeRef:'',deadlineDay:'',deadlineTime:'',zone:'',election:'Awaiting Election',sentDay:'',signedRef:''});
export type Chargeback=RecoveryActivity&{preArbitration?:PreArbitration;merchantMissed?:boolean;processor:string;other:string;noticeRef:string;deadlineDay:string;deadlineTime:string;zone:string;reply:typeof replies[number];replyDay:string;replyRef:string;decision:typeof decisions[number];decisionDay:string;decisionRef:string;mail:typeof mailStages[number];sentDay:string;tracking:string;deliveryDay:string;repayBy:string;entries:ChargeEntry[];details?:ChargebackDetails;disposition?:typeof recoveryDispositions[number];lastContactDay?:string;nextFollowUpDay?:string;contactAttempts?:string;courtReference?:string;courtFiledDay?:string;dispositionNote?:string;sourceNotes?:string;serviceFees?:ServiceFee[];mailings?:ChargeMailing[];submittedDay?:string;deliveryRef?:string;reconciliationNote?:string;recoveryStage?:typeof recoveryStages[number];trespassReview?:typeof trespassReviews[number];identityVerificationRef?:string;reviewNotes?:string;recoveryStartedDay?:string;recoveryClosedDay?:string;writeOffReason?:string};
export function blankChargeback():Chargeback{return {processor:'',other:'',noticeRef:'',deadlineDay:'',deadlineTime:'',zone:'',reply:'Not Yet Verified',replyDay:'',replyRef:'',decision:'Pending',decisionDay:'',decisionRef:'',mail:'Not Started',sentDay:'',tracking:'',deliveryDay:'',repayBy:'',entries:[],details:blankChargebackDetails(),disposition:'Unverified',serviceFees:[],mailings:[],recoveryStage:'Not Reviewed',trespassReview:'Not Requested'};}
const invalid=(m:string):never=>{throw new AppError(m);};
function str(v:unknown,n:number){if(v==null)return '';if(typeof v!=='string'||v.length>n||/[\u0000-\u001f\u007f]/.test(v))return invalid('Check the chargeback field length or format.');return v.trim();}
function date(v:unknown,label:string){const a=str(v,10);if(a&&!auditDay(a))return invalid('Enter a valid '+label+' date.');return a;}
function one<T extends string>(v:unknown,a:readonly T[],label:string):T{if(!(a as readonly unknown[]).includes(v))return invalid('Select a listed '+label+'.');return v as T;}
function parts(n:number,z:string){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:z,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(n)).map(p=>[p.type,p.value]));return [p.year+'-'+p.month+'-'+p.day,p.hour+':'+p.minute];}
export function noticeInstant(day:string,time:string,zone:string):number|null{
 if(!day||!time||!Object.hasOwn(noticeZones,zone))return null;
 const wall=Date.parse(day+'T'+time+'Z');if(!Number.isFinite(wall))return null;
 // The supported zones have whole-hour offsets. If the clock repeats, never silently choose one of the two UTC instants.
 const off=(n:number)=>{const [d,t]=parts(n,zone);return Date.parse(d+'T'+t+'Z')-n;};
 const candidates=[...new Set([off(wall-86400000),off(wall+86400000)])].map(offset=>wall-offset).filter(n=>parts(n,zone).join('T')===day+'T'+time);
 return candidates.length===1?candidates[0]:null;
}
type Action={due:string;time:string;title:string};
export function processorActions(c:Chargeback|undefined,principal?:number|null):Action[]{
 if(!c)return [];const out:Action[]=[];const items:[{deadlineDay:string;deadlineTime:string;zone:string},string][]=[];
 if((c.reply==='Preparing Response'||c.reply==='Not Yet Verified')&&c.decision==='Pending'&&c.deadlineDay)items.push([c,'Submit Processor Evidence']);
 if(c.preArbitration?.election==='Awaiting Election'&&c.preArbitration.deadlineDay)items.push([c.preArbitration,'Submit Signed Pre-Arbitration Election']);
 for(const [x,title] of items){const n=noticeInstant(x.deadlineDay,x.deadlineTime,x.zone);const [due,time]=n!==null?parts(n,'America/Chicago'):[x.deadlineDay,''];out.push({due,time,title});}
 if(c.mail!=='Not Started'&&c.repayBy&&c.decision!=='Merchant Prevailed'&&(principal==null||totals(c,principal).remaining!==0))out.push({due:c.repayBy,time:'',title:'Follow Up on Cash Repayment'});
 if(c.nextFollowUpDay)out.push({due:c.nextFollowUpDay,time:'',title:'Follow Up on Recovery Case'});
 return out.sort((a,b)=>a.due.localeCompare(b.due)||a.time.localeCompare(b.time));
}
export function deadlinePassed(c:Chargeback,now=new Date()){
 if(!c.deadlineDay)return false;
 const ts=noticeInstant(c.deadlineDay,c.deadlineTime,c.zone);
 return ts===null?parts(now.getTime(),c.zone||'America/Chicago')[0]>c.deadlineDay:now.getTime()>ts;
}
export const isRecoveryPayment=(e:Pick<ChargeEntry,'kind'>)=>e.kind==='Cash Repayment'||e.kind==='Processor Credit';
export const isRecoveryCost=(e:Pick<ChargeEntry,'kind'>)=>!isRecoveryPayment(e)&&e.kind!=='Recovery Refund';
export const entryLabel=(e:Pick<ChargeEntry,'kind'|'method'>)=>e.kind==='Cash Repayment'?'Recovery Payment'+(e.method?' · '+e.method:''):e.kind;
export function recoveryTotals(c:Chargeback,principal:number|null){
 const cash=c.entries.filter(e=>e.kind==='Cash Repayment').reduce((n,e)=>n+e.cents,0),processorCredit=c.entries.filter(e=>e.kind==='Processor Credit').reduce((n,e)=>n+e.cents,0),refunds=c.entries.filter(e=>e.kind==='Recovery Refund').reduce((n,e)=>n+e.cents,0),paid=cash+processorCredit-refunds,cost=c.entries.filter(isRecoveryCost).reduce((n,e)=>n+e.cents,0),feesSought=c.entries.filter(e=>isRecoveryCost(e)&&e.includeInRecovery).reduce((n,e)=>n+e.cents,0),target=principal===null?null:principal+feesSought,remaining=target===null?null:Math.max(0,target-paid),excess=target===null?0:Math.max(0,paid-target),serviceFees=(c.serviceFees||[]).reduce((n,e)=>n+e.cents,0);
 const principalRecovered=c.entries.reduce((n,e)=>n+(isRecoveryPayment(e)?1:e.kind==='Recovery Refund'?-1:0)*(e.allocation==='Fees'?0:e.cents),0),feesRecovered=paid-principalRecovered;
 return {cash,processorCredit,refunds,paid,cost,feesSought,target,remaining,excess,serviceFees,principalRecovered,feesRecovered,unrecoveredPrincipal:principal===null?null:Math.max(0,principal-principalRecovered),processorCreditPending:c.decision==='Merchant Prevailed'&&principal!==null&&processorCredit<principal};
}
// Retain the small legacy summary contract used by reports and integrations.
export function totals(c:Chargeback,principal:number|null){const {paid,cost,remaining}=recoveryTotals(c,principal);return {paid,cost,remaining};}
export function recoveryAllowed(c:Chargeback,now=new Date()){
 return c.decision!=='Merchant Prevailed'&&(c.decision==='Cardholder Prevailed'||c.reply==='Response Deadline Missed'||c.merchantMissed===true||(c.reply==='Preparing Response'&&deadlinePassed(c,now)));
}
export type RecoveryQueueItem={stage:Exclude<typeof recoveryStages[number],'Not Reviewed'|'Complete'>;recordedStage:boolean;needsReleaseLookup:boolean;needsCertifiedDemand:boolean;mailingStarted:boolean;reason:string};
/** Organizes documented losses for staff follow-up. It does not change a case or send a demand. */
export function chargebackRecoveryQueue(c:Chargeback|undefined,principal:number|null,recordStatus='Open'):RecoveryQueueItem|null{
 if(!c||c.decision!=='Cardholder Prevailed'||recordStatus==='Closed'||c.recoveryStage==='Complete'||c.disposition==='Recovered'||c.disposition==='Final Loss'||recoveryTotals(c,principal).remaining===0)return null;
 const progressed=['Submitted for Mailing','Reported Mailed','Sent by Certified Mail','Delivered','Returned or Unclaimed'],events=[{stage:c.mail,day:c.deliveryDay||c.sentDay||c.submittedDay||''},...(c.mailings||[]).map(m=>({stage:m.stage,day:m.deliveryDay||m.mailedDay||m.submittedDay}))].filter(m=>progressed.includes(m.stage)).sort((a,b)=>b.day.localeCompare(a.day)),mailingStarted=events.length>0,latestStage=events[0]?.stage||c.mail;
 const matched=!!((c.details?.towbookCallNumber||c.details?.stockNumber)&&c.details?.customerName&&c.details?.customerAddress),recordedStage=!!c.recoveryStage&&c.recoveryStage!=='Not Reviewed';
 const stage:RecoveryQueueItem['stage']=recordedStage?c.recoveryStage as RecoveryQueueItem['stage']:c.disposition==='Court Filed'||c.disposition==='Court Planned'?'Court Review':latestStage==='Returned or Unclaimed'?'Review Returned Mail':latestStage==='Delivered'?'Awaiting Payment':mailingStarted?'Awaiting Demand Delivery':matched?'Prepare Certified Demand':'Find Release Record';
 const reasons:Record<RecoveryQueueItem['stage'],string>={'Find Release Record':'Match the payment to the release record, then confirm the customer and mailing address.','Prepare Certified Demand':'The loss is recorded and release details are available. Review the letter and mailing address.','Awaiting Demand Delivery':'A mailing is recorded. Check its tracking and attach delivery or return evidence.','Awaiting Payment':'Delivery is recorded. Follow up on payment and keep the recovery ledger current.','Review Returned Mail':'Review the returned notice and verify the address before deciding the next step.','Court Review':'Review the case documents and record the court decision or filing details.'};
 return {stage,recordedStage,needsReleaseLookup:stage==='Find Release Record',needsCertifiedDemand:['Find Release Record','Prepare Certified Demand','Review Returned Mail'].includes(stage),mailingStarted,reason:reasons[stage]};
}
export function towbookLookupText(c:Chargeback,principal:number|null){
 const d=c.details||blankChargebackDetails(),amount=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100),time=d.transactionTime?(d.transactionTime+(d.transactionZone?' '+d.transactionZone:' (time zone not provided)')):'Not recorded';
 return [['Payment date',d.transactionDay||'Not recorded'],['Payment time as shown',time],['Payment processor',c.processor==='Other'?c.other||'Other':c.processor||'Not identified'],['Card',`${d.cardBrand||'Unknown'}${d.cardLast4?' ending '+d.cardLast4:''}`],['Original transaction amount',d.originalTransactionCents===null||d.originalTransactionCents===undefined?'Not recorded':amount(d.originalTransactionCents)],['Disputed principal',principal===null?'Not recorded':amount(principal)],['Payment reference',d.transactionReference||'Not recorded'],['Processor dispute / request ID',d.disputeId||'Not recorded'],...(d.towbookCallNumber?[['Towbook call number',d.towbookCallNumber]]:[]),...(d.stockNumber?[['Vehicle stock number',d.stockNumber]]:[])].map(([label,value])=>label+': '+value).join('\n');
}
/** Parallel figures: bank outcomes describe the original dispute; court review is a subset of active recovery. */
export function chargebackFinancialSummary(c:Chargeback,principal:number|null,recordStatus='Open'){
 const t=recoveryTotals(c,principal),final=c.disposition==='Final Loss',closed=recordStatus==='Closed'||c.recoveryStage==='Complete'||c.disposition==='Recovered',hasProcessorNotice=!!c.processor&&!!c.noticeRef,unverified=c.decision==='Pending'&&!hasProcessorNotice,mailStarted=['Submitted for Mailing','Reported Mailed','Sent by Certified Mail','Delivered','Returned or Unclaimed'].includes(c.mail)||(c.mailings||[]).some(m=>m.stage!=='Prepared'),explicitlyStarted=!!c.recoveryStartedDay||!!c.recoveryStage&&!['Not Reviewed','Complete'].includes(c.recoveryStage)||c.disposition==='Court Planned'||c.disposition==='Court Filed',started=c.decision==='Cardholder Prevailed'||explicitlyStarted||c.decision!=='Merchant Prevailed'&&mailStarted,active=!final&&!closed&&started&&(t.remaining===null||t.remaining>0),court=active&&(c.recoveryStage==='Court Review'||c.disposition==='Court Planned'||c.disposition==='Court Filed');
 return {activeRecovery:active,courtReview:court,finalLoss:final,pendingBankReview:c.decision==='Pending'&&hasProcessorNotice,bankWinAwaitingCredit:c.decision==='Merchant Prevailed'&&(principal===null||t.processorCredit<principal),unverified,unclassifiedClosed:closed&&!final&&c.disposition!=='Recovered'&&c.decision!=='Merchant Prevailed'&&(t.remaining===null||t.remaining>0),bankLossCents:c.decision==='Cardholder Prevailed'?principal:0,pendingPrincipalCents:c.decision==='Pending'&&hasProcessorNotice?principal:0,bankWinCents:c.decision==='Merchant Prevailed'?principal:0,unverifiedPrincipalCents:unverified?principal:0,netRecoveryCents:t.paid,customerPaymentsCents:t.cash,postedProcessorCreditsCents:t.processorCredit,recoveryRefundsCents:t.refunds,activeOutstandingCents:active?t.remaining:0,verifiedActiveOutstandingCents:active&&!unverified?t.remaining:0,unverifiedActiveOutstandingCents:active&&unverified?t.remaining:0,finalLossCents:final?t.remaining:0,courtReviewCents:court?t.remaining:0,unclassifiedClosedCents:closed&&!final&&c.disposition!=='Recovered'&&c.decision!=='Merchant Prevailed'?t.remaining:0,receiptStatus:c.entries.some(e=>!isRecoveryCost(e))?'Receipts Recorded' as const:'No Receipts Recorded' as const};
}
export function reopenChargebackRecovery(c:Chargeback,principal:number|null):Chargeback{
 const t=recoveryTotals(c,principal);return {...c,disposition:t.remaining===0?'Recovered':t.paid>0?'Partial Recovery':'Open',recoveryStage:'Not Reviewed',recoveryClosedDay:'',writeOffReason:''};
}
export function checkedChargeback(v:unknown,old:Chargeback|undefined,principal:number|null,now=new Date()):Chargeback|undefined{
 if(v===undefined)return old;
 if(!v||typeof v!=='object'||Array.isArray(v))return invalid('Enter valid chargeback details.');
 const b=v as Record<string,unknown>,c=blankChargeback();
 c.details=b.details===undefined?old?.details||blankChargebackDetails():checkedChargebackDetails(b.details,old?.details);
 c.disposition=one(b.disposition??old?.disposition??'Unverified',recoveryDispositions,'recovery disposition');
 c.recoveryStage=one(b.recoveryStage??old?.recoveryStage??'Not Reviewed',recoveryStages,'recovery stage');
 c.trespassReview=one(b.trespassReview??old?.trespassReview??'Not Requested',trespassReviews,'trespass review status');
 c.identityVerificationRef=textField(b.identityVerificationRef===undefined?old?.identityVerificationRef:b.identityVerificationRef,180,'identity verification reference');
 c.reviewNotes=textField(b.reviewNotes===undefined?old?.reviewNotes:b.reviewNotes,2400,'staff review notes',true);
 if(['Pending Staff Review','Reviewed'].includes(c.trespassReview)&&!c.identityVerificationRef)return invalid('Reference the verified release or identity record before staff review. Record a reference, not a full identity document number.');
 if(c.trespassReview==='Reviewed'&&!c.reviewNotes)return invalid('Record the staff review finding before marking the review complete.');
 for(const k of ['lastContactDay','nextFollowUpDay','courtFiledDay','submittedDay','recoveryStartedDay','recoveryClosedDay'] as const)c[k]=dayField(b[k]===undefined?old?.[k]:b[k],k.replace(/Day$/,''));
 c.writeOffReason=textField(b.writeOffReason===undefined?old?.writeOffReason:b.writeOffReason,2400,'write-off reason',true);
 c.contactLog=b.contactLog===undefined?old?.contactLog:checkedRecoveryContacts(b.contactLog);c.appointments=b.appointments===undefined?old?.appointments:checkedRecoveryAppointments(b.appointments);c.settlement=b.settlement===undefined?old?.settlement:checkedRecoverySettlement(b.settlement);
 for(const k of ['contactAttempts','dispositionNote','sourceNotes','reconciliationNote'] as const)c[k]=textField(b[k]===undefined?old?.[k]:b[k],k==='sourceNotes'?8000:2400,k,true);
 c.courtReference=str(b.courtReference===undefined?old?.courtReference:b.courtReference,180);c.deliveryRef=str(b.deliveryRef===undefined?old?.deliveryRef:b.deliveryRef,180);
 c.serviceFees=b.serviceFees===undefined?old?.serviceFees||[]:checkedServiceFees(b.serviceFees);c.mailings=b.mailings===undefined?old?.mailings||[]:checkedMailings(b.mailings);
 c.processor=b.processor?one(b.processor,processors,'payment processor'):'';c.other=c.processor==='Other'?str(b.other,100):'';
 if(c.processor==='Other'&&!c.other)return invalid('Enter the processor name.');
 c.noticeRef=str(b.noticeRef,180);c.deadlineDay=date(b.deadlineDay,'processor deadline');c.deadlineTime=str(b.deadlineTime,5);c.zone=str(b.zone,50);
 if(c.zone&&!Object.hasOwn(noticeZones,c.zone))return invalid('Select the time zone shown on the notice.');
 if(c.deadlineDay&&!c.noticeRef)return invalid('Reference the processor notice that gives the deadline.');
 if(c.deadlineTime&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.deadlineTime)||!c.deadlineDay))return invalid('The deadline time needs a valid time and date from the notice.');
 if(c.deadlineTime&&c.zone&&noticeInstant(c.deadlineDay,c.deadlineTime,c.zone)===null)return invalid('That local deadline time is skipped or repeated by daylight saving. Use the confirmed UTC date and time from the processor.');
 if(!c.deadlineTime)c.zone='';
 c.reply=one(b.reply??replies[0],replies,'response status');c.replyDay=date(b.replyDay,'response');c.replyRef=str(b.replyRef,180);
 if(c.reply==='Preparing Response'||c.reply==='Not Yet Verified'){c.replyDay='';c.replyRef='';}
 else if(c.reply==='Response Reported (Submitter Unknown)'){if(!c.replyRef&&!c.sourceNotes)return invalid('Reference the record that reports a response.');}
 else if(c.reply==='Response Deadline Missed'){if(!c.deadlineDay||!deadlinePassed(c,now))return invalid('Record the elapsed processor deadline before marking it missed.');c.replyDay='';c.replyRef='';}
 else if(!c.replyDay||!c.replyRef)return invalid('Record the submission date and reference for the processor response or evidence packet.');
 if(b.merchantMissed!=null&&typeof b.merchantMissed!=='boolean')return invalid('Choose whether PTE missed its response deadline.');if(b.merchantMissed===true&&c.reply==='Processor Responded for PTE'){if(!deadlinePassed(c,now))return invalid('Record the expired deadline before identifying a missed response.');c.merchantMissed=true;}
 if(b.preArbitration!==undefined&&b.preArbitration!==null){if(typeof b.preArbitration!=='object'||Array.isArray(b.preArbitration))return invalid('Check pre-arbitration details.');const p=b.preArbitration as Record<string,unknown>,n=blankPreArbitration();n.noticeRef=str(p.noticeRef,180);n.deadlineDay=date(p.deadlineDay,'pre-arbitration');n.deadlineTime=str(p.deadlineTime,5);n.zone=str(p.zone,50);n.election=one(p.election,elections,'pre-arbitration election');n.sentDay=date(p.sentDay,'signed election submission');n.signedRef=str(p.signedRef,180);if(!n.noticeRef)return invalid('Enter the separate pre-arbitration notice reference.');if(n.deadlineTime&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(n.deadlineTime)||!n.deadlineDay||!!n.zone&&(!Object.hasOwn(noticeZones,n.zone)||noticeInstant(n.deadlineDay,n.deadlineTime,n.zone)===null)))return invalid('Check the pre-arbitration deadline date, time and notice time zone.');if(!n.deadlineTime)n.zone='';if(n.election==='Awaiting Election'){n.sentDay='';n.signedRef='';}else if(!n.sentDay||!n.signedRef)return invalid('Record when the signed election was sent and its document or confirmation reference.');c.preArbitration=n;
 }
 c.decision=one(b.decision??decisions[0],decisions,'bank outcome');c.decisionDay=date(b.decisionDay,'bank decision');c.decisionRef=str(b.decisionRef,180);
 if(c.decision==='Pending'){c.decisionDay='';c.decisionRef='';}
 else if(!c.decisionRef)return invalid('Record the source of the bank decision. Leave its date blank if the evidence does not state it.');
 c.mail=one(b.mail??mailStages[0],mailStages,'certified mail status');c.sentDay=date(b.sentDay,'mailing');c.tracking=str(b.tracking,100);c.deliveryDay=date(b.deliveryDay,'delivery or return');c.repayBy=date(b.repayBy,'cash repayment deadline');
 if(c.mail==='Not Started'){c.sentDay='';c.tracking='';c.deliveryDay='';c.repayBy='';c.submittedDay='';c.deliveryRef='';}
 else if(c.mail==='Preparing Certified Letter'){c.sentDay='';c.tracking='';c.deliveryDay='';}
 else if(c.mail==='Submitted for Mailing'){if(!c.submittedDay)return invalid('Record the mailing submission date.');c.sentDay='';c.deliveryDay='';}
 else if(!c.sentDay||!c.tracking)return invalid('Record the mailing date and certified mail tracking number.');
 if(c.mail==='Delivered'||c.mail==='Returned or Unclaimed'){if(!c.deliveryDay||c.deliveryDay<c.sentDay)return invalid('Enter a delivery or return date on or after the mailing date.');if((c.mail!==old?.mail||c.deliveryDay!==old?.deliveryDay)&&!c.deliveryRef)return invalid('Reference the delivery or return proof. A mailing submission certificate does not confirm delivery.');}else c.deliveryDay='';
 if(c.submittedDay&&c.sentDay&&c.sentDay<c.submittedDay)return invalid('The mailing date must be on or after submission.');
 if(c.sentDay&&c.repayBy&&c.repayBy<c.sentDay)return invalid('The repayment deadline must be on or after the mailing date.');
 if(!Array.isArray(b.entries)||b.entries.length>150)return invalid('Use up to 150 itemized payment or cost entries per dispute.');
 const ids=new Set<string>(),receipts=new Set<string>();
 c.entries=b.entries.map(e=>{if(!e||typeof e!=='object'||Array.isArray(e))return invalid('Check the cash or cost entry.');
 const id=str(e.id,64),kind=one(e.kind,entryKinds,'cash or cost type'),day=date(e.day,'transaction'),reference=str(e.reference,180),cents=e.cents;
 if(e.dateUnknown!==undefined&&typeof e.dateUnknown!=='boolean')return invalid('Choose whether the historical payment date is unknown.');
 if(e.dateUnknown===true&&(kind!=='Cash Repayment'||day))return invalid('Only a recovery payment with no known transaction date can use Payment Date Unknown.');
 if(!/^[\w-]{1,64}$/.test(id)||ids.has(id)||!day&&e.dateUnknown!==true||!Number.isSafeInteger(cents)||cents<=0||cents>99999999999||!reference)return invalid('Every cash or cost entry needs a positive amount, a receipt or source reference, and its date. For a historical recovery payment, choose Payment Date Unknown if its date was not provided.');
 const row:ChargeEntry={id,kind,day,cents,reference},isCost=isRecoveryCost(row);
 if(e.dateUnknown===true)row.dateUnknown=true;
 if(kind==='Cash Repayment'&&e.method)row.method=one(e.method,paymentMethods,'payment method');
 if(!isCost&&e.allocation!==undefined)row.allocation=one(e.allocation,['Principal','Fees'] as const,'payment allocation');
 if(e.includeInRecovery!==undefined){if(typeof e.includeInRecovery!=='boolean'||!isCost)return invalid('Only company cost entries can be included in the recovery amount.');row.includeInRecovery=e.includeInRecovery;}
 const key=(isCost?'cost':kind)+'|'+reference.toLowerCase()+'|'+day+'|'+cents;if(receipts.has(key))return invalid('This receipt and amount have already been recorded for that date and entry type.');ids.add(id);receipts.add(key);return row;});
 const t=recoveryTotals(c,principal),newPayment=c.entries.some(e=>isRecoveryPayment(e)&&!old?.entries.some(p=>JSON.stringify(p)===JSON.stringify(e)));
 if(newPayment&&principal===null)return invalid('Record the disputed principal before adding a recovery payment.');
 if(t.refunds>t.cash+t.processorCredit)return invalid('Recovery refunds cannot exceed the payments and credits recorded on this case.');
 if(t.principalRecovered<0||t.feesRecovered<0)return invalid('Check the refund allocation: refunds against principal or fees cannot exceed receipts for that amount.');
 if((t.excess>0||t.principalRecovered>(principal??Infinity)||t.feesRecovered>t.feesSought)&&!c.reconciliationNote)return invalid('Recorded recovery exceeds the principal or fees being sought. Add a reconciliation note explaining the excess and any refund needed.');
 if(c.decision==='Merchant Prevailed'&&t.cash>t.refunds&&!c.reconciliationNote)return invalid('Customer payments and a favorable bank decision may duplicate recovery. Add a reconciliation note and verify the processor credit.');
 if(c.disposition==='Recovered'&&(t.target===null||t.remaining!==0))return invalid('Record the actual payments or processor credits before marking this case recovered.');
 if(c.disposition==='Partial Recovery'&&(t.target===null||t.paid<=0||t.remaining===0))return invalid('Partial recovery needs a recorded payment and a remaining balance.');
 if(c.disposition==='No Response'&&!c.lastContactDay&&!c.contactAttempts&&!c.contactLog?.length)return invalid('Record the last contact date or attempts before marking no response.');
 if(c.disposition==='Court Filed'&&(!c.courtFiledDay||!c.courtReference))return invalid('Record the court filing date and case or filing reference.');
 if(c.recoveryStartedDay&&c.recoveryClosedDay&&c.recoveryClosedDay<c.recoveryStartedDay)return invalid('The recovery close date cannot precede its start date.');
 const today=parts(now.getTime(),'America/Chicago')[0];if(c.recoveryStartedDay&&c.recoveryStartedDay>today||c.recoveryClosedDay&&c.recoveryClosedDay>today)return invalid('Use actual recovery start and close dates on or before today. Future payment arrangements belong in appointments.');
 if(c.disposition==='Final Loss'){
  if(!c.recoveryClosedDay||!c.writeOffReason)return invalid('Writing off the remaining balance needs the close date and a reason describing the exhausted recovery attempts.');
  if(t.remaining===null||t.remaining<=0)return invalid('Record a known remaining balance before marking the final loss.');
  if(old?.disposition==='Final Loss'&&JSON.stringify(c.entries.filter(e=>!isRecoveryCost(e)))!==JSON.stringify(old.entries.filter(e=>!isRecoveryCost(e))))return invalid('Reopen Recovery before adding or correcting a receipt or refund on a final-loss case.');
  c.recoveryStage='Complete';
 }else if(old?.disposition==='Final Loss'){
  c.recoveryClosedDay='';c.writeOffReason='';if(c.recoveryStage==='Complete')c.recoveryStage='Not Reviewed';
 }
 return c;
}
