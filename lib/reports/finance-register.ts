import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
import {needsCashReview} from '../finance/quick-edit.ts';
import {auditDay} from '../shared/audit-format.ts';
import {localDate} from '../finance/timeclock.ts';
import type {FinancialMonth,FinComparison,HomeFinancialAnalytics} from './finance-home-types';
export const day=(v:unknown):string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&auditDay(v)?v:'';
export const moneyValue=(v:unknown)=>{if((typeof v!=='number'&&typeof v!=='string')||(typeof v==='string'&&!v.trim()))return null;const n=Number(v);return Number.isFinite(n)?round(n):null;};
export const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const real=(r:FinRecord)=>!r.example&&!r.sample&&!r.isSample&&!r.isDemo&&!r.trainingSample&&!r.deletedAt&&!['Deleted','Void','Voided','Cancelled','Canceled'].includes(String(r.status));
export const definitions={revenue:'Net bank receipts in operating income categories. Excludes owner funds, financing, transfers and fraud recoveries.',spending:'Net bank charges in recorded operating expense categories; refunds reduce spending. Unreviewed cash withdrawals are excluded.',netCash:'All signed bank entries, including transfers and financing. This is movement in the register, not operating profit.'};
const funding=/\b(transfer|contribution|owner draw|loan proceeds|loan repayment|received loans|fraud)\b/i;
type BankEntry={id:string;date:string;category:string;group:string;status:string;description:string;account:string;amount:number;revenue:number;spending:number;classification:string;needCash:boolean;unmapped:boolean};
export function bankEntries(records:FinRecord[],imported:FinRecord[]):BankEntry[]{
 const entries=new Map(imported.filter(r=>r.kind==='transaction').map(t=>[t.id,t]));
 const categories=new Map(records.filter(r=>r.kind==='category'&&real(r)).map(c=>[String(c.name),c]));
 for(const r of records)if(r.kind==='transaction')entries.set(r.id,r);
 const result:BankEntry[]=[];
 for(const t of entries.values()){
  const date=day(t.date),amt=moneyValue(t.amount);if(!real(t)||!date||amt==null)continue;
  const cat=String(t.category||''),c=categories.get(cat),group=String(c?.group||''),classification=String(t.classification||'');
  const exclude=funding.test(cat+' '+group+' '+classification)||String(c?.accountType)==='Transfer'||['Equity','Liability','Asset'].includes(String(c?.accountType));
  const inc=c?.accountType==='Income'&&!exclude,needCash=needsCashReview(t),exp=c?.accountType==='Expense'&&!exclude&&!needCash;
  result.push({id:t.id,date,amount:amt,category:cat||'Uncategorized',group:group||'Unassigned',status:String(t.status||'Unspecified'),description:String(t.description||t.name||'Bank transaction'),account:String(t.account||'Unspecified'),revenue:inc?amt:0,spending:exp?-amt:0,classification:classification||(inc?'Operating income':exp?'Operating expense':exclude?'Transfers & financing':'Unclassified'),needCash,unmapped:!c||c.accountType==='Unconfirmed'||classification==='Needs review'});
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function monthSequence(last:string,count:number){const d=new Date(last.slice(0,7)+'-01T12:00Z');return Array.from({length:count},(_,i)=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-count+1+i,1,12)).toISOString().slice(0,7));}
export function aggregateMonths(rows:BankEntry[],from?:string,to?:string){
 const ms=new Map<string,{month:string,revenue:number,spending:number,netCash:number,transactionCount:number,inflow:number,outflow:number,credits:number,debits:number}>();
 for(const r of rows){if(from&&r.date<from||to&&r.date>to)continue;const m=r.date.slice(0,7),x=ms.get(m)||{month:m,revenue:0,spending:0,netCash:0,transactionCount:0,inflow:0,outflow:0,credits:0,debits:0};x.revenue+=Math.round(r.revenue*100);x.spending+=Math.round(r.spending*100);x.netCash+=Math.round(r.amount*100);x.transactionCount++;if(r.amount>0){x.inflow+=Math.round(r.amount*100);x.credits++}if(r.amount<0){x.outflow-=Math.round(r.amount*100);x.debits++}ms.set(m,x);}
 return [...ms.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(x=>({...x,revenue:x.revenue/100,spending:x.spending/100,netCash:x.netCash/100,inflow:x.inflow/100,outflow:x.outflow/100}));
}
export function homeFinanceProjection(v:Viewer,records:FinRecord[],imported:FinRecord[],now=new Date()):HomeFinancialAnalytics|null{
 if(v.onboardingOnly||!canAccess(v,'Finance','Overview'))return null;
 const asOf=localDate(now),bank=bankEntries(records,imported).filter(r=>r.date<=asOf),through=bank.at(-1)?.date??null,first=bank[0]?.date??'',ag=new Map(aggregateMonths(bank).map(m=>[m.month,m]));
 const keys=monthSequence(asOf,12);
 const months:FinancialMonth[]=keys.map(month=>{const x=ag.get(month);const days=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0,12)).toISOString().slice(0,10);return {month,revenue:x?.revenue??null,spending:x?.spending??null,netCash:x?.netCash??null,transactionCount:x?.transactionCount??null,complete:!!x&&month<asOf.slice(0,7)&&first<=month+'-01'&&!!through&&through>=days};});
 const current=months.filter(m=>m.complete).at(-1),ci=current?months.indexOf(current):-1,prior=ci>0&&months[ci-1].complete?months[ci-1]:null;
 const comparisons:FinComparison[]=(['revenue','spending','netCash'] as const).map(key=>{
  const a=current?.[key]??null,b=prior?.[key]??null,change=a!=null&&b!=null?round(a-b):null;
  // Polarity describes relative receipts/spend, not overall profitability. Financing makes net cash neutral.
  return {key,current:a,previous:b,currentMonth:current?.month??null,previousMonth:prior?.month??null,change,percent:change!=null&&b!=null&&b>0?round(change/b*100):null,direction:change==null?'unknown':change===0?'flat':change>0?'up':'down',assessment:change==null||change===0||key==='netCash'?'neutral':(key==='spending'?change<0:change>0)?'favorable':'unfavorable'};
 });
 return {asOf,through,source:'Finance bank register · dated entries, including saved corrections',definitions,reportable:canAccess(v,'Finance','Reports & Taxes'),months,comparisons,reportIds:{revenue:'monthly-revenue',spending:'monthly-expense',netCash:'monthly-cash-flow',scatter:'cash-vs-expense'}};
}
