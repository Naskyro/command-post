import type {FinRecord,Viewer} from '../finance/model';
import {canAccess,recordAccess} from '../finance/access.ts';
import {canOpenYearHistory} from './access.ts';
import {businessDate,type YearEntry} from './model.ts';
import {obligationClose,safeCents} from './finance-dates.ts';

const payrollKinds=new Set(['earning','taxInput','deduction','reimbursement','payrun','payment','payIssue','yearDocument']);
const privateCategory=/\b(payroll|paychecks?|paychex|wages?|salar(?:y|ies)|direct deposit|ADP)\b/i;
const isExample=(r:FinRecord)=>!!(r.example||r.sample||r.isSample||r.isDemo||r.trainingSample||r.deletedAt||String(r.status).toLowerCase()==='deleted');
const cleanStatus=(s:unknown,allowed:readonly string[])=>allowed.find(a=>a.toLowerCase()===String(s||'').trim().toLowerCase())||'Other / Unspecified';
const statusBank=['Imported','Posted','Cleared','Matched','Categorized','Reconciled','Pending','Scheduled','Draft','Processing','Needs Review','Failed','Declined','Voided','Void','Cancelled','Canceled'] as const;
const statusObligation=['Draft','Sent','Issued','Unpaid','Disputed','Approved','Pending','Open','Partly Paid','Partially Paid','Paid','Settled','Closed','Written Off','Voided','Void','Cancelled','Canceled'] as const;
const doNotCount=new Set(['Failed','Declined','Voided','Void','Cancelled','Canceled']);
const posted=new Set(['Imported','Posted','Cleared','Matched','Categorized','Reconciled']);
const ledgerAllowed=(v:Viewer)=>canAccess(v,'Finance','Overview')||canAccess(v,'Finance','Outflows');

// Source register rows omit payee, description, address, account number, memo,
// journal narrative, and payment references. Linked payroll and identified pay
// transactions never become an employee breakdown in generic annual history.
export function projectFinanceYearHistory(viewer:Viewer,records:FinRecord[],imports:FinRecord[]):YearEntry[]{
 if(!canOpenYearHistory(viewer,'Finance'))return [];
 const result:YearEntry[]=[],module='Finance',privateIds=new Set(records.filter(r=>payrollKinds.has(r.kind)).map(r=>r.id));
 const byId=new Map(records.map(r=>[r.id,r]));
 const privateRecord=(r:FinRecord)=>[r.payrun,r.payrunId,r.payrollId,r.paystubId].some(Boolean)||[r.matchId,r.parent,r.linkedRecordId].some(x=>privateIds.has(String(x)))||privateCategory.test(String(r.category||'')+' '+String(r.classification||'')+' '+String(r.description||''));
 if(ledgerAllowed(viewer)){
  // Identical IDs refer to the same imported register entry. A persisted edit
  // or a tombstone wins even if it removes the date/amount. Separate bank IDs
  // remain separate; matching on amount/day would erase legitimate purchases.
  const bank=new Map(imports.filter(r=>r.kind==='transaction').map(r=>[r.id,r]));
  for(const r of records)if(r.kind==='transaction')bank.set(r.id,r);
  for(const r of bank.values()){
   if(isExample(r)||!recordAccess(viewer,r)||privateRecord(r))continue;
   const status=cleanStatus(r.status,statusBank),date=businessDate(r.date);
   if(doNotCount.has(status))continue;
   const confirmed=posted.has(status),cents=confirmed?safeCents(r.amount):undefined;
   const title=confirmed?cents===undefined?'Posted Bank Entry':cents>0?'Bank Deposit':cents<0?'Bank Withdrawal':'Zero-Amount Bank Entry':'Bank Entry Awaiting Posting';
   result.push({id:r.id,module,kind:'Bank Transaction',title,status,activityDate:date,terminal:confirmed,...(confirmed&&date?{closedDate:date}:{}),...(!confirmed&&date?{openedDate:date}:{}),category:cents===undefined?(confirmed?'bank-amount-unknown':'bank-pending'):cents>0?'cash-in':cents<0?'cash-out':'cash-neutral',...(cents!==undefined?{amountCents:cents}:{})});
  }
 }
 for(const r of byId.values()){
  if(isExample(r)||!recordAccess(viewer,r))continue;
  const date=businessDate(r.date);
  if(r.kind==='bill'||r.kind==='invoice'){
   const bill=r.kind==='bill';
   if(!canAccess(viewer,'Finance',bill?'Outflows':'Receivables')||privateRecord(r))continue;
   const {terminal,closedDate}=obligationClose(r);
   // Preserve legitimate partial-payment activity without treating it as the
   // date the bill was paid off. Final settlement, not entry date, owns closure.
   const paidDates=bill&&Array.isArray(r.payments)?r.payments.flatMap(p=>p&&typeof p==='object'&&!Array.isArray(p)&&(safeCents(p.amount)??0)>0?[businessDate(p.date)]:[]).filter(Boolean):[];
   const activityDate=[date,closedDate,...paidDates].sort().at(-1)||'';
   result.push({id:r.id,module,kind:bill?'Vendor Bill':'Client Invoice',title:bill?'Vendor Bill':'Client Invoice',status:cleanStatus(r.status,statusObligation),terminal,activityDate,activityDates:[...new Set(paidDates)],...(date?{openedDate:date}:{}),...(closedDate?{closedDate}:{}),category:bill?'payable':'receivable'});
   continue;
  }
  // Companion activity records are counts only: matching bank movement, a
  // transfer, deposit or debt payment must never count twice toward cash totals.
  const event=r.kind==='cashMovement'?['Cash Movement','cash-movement','Receivables']:r.kind==='receipt'?['Release Receipt','release-receipt','Receivables']:r.kind==='debtPayment'?['Debt Payment','debt-payment','Debts']:null;
  if(!event||!canAccess(viewer,'Finance',event[2])||privateRecord(r))continue;
  const s=cleanStatus(r.status,['Recorded','Posted','Confirmed','Completed','Paid','Matched','Reconciled','Deposited','Approved','Pending','Draft','Voided','Cancelled','Canceled']);
  if(doNotCount.has(s))continue;
  const done=['Recorded','Posted','Confirmed','Completed','Paid','Matched','Reconciled','Deposited'].includes(s);
  // Some early cash-movement/debt-payment forms did not collect a status;
  // the business date is observable but no completion date can be inferred.
  result.push({id:r.id,module,kind:event[0],title:event[0],status:s,activityDate:date,terminal:done,...(done&&date?{closedDate:date}:{}),category:event[1]});
 }
 return result;
}

export async function financeHistory(viewer:Viewer,records:FinRecord[]):Promise<YearEntry[]>{
 if(!canOpenYearHistory(viewer,'Finance'))return [];
 const imported=ledgerAllowed(viewer)?(await import('../finance/seed')).sourceTransactions:[];
 return projectFinanceYearHistory(viewer,records,imported);
}
