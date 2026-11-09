import {AppError} from '../shared/errors.ts';
import {auditDay} from '../shared/audit-format.ts';

export const cardBrands=['Visa','Mastercard','American Express','Discover','Other','Unknown'] as const;
export const recoveryDispositions=['Unverified','Open','Partial Recovery','Recovered','Not Recovered','No Response','Court Planned','Court Filed','Final Loss'] as const;
export const recoveryStages=['Not Reviewed','Find Release Record','Prepare Certified Demand','Awaiting Demand Delivery','Awaiting Payment','Review Returned Mail','Court Review','Complete'] as const;
export const trespassReviews=['Not Requested','Needs Identity Verification','Pending Staff Review','Reviewed'] as const;
export const transactionZones={'America/Chicago':'Central (Austin)','America/Denver':'Mountain','America/Los_Angeles':'Pacific','America/New_York':'Eastern','America/Phoenix':'Arizona','Pacific/Honolulu':'Hawaii','America/Anchorage':'Alaska','UTC':'UTC'} as const;
export const paymentMethods=['Cash','Check','Bank Transfer','Card','Other'] as const;
export const mailingStages=['Prepared','Submitted for Mailing','Reported Mailed','Delivered','Returned or Unclaimed'] as const;
export type ChargebackDetails={customerName:string;cardholderName:string;customerEmail:string;customerPhone:string;customerAddress:string;accountId:string;accountName:string;propertyAddress:string;stockNumber:string;vehicleYear:string;vehicleMake:string;vehicleModel:string;plate:string;vin:string;towDay:string;releaseDay:string;transactionDay:string;transactionReference:string;disputeId:string;cardBrand:string;cardLast4:string;disputeReason:string;reportedDay:string;originalTransactionCents:number|null;transactionTime?:string;transactionZone?:string;towbookCallNumber?:string};
export type ServiceFee={id:string;label:string;cents:number;reference:string};
export type ChargeMailing={id:string;recipient:string;address:string;documentRef:string;stage:typeof mailingStages[number];submittedDay:string;mailedDay:string;deliveryDay:string;tracking:string;trackingScope:'Individual'|'Mailing Group'|'Unknown';evidenceRef:string;notes:string};

export function blankChargebackDetails():ChargebackDetails{return {customerName:'',cardholderName:'',customerEmail:'',customerPhone:'',customerAddress:'',accountId:'',accountName:'',propertyAddress:'',stockNumber:'',vehicleYear:'',vehicleMake:'',vehicleModel:'',plate:'',vin:'',towDay:'',releaseDay:'',transactionDay:'',transactionTime:'',transactionZone:'',towbookCallNumber:'',transactionReference:'',disputeId:'',cardBrand:'Unknown',cardLast4:'',disputeReason:'',reportedDay:'',originalTransactionCents:null};}
export function blankChargeMailing():ChargeMailing{return {id:crypto.randomUUID(),recipient:'',address:'',documentRef:'',stage:'Prepared',submittedDay:'',mailedDay:'',deliveryDay:'',tracking:'',trackingScope:'Unknown',evidenceRef:'',notes:''};}
export const textField=(v:unknown,max:number,label:string,multiline=false):string=>{if(v==null)return '';if(typeof v!=='string'||v.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v))throw new AppError('Check '+label+' and its length.');return v.trim();};
export function dayField(v:unknown,label:string){const d=textField(v,10,label);if(d&&!auditDay(d))throw new AppError('Enter a valid '+label+' date.');return d;}
export function centField(v:unknown,label:string,optional=false):number|null{if(optional&&(v===null||v===undefined||v===''))return null;if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>99999999999)throw new AppError('Enter a valid '+label+' amount in cents.');return v;}
function object(v:unknown,label:string):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new AppError('Check '+label+'.');return v as Record<string,unknown>;}
function itemId(v:unknown,seen:Set<string>){const id=textField(v,64,'item ID');if(!/^[\w-]{1,64}$/.test(id)||seen.has(id))throw new AppError('Each item needs a unique saved ID.');seen.add(id);return id;}

export function checkedChargebackDetails(v:unknown,old?:ChargebackDetails):ChargebackDetails{
 const b=object(v,'customer, vehicle and payment details'),d=blankChargebackDetails();
 const limits:Partial<Record<keyof ChargebackDetails,number>>={customerName:180,cardholderName:180,customerEmail:180,customerPhone:80,customerAddress:400,accountId:130,accountName:200,propertyAddress:400,stockNumber:80,vehicleYear:4,vehicleMake:80,vehicleModel:100,plate:30,vin:17,transactionReference:180,disputeId:180,cardBrand:30,cardLast4:4,disputeReason:500};
 for(const [key,max] of Object.entries(limits))Object.assign(d,{[key]:textField(b[key],max,key)});
 for(const key of ['towDay','releaseDay','transactionDay','reportedDay'] as const)d[key]=dayField(b[key],key.replace('Day',''));
 d.transactionTime=textField(b.transactionTime===undefined?old?.transactionTime:b.transactionTime,5,'payment time');
 d.transactionZone=textField(b.transactionZone===undefined?old?.transactionZone:b.transactionZone,50,'payment time zone');
 d.towbookCallNumber=textField(b.towbookCallNumber===undefined?old?.towbookCallNumber:b.towbookCallNumber,80,'Towbook call number');
 if(d.transactionTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.transactionTime))throw new AppError('Enter the payment time as HH:mm using a 24-hour clock.');
 if(d.transactionZone&&!Object.hasOwn(transactionZones,d.transactionZone))throw new AppError('Choose the payment time zone from the source, or leave it Unknown.');
 d.originalTransactionCents=centField(b.originalTransactionCents,'original transaction',true);
 if(d.accountId&&!/^[\w:-]{1,130}$/.test(d.accountId))throw new AppError('Choose an account from the directory.');
 if(d.customerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.customerEmail))throw new AppError('Enter a valid customer email.');
 if(d.vehicleYear&&!/^(19|20|21)\d{2}$/.test(d.vehicleYear))throw new AppError('Enter the four-digit vehicle year.');
 d.vin=d.vin.toUpperCase();if(d.vin&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(d.vin))throw new AppError('Enter the complete 17-character VIN, or leave it blank and describe partial information in the source notes.');
 d.cardBrand=d.cardBrand||'Unknown';if(!(cardBrands as readonly string[]).includes(d.cardBrand))throw new AppError('Choose a listed card brand.');
 if(d.cardLast4&&!/^\d{4}$/.test(d.cardLast4))throw new AppError('Enter only the last four digits of the card.');
 return d;
}
export function checkedServiceFees(v:unknown):ServiceFee[]{
 if(!Array.isArray(v)||v.length>100)throw new AppError('Use up to 100 original service fee items.');const seen=new Set<string>();
 return v.map(raw=>{const b=object(raw,'original service fee'),id=itemId(b.id,seen),label=textField(b.label,120,'fee label'),reference=textField(b.reference,180,'fee source'),cents=centField(b.cents,'service fee')!;if(!label||!reference)throw new AppError('Each service fee needs a label and invoice or document reference.');return {id,label,cents,reference};});
}
export function checkedMailings(v:unknown):ChargeMailing[]{
 if(!Array.isArray(v)||v.length>100)throw new AppError('Use up to 100 mailing records.');const seen=new Set<string>();
 return v.map(raw=>{const b=object(raw,'mailing'),m:ChargeMailing={id:itemId(b.id,seen),recipient:textField(b.recipient,200,'recipient'),address:textField(b.address,400,'recipient address'),documentRef:textField(b.documentRef,180,'letter reference'),stage:b.stage as ChargeMailing['stage'],submittedDay:dayField(b.submittedDay,'mailing submission'),mailedDay:dayField(b.mailedDay,'mailing'),deliveryDay:dayField(b.deliveryDay,'delivery or return'),tracking:textField(b.tracking,100,'tracking number'),trackingScope:(b.trackingScope||'Unknown') as ChargeMailing['trackingScope'],evidenceRef:textField(b.evidenceRef,180,'mailing evidence'),notes:textField(b.notes,1500,'mailing notes',true)};
  if(!m.recipient||!m.documentRef)throw new AppError('Record the recipient and letter reference for each mailing.');
  if(!(mailingStages as readonly unknown[]).includes(m.stage)||!['Individual','Mailing Group','Unknown'].includes(m.trackingScope))throw new AppError('Choose the mailing status and tracking scope.');
  if(m.stage==='Submitted for Mailing'&&!m.submittedDay)throw new AppError('Record when the letter was submitted for mailing.');
  if(['Reported Mailed','Delivered','Returned or Unclaimed'].includes(m.stage)&&!m.mailedDay)throw new AppError('Record the reported mailing date.');
  if(['Delivered','Returned or Unclaimed'].includes(m.stage)&&(!m.deliveryDay||!m.evidenceRef))throw new AppError('A delivery or return needs its date and supporting proof. A submission certificate does not confirm delivery.');
  if(m.submittedDay&&m.mailedDay&&m.mailedDay<m.submittedDay||m.deliveryDay&&m.mailedDay&&m.deliveryDay<m.mailedDay)throw new AppError('Check the order of the mailing dates.');
  return m;
 });
}
