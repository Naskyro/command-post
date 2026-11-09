import {AppError} from '../shared/errors.ts';
import {auditDay} from '../shared/audit-format.ts';
import {blankChargeback,type Chargeback} from './chargeback.ts';

export const squareCsvMaxBytes=1024*1024;
export const squareCsvMaxRows=200;
const requiredHeaders=['payment_id','status','disputed_usd','payment_usd','payment_datetime_chicago','card_brand','card_last4','reason','response_due_date'] as const;
type Cells=Record<string,string>;
export type SquareImportRecord={section:'recovery';category:'Chargeback';title:string;status:'Open';reference:string;dueOn:string;nextAction:string;amountCents:number;steps:string[];chargeback:Chargeback;note:string};
export type SquareImportCandidate={key:string;sourceKeys:string[];rowNumber:number;sourceCase:string;paymentId:string;informationRequestId:string;sourceStatus:string;warnings:string[];record:SquareImportRecord};
export type SquareImportResult={candidates:SquareImportCandidate[];warnings:string[];duplicatesSkipped:number};
function fail(message:string):never{throw new AppError(message);}

/** Bounded RFC 4180 reader. Cell values remain data; no formula or markup is interpreted. */
export function readSquareCsv(input:string):string[][]{
 if(typeof input!=='string'||!input.trim())return fail('Choose a Square disputes CSV file.');
 if(new TextEncoder().encode(input).byteLength>squareCsvMaxBytes)return fail('The Square CSV must be 1 MB or smaller.');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))return fail('The CSV contains unsupported control characters.');
 const text=input.replace(/^\uFEFF/,''),rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false,started=false;
 const addCell=()=>{if(cell.length>100000)fail('A CSV cell exceeds the supported size.');row.push(cell);if(row.length>160)fail('This file has too many columns for a Square disputes export.');cell='';closed=false;started=false;};
 const addRow=()=>{addCell();if(row.some(x=>x.trim()!==''))rows.push(row);row=[];if(rows.length>squareCsvMaxRows+1)fail('Import no more than 200 disputes at a time.');};
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(closed){if(ch===','){addCell();continue;}if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;addRow();continue;}return fail('Check the CSV quoting: text follows a closed quoted cell.');}
  if(ch==='"'){if(started||cell)return fail('Check the CSV quoting around a field.');quoted=true;started=true;}
  else if(ch===',')addCell();
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;addRow();}
  else{cell+=ch;started=true;}
 }
 if(quoted)return fail('The CSV ends inside a quoted field.');
 if(started||closed||cell||row.length)addRow();
 return rows;
}
function clean(value:string|undefined,max=500){const v=(value||'').trim();if(v.length>max)return fail('A Square identifier or field is too long.');return v;}
function validDay(value:string,label:string){if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!auditDay(value)))return fail('Enter a valid '+label+' in the CSV (YYYY-MM-DD).');return value;}
function amount(value:string,label:string){
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value))return fail('Check the '+label+' dollar amount in the CSV.');
 const [dollars,cents='']=value.replaceAll(',','').split('.'),result=Number(dollars)*100+Number(cents.padEnd(2,'0'));
 if(!Number.isSafeInteger(result)||result<0||result>99999999999)return fail('The '+label+' amount is outside the supported range.');return result;
}
function integerAmount(value:string,label:string){if(!/^\d+$/.test(value))return fail('Check the '+label+' cents in the Square detail columns.');const n=Number(value);if(!Number.isSafeInteger(n)||n>99999999999)return fail('The '+label+' cents are outside the supported range.');return n;}
function normalizeStatus(v:string){return v.trim().toUpperCase().replace(/[\s-]+/g,'_');}
export function squareCardBrand(value:string){const key=normalizeStatus(value);return ({VISA:'Visa',MASTER_CARD:'Mastercard',MASTERCARD:'Mastercard',AMERICAN_EXPRESS:'American Express',AMEX:'American Express',DISCOVER:'Discover',UNKNOWN:'Unknown','':'Unknown'} as Record<string,string>)[key]||'Other';}
function agreed(values:string[],label:string,normalize:(v:string)=>string=x=>x){const provided=values.map(v=>v.trim()).filter(Boolean),unique=[...new Set(provided.map(normalize))];if(unique.length>1)return fail('The CSV has conflicting '+label+' values. Review the source row before importing.');return unique[0]||'';}
function instant(value:string,label:string){
 if(!value)return '';
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!auditDay(value))return fail('The '+label+' timestamp must include its recorded UTC offset.');
 const result=new Date(value);if(!Number.isFinite(result.getTime()))return fail('Check the '+label+' timestamp.');return result.toISOString();
}
function micros(value:string,label:string){if(!value)return '';if(!/^\d{1,18}$/.test(value))return fail('Check the '+label+' timestamp in the Square export.');const n=BigInt(value)/BigInt(1000);if(n>BigInt('8640000000000000'))return fail('The '+label+' timestamp is outside the supported date range.');const date=new Date(Number(n));if(!Number.isFinite(date.getTime()))return fail('Check the '+label+' timestamp.');return date.toISOString();}
function chicagoDay(iso:string){if(!iso)return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
function chicagoTime(iso:string){if(!iso)return '';const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));return p.hour+':'+p.minute;}
function sourceDay(row:Cells,prefix:string){const year=clean(row[prefix+'.year'],4),month=clean(row[prefix+'.monthOfYear'],2),day=clean(row[prefix+'.dayOfMonth'],2);if(!year&&!month&&!day)return '';if(!/^\d{4}$/.test(year)||!/^\d{1,2}$/.test(month)||!/^\d{1,2}$/.test(day))return fail('A Square calendar date is incomplete.');return validDay(year+'-'+month.padStart(2,'0')+'-'+day.padStart(2,'0'),prefix);}
function id(value:string,label:string,required=false){if((required&&!value)||(value&&!/^[A-Za-z0-9_-]{1,180}$/.test(value)))return fail('The CSV needs a valid '+label+'.');return value;}
function conflictDate(row:Cells,key:string,label:string,warnings:string[],notes:string[]){
 const d=micros(clean(row['detail.'+key+'.instantUsec'],18),label),l=micros(clean(row['list.'+key+'.instantUsec'],18),label);
 if(d)notes.push('Square detail '+label+': '+d);if(l&&l!==d)notes.push('Square list '+label+': '+l);
 if(d&&l&&d!==l){warnings.push('The detail and list '+label+' timestamps differ; its date is left unverified.');return '';}
 return d||l;
}
function responseInstants(raw:string){if(!raw.trim())return [];return raw.split(/\s*(?:;|\||\n)\s*/).filter(Boolean).map(s=>instant(s.trim(),'response received'));}

function candidateFromRow(row:Cells,rowNumber:number,filename:string):SquareImportCandidate{
 const notes:string[]=[],warnings:string[]=[],sourceCase=clean(row.case,40),sourceRef=filename+' · row '+rowNumber+(sourceCase?' · case '+sourceCase:'');
 const paymentId=id(agreed([row.payment_id,row['detail.paymentId'],row['detail.payment.id'],row['list.paymentId'],row['list.payment.id']].map(x=>clean(x,180)),'payment ID'),'Square payment ID',true);
 const informationRequestId=id(agreed([row['detail.informationRequestId'],row['list.informationRequestId']].map(x=>clean(x,180)),'information request ID'),'Square information request ID');
 const sourceStatus=agreed([row.status,row['detail.status'],row['list.status']].map(x=>clean(x,80)),'dispute status',normalizeStatus);if(!sourceStatus)return fail('Each Square row needs its dispute status.');
 const principal=amount(clean(row.disputed_usd,30),'disputed'),payment=amount(clean(row.payment_usd,30),'original payment');
 for(const prefix of ['detail','list']){
  for(const kind of ['disputeAmount','paymentAmount','heldAmount']){const currency=clean(row[prefix+'.'+kind+'.currencyCode'],10);if(currency&&currency!=='USD')return fail('This importer supports USD disputes only.');}
  const disputeCents=clean(row[prefix+'.disputeAmount.amount'],20),paymentCents=clean(row[prefix+'.paymentAmount.amount'],20);
  if(disputeCents&&integerAmount(disputeCents,'disputed amount')!==principal||paymentCents&&integerAmount(paymentCents,'payment amount')!==payment)return fail('The CSV dollar amounts conflict with its Square detail amounts.');
 }
 if(principal>payment)warnings.push('The disputed amount exceeds the original payment; review the processor record.');
 const brandRaw=agreed([row.card_brand,row['detail.cardBrand'],row['list.cardBrand']].map(x=>clean(x,40)),'card brand',normalizeStatus),brand=squareCardBrand(brandRaw);
 const last4=agreed([row.card_last4,row['detail.cardPanSuffix'],row['list.cardPanSuffix']].map(x=>clean(x,4)),'card last four digits');if(last4&&!/^\d{4}$/.test(last4))return fail('Card details must contain only the last four digits.');
 const reason=agreed([row.reason,row['detail.reason'],row['list.reason']].map(x=>clean(x,500)),'dispute reason',normalizeStatus);
 const namedDisputants=[row['detail.disputedBy'],row['list.disputedBy']].map(x=>clean(x,180)).filter(Boolean);
 agreed(namedDisputants,'named disputant',s=>s.replace(/\s+/g,' ').toUpperCase());
 const disputedBy=namedDisputants[0]||'';
 const payIso=instant(clean(row.payment_datetime_chicago,40),'payment'),payDetail=micros(clean(row['detail.paymentCreatedAt.instantUsec'],18),'payment'),payList=micros(clean(row['list.paymentCreatedAt.instantUsec'],18),'payment');
 if(new Set([payIso,payDetail,payList].filter(Boolean)).size>1)return fail('The payment timestamp conflicts between the CSV and Square detail columns.');
 const transactionIso=payIso||payDetail||payList;
 const deadline=agreed([validDay(clean(row.response_due_date,10),'response deadline'),sourceDay(row,'detail.responseDueDate'),sourceDay(row,'list.responseDueDate')],'response deadline');
 const expected=agreed([validDay(clean(row.expected_resolution_date,10),'expected resolution'),sourceDay(row,'detail.expectedResolutionDate'),sourceDay(row,'list.expectedResolutionDate')],'expected resolution date');
 const reported=conflictDate(row,'disputeReportedAt','reported',warnings,notes),decisionIso=conflictDate(row,'merchantResolutionDecisionDate','decision',warnings,notes);
 const rawResponse=clean(row.response_states,240),responseStates=rawResponse.split(/\s*(?:;|,|\||\n)\s*/).filter(Boolean).map(normalizeStatus),received=responseInstants(clean(row.responses_received_chicago,1000));
 const chargeback=blankChargeback(),details=chargeback.details!;
 chargeback.processor='Square';chargeback.noticeRef=sourceRef;chargeback.deadlineDay=deadline;chargeback.deadlineTime='';chargeback.zone='';
 details.transactionDay=chicagoDay(transactionIso);details.transactionTime=chicagoTime(transactionIso);details.transactionZone=transactionIso?'America/Chicago':'';details.transactionReference=paymentId;details.disputeId=informationRequestId;details.cardBrand=brand;details.cardLast4=last4;details.disputeReason=reason;details.reportedDay=chicagoDay(reported);details.originalTransactionCents=payment;details.cardholderName=disputedBy;
 chargeback.decision=sourceStatus==='WON'?'Merchant Prevailed':sourceStatus==='LOST'?'Cardholder Prevailed':'Pending';
 if(chargeback.decision!=='Pending'){chargeback.decisionDay=chicagoDay(decisionIso);chargeback.decisionRef=sourceRef+' · Square status '+sourceStatus;}
 if(responseStates.includes('CHALLENGED')||received.length){chargeback.reply='Response Reported (Submitter Unknown)';chargeback.replyDay=received.length===1?chicagoDay(received[0]):'';chargeback.replyRef=sourceRef+' · response received';notes.push('Square reports a challenged or received response. The export does not identify who submitted it or prove that PTE filed the response.');}
 else{chargeback.reply='Not Yet Verified';if(responseStates.includes('EXPIRED'))warnings.push('Square marks the response EXPIRED; the export does not identify whether the processor responded on PTE’s behalf.');}
 chargeback.disposition='Unverified';chargeback.entries=[];chargeback.mailings=[];chargeback.serviceFees=[];
 notes.unshift('Imported from '+sourceRef+'. Square payment ID: '+paymentId+'.'+(informationRequestId?' Information request ID: '+informationRequestId+'.':''));
 notes.push('Square status: '+sourceStatus+'. Response state(s): '+(rawResponse||'Not supplied')+'.');
 if(transactionIso)notes.push('Payment instant: '+transactionIso+'; local date and time shown in America/Chicago.'+(row.payment_datetime_chicago?' Original export timestamp: '+row.payment_datetime_chicago+'.':''));
 if(received.length)notes.push('Response received timestamp(s): '+received.join('; ')+'. Original Chicago export: '+row.responses_received_chicago+'.');
 if(deadline)notes.push('Processor response deadline: '+deadline+'. No deadline time or time zone was supplied; none was inferred.');
 if(expected)notes.push('Expected resolution date: '+expected+' (estimate, not a confirmed decision date).');
 const location=agreed([row.location,row['detail.locationName'],row['list.locationName']].map(x=>clean(x,180)),'Square location');if(location)notes.push('Square processing location: '+location+'. This is not an identified tow-from property.');
 if(brand==='Other')notes.push('Original processor card brand: '+brandRaw+'.');
 if(disputedBy)notes.push('Square explicitly identifies disputedBy as '+disputedBy+'. Stored in the cardholder field as the processor-named disputant; the tow customer or vehicle owner has not been independently identified.');
 notes.push((disputedBy?'The tow customer’s identity':'Customer and cardholder identities')+', vehicle, tow-from account, fee breakdown, and actual recovery payments are not established by this export. No recovery payment or processor credit was created.');
 if(clean(row.saved_answer_text,100000)||clean(row.evidence_file_contents,100000))notes.push('The CSV references saved-answer or evidence availability; original processor evidence attachments are not included by this import.');
 if(warnings.length)notes.push('Review: '+warnings.join(' '));
 chargeback.sourceNotes=notes.join('\n');
 if(chargeback.sourceNotes.length>8000)return fail('The Square row has too much metadata to import safely.');
 const key=informationRequestId?'square:information-request:'+informationRequestId:'square:payment:'+paymentId;
 const sourceKeys=['square:payment:'+paymentId,...(informationRequestId?['square:information-request:'+informationRequestId]:[])];
 const title=('Square chargeback · '+(disputedBy?disputedBy+' · ':'')+(brand==='Unknown'?'Card':brand)+(last4?' '+last4:'')+' · '+(details.transactionDay||paymentId.slice(-8))).slice(0,160);
 const nextAction=sourceStatus==='WON'?'Verify the processor credit in Finance and link the customer, vehicle, and tow-from account.':sourceStatus==='LOST'?'Verify any recovery payments, add customer contact, and record the current recovery disposition.':'Check the processor’s current decision and link the customer, vehicle, and tow-from account.';
 return {key,sourceKeys,rowNumber,sourceCase,paymentId,informationRequestId,sourceStatus,warnings,record:{section:'recovery',category:'Chargeback',title,status:'Open',reference:informationRequestId||paymentId,dueOn:'',nextAction,amountCents:principal,steps:[],chargeback,note:'Imported Square processor facts from '+sourceRef+'. Recovery disposition remains unverified until payments, credits, or follow-up evidence are recorded.'}};
}

export function parseSquareDisputesCsv(text:string,filename='disputes.csv'):SquareImportResult{
 const rows=readSquareCsv(text);if(rows.length<2)return fail('The CSV needs a header and at least one dispute.');
 const headers=rows[0].map(h=>h.trim());if(new Set(headers).size!==headers.length||headers.some(h=>!h))return fail('CSV column names must be present and unique.');
 for(const name of requiredHeaders)if(!headers.includes(name))return fail('This CSV is missing the '+name+' column from the Square disputes export.');
 const safeName=filename.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80)||'disputes.csv';
 const candidates:SquareImportCandidate[]=[],warnings:string[]=[],seen=new Map<string,{fingerprint:string;rowNumber:number}>(),paymentKeys=new Map<string,string>();let duplicatesSkipped=0;
 for(let index=1;index<rows.length;index++){
  if(rows[index].length!==headers.length)return fail('CSV row '+(index+1)+' has a different number of fields than the header.');
  const row=Object.fromEntries(headers.map((name,i)=>[name,rows[index][i].trim()])),candidate=candidateFromRow(row,index+1,safeName);
  const existingPaymentKey=paymentKeys.get(candidate.paymentId);if(existingPaymentKey&&existingPaymentKey!==candidate.key)return fail('The same Square payment appears with different or missing dispute IDs. Review those rows before importing.');paymentKeys.set(candidate.paymentId,candidate.key);
  const fingerprint=JSON.stringify(Object.entries(row).filter(([k])=>k!=='case').sort(([a],[b])=>a.localeCompare(b)));
  const prior=seen.get(candidate.key);
  if(prior){if(prior.fingerprint!==fingerprint)return fail('Rows '+prior.rowNumber+' and '+candidate.rowNumber+' describe the same Square dispute with conflicting values. Review them before import.');duplicatesSkipped++;continue;}
  seen.set(candidate.key,{fingerprint,rowNumber:candidate.rowNumber});candidates.push(candidate);warnings.push(...candidate.warnings.map(w=>'Row '+candidate.rowNumber+': '+w));
 }
 return {candidates,warnings,duplicatesSkipped};
}
