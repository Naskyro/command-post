import type {FinRecord,Viewer} from './model';
import {num,paymentMethods} from './model.ts';
import {canAccess} from './access.ts';
export const billBalance=(r:FinRecord)=>Math.max(0,Math.round((num(r.amount)-num(r.paid))*100)/100);
export const canApproveBill=(r:FinRecord,v:Viewer)=>canAccess(v,'Finance','Outflows',true)&&(v.owner||r.approver===v.person||v.canManage);
export function billAction(r:FinRecord,action:string,input:Record<string,unknown>,v:Viewer):FinRecord{
 if(!canAccess(v,'Finance','Outflows',true)||!(v.canManage||v.customAccess))throw new Error('Bill payments are not assigned to your account.');
 if(['Paid','Cancelled','Voided'].includes(String(r.status)))throw new Error('This bill is closed.');
 if(!r.vendor||!Number.isFinite(Number(r.amount))||num(r.amount)<=0)throw new Error('Enter the vendor and bill amount first.');
 const at=new Date().toISOString();
 if(action==='approveBill'){
  if(!canApproveBill(r,v))throw new Error('Only the assigned approver or Finance manager can approve payment.');
  if(r.approvedAt)throw new Error('Payment is already approved.');
  return {...r,status:num(r.paid)>0?'Partly paid':'Approved',approvedBy:v.name,approvedById:v.id,approvedAt:at};
 }
 if(action!=='recordBillPayment')throw new Error('Unknown bill action.');
 if(!r.approvedAt)throw new Error('Approve payment before recording it.');
 const amount=Number(input.amount),cents=Math.round(amount*100);
 if(!Number.isFinite(amount)||cents<=0||Math.abs(amount*100-cents)>.00001||cents>Math.round(billBalance(r)*100))throw new Error('Enter a payment no greater than the unpaid balance, using dollars and cents.');
 if(!paymentMethods.includes(String(input.method))||!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))||!String(input.reference||'').trim())throw new Error('Enter the payment date, method, and confirmation or cash record reference.');
 const payments=(r.payments||[]) as Record<string,unknown>[];
 if(payments.some(p=>p.reference===String(input.reference).trim()&&p.method===input.method))throw new Error('This payment reference is already recorded on the bill.');
 const payment={id:crypto.randomUUID(),amount:cents/100,date:input.date,method:input.method,reference:String(input.reference).trim(),recordedBy:v.name,recordedById:v.id,recordedAt:at};
 const paid=(Math.round(num(r.paid)*100)+cents)/100;
 return {...r,payments:[...payments,payment],paid,status:paid>=num(r.amount)?'Paid':'Partly paid'};
}
export function validateBillEdit(next:FinRecord,old:FinRecord|undefined){
 if(!String(next.vendor||'').trim()||!Number.isFinite(Number(next.amount))||num(next.amount)<=0)throw new Error('Enter the vendor and a bill amount greater than zero.');
 for(const key of ['paid','payments','approvedBy','approvedById','approvedAt'])if(JSON.stringify(next[key])!==JSON.stringify(old?.[key]))throw new Error('Use Approve payment or Record payment for this change.');
 if(!old&& !['Unpaid','Draft','Disputed','Cancelled'].includes(String(next.status)))throw new Error('Add the bill before approving payment.');
 if(old&&next.status!==old.status&&!['Unpaid','Disputed','Cancelled'].includes(String(next.status)))throw new Error('Use the payment actions to update this status.');
 if(num(old?.paid)>0&&next.status==='Cancelled')throw new Error('A bill with payments cannot be cancelled.');
 if(num(next.amount)<num(old?.paid))throw new Error('Bill amount cannot be less than payments already recorded.');
 if(old&&['amount','vendor','invoice','approver','status'].some(k=>next[k]!==old[k])){
  delete next.approvedAt;delete next.approvedBy;delete next.approvedById;
  if(!['Disputed','Cancelled'].includes(String(next.status)))next.status=num(next.paid)>0?'Partly paid':'Unpaid';
 }
}
