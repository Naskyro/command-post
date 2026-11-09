import type { HrRecord } from './model.ts';
import { AppError } from '../shared/errors.ts';

export const BANK_AUTHORIZATION_VERSION = '2026-10-27';
export const BANK_AUTHORIZATION_TEXT = "I authorize Galindo’s Towing & Transport LLC, DBA Parking & Towing Enforcement, to deposit my payroll payments into the account shown. I confirm that I own this account or am authorized to receive deposits into it. I have checked the routing and account numbers. By typing my name and submitting, I agree to use an electronic signature for this authorization.";
export const bankServerFields = ['authorizationAccepted','authorizationName','authorizationAt','authorizationBy','authorizationIdentity','authorizationVersion','authorizationText','authorizationBinding','institutionLookupStatus','institutionLookupSource','institutionLookupAt','institutionLookupRouting','institutionCity','institutionState','reviewConfirmation','reviewNote'] as const;
export const bankInputFields = ['nameOnAccount','routingNumber','accountNumber','accountType','bankName','effectiveDate','signedDocumentId','status'] as const;
export function validRoutingNumber(value: unknown): boolean {
 const n=String(value??'');if(!/^\d{9}$/.test(n)||n==='000000000')return false;
 const prefix=Number(n.slice(0,2));if(!(prefix<=12||prefix>=21&&prefix<=32||prefix>=61&&prefix<=72||prefix===80))return false;
 return [...n].reduce((sum,d,i)=>sum+Number(d)*[3,7,1][i%3],0)%10===0;
}
export function bankBinding(data:Record<string,unknown>):string {return JSON.stringify(['nameOnAccount','routingNumber','accountNumber','accountType','effectiveDate'].map(k=>String(data[k]||'').trim()));}
/** Client-provided audit/consent claims are never accepted by the generic record editor. */
export function sanitizeBankData(old:Record<string,unknown>|undefined,data:Record<string,unknown>) {
 for(const key of bankServerFields)delete data[key];
 if(old&&bankBinding(old)===bankBinding(data))for(const key of bankServerFields)if(old[key]!==undefined)data[key]=old[key];
 if(data.accountNumber)data.accountLast4=String(data.accountNumber).slice(-4);else delete data.accountLast4;
}
export function bankHasElectronicAuthorization(data:Record<string,unknown>,personId:string|undefined) {
 return data.authorizationAccepted===true&&data.authorizationBy===personId&&!!data.authorizationIdentity&&!!data.authorizationAt&&!!data.authorizationName&&data.authorizationVersion===BANK_AUTHORIZATION_VERSION&&data.authorizationBinding===bankBinding(data);
}
export function bankHasPaperAuthorization(data:Record<string,unknown>,personId:string|undefined,records:HrRecord[]) {
 return records.some(r=>r.id===data.signedDocumentId&&r.kind==='document'&&r.personId===personId&&r.data.category==='Bank Authorization'&&r.data.signatureStatus==='Wet Signature Verified');
}
export function validateBankFields(data:Record<string,unknown>,required=false) {
 if(data.routingNumber&&!validRoutingNumber(data.routingNumber))throw new AppError('Enter a valid nine-digit ABA routing number.');
 if(data.accountNumber&&!/^\d{4,17}$/.test(String(data.accountNumber)))throw new AppError('Enter an account number with 4–17 digits.');
 if(data.accountType&&!['Checking','Savings'].includes(String(data.accountType)))throw new AppError('Choose Checking or Savings.');
 for(const key of ['nameOnAccount','bankName'])if(String(data[key]||'').length>160)throw new AppError('Account and bank names must be 160 characters or fewer.');
 if(required)for(const key of ['nameOnAccount','routingNumber','accountNumber','accountType','bankName'])if(!String(data[key]||'').trim())throw new AppError('Complete '+key.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
}
export function bankSummary(record:HrRecord):HrRecord {
 const allowed=['status','bankName','accountType','accountLast4','effectiveDate','reviewedAt','reviewedBy','institutionLookupStatus','institutionLookupSource','institutionLookupAt','authorizationAt','authorizationName','authorizationBy','signedDocumentId'];
 return {...record,data:Object.fromEntries(allowed.filter(k=>record.data[k]!==undefined).map(k=>[k,record.data[k]]))};
}
export function currentBankRecord(records:HrRecord[],day:string) {
 return records.filter(r=>r.kind==='bank'&&r.data.status==='Verified'&&String(r.data.effectiveDate||'0000-00-00')<=day).sort((a,b)=>String(b.data.effectiveDate||b.createdAt.slice(0,10)).localeCompare(String(a.data.effectiveDate||a.createdAt.slice(0,10)))||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0];
}
