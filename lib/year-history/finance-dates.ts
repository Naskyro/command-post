import type {FinRecord} from '../finance/model';
import {businessDate} from './model.ts';

export function safeCents(value:unknown):number|undefined{
 if(typeof value!=='number'&&typeof value!=='string'||typeof value==='string'&&(!value.trim()||!/^[-+]?\d+(?:\.\d+)?$/.test(value.trim())))return;
 const n=Number(value)*100,rounded=Math.round(n);
 return Number.isSafeInteger(rounded)&&Math.abs(n-rounded)<0.00001?rounded:undefined;
}

/** The bill payment date is the date actually entered for settlement. A
 * modified timestamp, due date, upload date or mere Paid flag is not one. */
export function obligationClose(r:FinRecord){
 const status=String(r.status||'').toLowerCase(),cancel=['cancelled','canceled','voided','void'].includes(status);
 const terminal=cancel||['paid','settled','closed','written off'].includes(status);
 if(!terminal)return {terminal:false,closedDate:''};
 const moneySettled=status==='paid'||status==='settled';
 const given=(moneySettled?[r.paidDate,r.paidAt,r.settledAt,r.closedAt]:cancel?[r.cancelledAt,r.canceledAt,r.voidedAt,r.closedAt]:[r.closedAt,r.writtenOffAt])
  .map(businessDate).find(Boolean);
 if(given)return {terminal:true,closedDate:given};
 if(r.kind==='bill'&&moneySettled&&Array.isArray(r.payments)){
  const p=r.payments.filter((x):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x));
  const dates=p.map(x=>businessDate(x.date)),amounts=p.map(x=>safeCents(x.amount)),total=safeCents(r.amount);
  // A partial payment history does not prove the final payment date on a legacy record.
  if(p.length&&p.length===r.payments.length&&dates.every(Boolean)&&amounts.every(n=>n!==undefined&&n>0)&&total!==undefined&&total>0&&
   amounts.reduce<number>((s,n)=>s+n!,0)===total&&safeCents(r.paid)===total)return {terminal:true,closedDate:dates.sort().at(-1)!};
 }
 return {terminal:true,closedDate:''};
}
