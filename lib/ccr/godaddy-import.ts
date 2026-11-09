import {AppError} from '../shared/errors.ts';
import {auditDay} from '../shared/audit-format.ts';
import {blankChargeback,checkedChargeback,cardBrands,transactionZones,type Chargeback,type ServiceFee} from './chargeback.ts';

export const godaddyCsvMaxBytes=300000;
export const godaddyCsvMaxRows=200;
export const godaddyRequiredHeaders=['transactionId','disputeId','transactionDay','originalTransactionCents','disputedAmountCents','cardBrand','cardLast4','rawStatus'] as const;
const optionalHeaders=['caseNumber','caseKey','processor','currency','customerName','cardholderName','rawCardholderLabel','rawListCustomerLabel','transactionTime','transactionZone','reportedDay','responseDeadlineDay','responseDeadlineTime','responseDeadlineZone','rawPhase','rawReason','rawActionNeeded','rawStatusExplanation','customerCollectionStage','collectionStageBasis','identityBasis','sourceFiles','sourceNotes','customerEmail','customerPhone','customerAddress','accountName','propertyAddress','stockNumber','towbookCallNumber','vehicleYear','vehicleMake','vehicleModel','plate','vin','towDay','releaseDay','serviceFeesJson','nextAction','decisionDay','decisionReference'] as const;
export const godaddyCsvHeaders=[...godaddyRequiredHeaders,...optionalHeaders];
export const godaddyCsvTemplate=()=>godaddyCsvHeaders.join(',')+'\r\n';
type Cells=Record<string,string>;
export type GoDaddyImportRecord={section:'recovery';category:'Chargeback';title:string;status:'Open';reference:string;dueOn:string;nextAction:string;amountCents:number;steps:string[];chargeback:Chargeback;note:string};
export type GoDaddyImportCandidate={key:string;sourceKeys:string[];rowNumber:number;sourceCase:string;transactionId:string;disputeId:string;sourceStatus:string;sourcePhase:string;sourceAccountName:string;warnings:string[];record:GoDaddyImportRecord};
export type GoDaddyImportResult={candidates:GoDaddyImportCandidate[];warnings:string[];duplicatesSkipped:number};
const fail=(message:string):never=>{throw new AppError(message);};
const normalize=(value:string)=>value.trim().replace(/[\s-]+/g,'_').toUpperCase();

/** Bounded RFC 4180 reader. A reviewed CSV is data; formulas and markup are never evaluated. */
export function readGoDaddyCsv(input:string):string[][]{
 if(typeof input!=='string'||!input.trim())return fail('Choose or paste a reviewed GoDaddy disputes CSV.');
 if(new TextEncoder().encode(input).byteLength>godaddyCsvMaxBytes)throw new AppError('Use a GoDaddy CSV up to 300 KB.',413);
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input))return fail('The CSV contains unsupported control characters.');
 const text=input.replace(/^\uFEFF/,''),rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false,started=false;
 const addCell=()=>{if(cell.length>30000)fail('A CSV cell exceeds the supported size.');row.push(cell);if(row.length>80)fail('Use the columns in the GoDaddy CSV template.');cell='';closed=false;started=false;};
 const addRow=()=>{addCell();if(row.some(v=>v.trim()))rows.push(row);row=[];if(rows.length>godaddyCsvMaxRows+1)fail('Import no more than 200 disputes at a time.');};
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(closed){if(ch===','){addCell();continue;}if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;addRow();continue;}return fail('Check CSV quoting: text follows a closed quoted field.');}
  if(ch==='"'){if(started||cell)return fail('Check the CSV quoting around a field.');quoted=true;started=true;}
  else if(ch===',')addCell();
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;addRow();}
  else{cell+=ch;started=true;}
 }
 if(quoted)return fail('The CSV ends inside a quoted field.');
 if(started||closed||cell||row.length)addRow();
 return rows;
}
function clean(value:string|undefined,max:number,label:string,multiline=false){const v=(value||'').trim();if(v.length>max||(!multiline&&/[\r\n\t]/.test(v)))return fail('Check the '+label+' length and format in the CSV.');return v;}
function day(value:string,label:string){if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!auditDay(value)))return fail('Enter a valid '+label+' in YYYY-MM-DD format.');return value;}
function clock(value:string,date:string,label:string){if(value&&(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))return fail('The '+label+' needs a valid date and 24-hour time (HH:mm).');return value;}
function zone(value:string,time:string,label:string){if(value&&(!time||!Object.hasOwn(transactionZones,value)))return fail('Use the recorded '+label+' time zone, or leave it blank when unknown.');return value;}
function cents(value:string,label:string){if(!/^\d+$/.test(value))return fail('Enter the '+label+' as whole cents, such as 12550 for $125.50.');const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>99999999999)return fail('The '+label+' is outside the supported amount range.');return n;}
export function goDaddySourceId(value:string){const v=value.trim();if(!/^[A-Za-z0-9_-]{1,180}$/.test(v))return fail('Each row needs a valid GoDaddy transaction ID and dispute ID.');return /^[0-9a-f]{8}$/i.test(v)?v.toLowerCase():v;}
export function genericGoDaddyName(value:string){return /^(?:VISA\s+CARDHOLDER|CARD\s*HOLDER|CARD\s+CUSTOMER|VALUED\s+CUSTOMER|UNKNOWN(?:\s+CUSTOMER)?|NOT\s+(?:PROVIDED|IDENTIFIED)|N\/?A)$/i.test(value.trim());}
function personName(value:string|undefined,label:string,warnings:string[]){const v=clean(value,180,label);if(v&&genericGoDaddyName(v)){warnings.push('A generic '+label+' label was kept in the source notes; the name field remains blank.');return '';}return v;}
function brand(value:string){const alias:Record<string,string>={VISA:'Visa',MASTERCARD:'Mastercard',MASTER_CARD:'Mastercard',AMERICAN_EXPRESS:'American Express',AMEX:'American Express',DISCOVER:'Discover',OTHER:'Other',UNKNOWN:'Unknown','':'Unknown'};const out=alias[normalize(value)];if(!out||!(cardBrands as readonly string[]).includes(out))return fail('Choose Visa, Mastercard, American Express, Discover, Other or Unknown for cardBrand.');return out;}
function serviceFees(raw:string):ServiceFee[]{
 if(!raw)return [];
 let value:unknown;try{value=JSON.parse(raw);}catch{return fail('The serviceFeesJson column must contain a JSON list of original invoice fees.');}
 if(!Array.isArray(value)||value.length>100)return fail('Use up to 100 original invoice fee items.');
 return value.map((v,i)=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['id','label','cents','reference'].includes(k)))return fail('Each original fee must have only id, label, cents and reference fields.');
  return {...v,id:v.id||'godaddy-service-'+(i+1)} as ServiceFee;
 });
}

function candidate(row:Cells,rowNumber:number,filename:string):GoDaddyImportCandidate{
 const warnings:string[]=[],notes:string[]=[],sourceCase=clean(row.caseNumber,40,'source case'),sourceRef=filename+' · row '+rowNumber+(sourceCase?' · '+sourceCase:'');
 const transactionId=goDaddySourceId(clean(row.transactionId,180,'transaction ID')),disputeId=goDaddySourceId(clean(row.disputeId,180,'dispute ID'));
 const sourceStatus=normalize(clean(row.rawStatus,40,'processor status'));
 if(!['NEEDS_RESPONSE','IN_REVIEW','LOST','WON'].includes(sourceStatus))return fail('Use the reviewed GoDaddy status: NEEDS RESPONSE, IN REVIEW, LOST or WON.');
 const processor=clean(row.processor,40,'processor');if(processor&&!['GODADDY','GODADDY_PAYMENTS'].includes(normalize(processor)))return fail('This CSV contains a different payment processor.');
 const currency=clean(row.currency,3,'currency');if(currency&&currency!=='USD')return fail('This importer supports USD disputes only.');
 const principal=cents(clean(row.disputedAmountCents,20,'disputed amount'),'disputed amount'),original=cents(clean(row.originalTransactionCents,20,'original payment'),'original payment');
 const c=blankChargeback(),d=c.details!;
 c.processor='GoDaddy Payments';c.noticeRef=sourceRef;
 d.customerName=personName(row.customerName,'customer name',warnings);d.cardholderName=personName(row.cardholderName,'cardholder name',warnings);
 d.transactionReference=transactionId;d.disputeId=disputeId;d.originalTransactionCents=original;
 d.transactionDay=day(clean(row.transactionDay,10,'payment date'),'payment date');if(!d.transactionDay)return fail('Each row needs its captured payment date.');
 d.transactionTime=clock(clean(row.transactionTime,5,'payment time'),d.transactionDay,'payment time');d.transactionZone=zone(clean(row.transactionZone,50,'payment zone'),d.transactionTime,'payment');
 d.cardBrand=brand(clean(row.cardBrand,40,'card brand'));d.cardLast4=clean(row.cardLast4,4,'card last four');if(d.cardLast4&&!/^\d{4}$/.test(d.cardLast4))return fail('Enter exactly the last four card digits as text, preserving leading zeros.');
 d.reportedDay=day(clean(row.reportedDay,10,'date disputed'),'date disputed');d.disputeReason=clean(row.rawReason,500,'dispute reason');
 c.deadlineDay=day(clean(row.responseDeadlineDay,10,'response deadline'),'response deadline');c.deadlineTime=clock(clean(row.responseDeadlineTime,5,'deadline time'),c.deadlineDay,'response deadline');c.zone=zone(clean(row.responseDeadlineZone,50,'deadline zone'),c.deadlineTime,'deadline');
 const textDetails={customerEmail:180,customerPhone:80,customerAddress:400,propertyAddress:400,stockNumber:80,towbookCallNumber:80,vehicleYear:4,vehicleMake:80,vehicleModel:100,plate:30,vin:17} as const;
 for(const [key,max] of Object.entries(textDetails))Object.assign(d,{[key]:clean(row[key],max,key)});
 d.towDay=day(clean(row.towDay,10,'tow date'),'tow date');d.releaseDay=day(clean(row.releaseDay,10,'release date'),'release date');
 const sourceAccountName=clean(row.accountName,200,'tow-from account');
 const sourcePhase=clean(row.rawPhase,100,'dispute phase'),rawCardholder=clean(row.rawCardholderLabel,180,'raw cardholder label'),rawCustomer=clean(row.rawListCustomerLabel,180,'raw customer label');
 const collectionStage=clean(row.customerCollectionStage,60,'collection stage');if(collectionStage&&!['NOT_STARTED','NOT_ESTABLISHED','UNKNOWN'].includes(normalize(collectionStage)))return fail('Use Not Started, Not established, or a blank collection stage. Record later recovery activity in the case after import.');
 const collectionBasis=clean(row.collectionStageBasis,1500,'collection stage evidence',true),identityBasis=clean(row.identityBasis,1500,'identity evidence',true);
 const sourceFiles=clean(row.sourceFiles,4000,'source file references',true),sourceNotes=clean(row.sourceNotes,6000,'reviewed source notes',true);
 c.serviceFees=serviceFees(clean(row.serviceFeesJson,20000,'original fee data',true));
 c.decision=sourceStatus==='LOST'?'Cardholder Prevailed':sourceStatus==='WON'?'Merchant Prevailed':'Pending';
 const decisionDay=day(clean(row.decisionDay,10,'bank decision date'),'bank decision date'),decisionReference=clean(row.decisionReference,180,'bank decision reference');
 if(c.decision==='Pending'&&(decisionDay||decisionReference))return fail('A pending bank decision cannot have a final decision date or reference. Review the source status.');
 if(c.decision!=='Pending'){c.decisionDay=decisionDay;c.decisionRef=decisionReference||sourceRef+' · GoDaddy '+sourceStatus;}
 c.disposition='Open';c.reply='Not Yet Verified';c.entries=[];c.mailings=[];c.mail='Not Started';c.trespassReview='Not Requested';
 if(sourceStatus==='LOST'&&normalize(collectionStage)==='NOT_STARTED')c.recoveryStage='Find Release Record';
 notes.push('Reviewed GoDaddy CSV: '+sourceRef+'. Transaction '+transactionId+'; dispute '+disputeId+'.');
 notes.push('Captured payment: '+d.transactionDay+(d.transactionTime?' '+d.transactionTime:'')+'; time zone '+(d.transactionZone||'not stated')+'. Original amount '+original+' cents; disputed amount '+principal+' cents.');
 notes.push('Processor status as supplied: '+row.rawStatus+'.'+(sourcePhase?' Displayed phase: '+sourcePhase+'.':''));
 if(d.reportedDay)notes.push('Date disputed: '+d.reportedDay+'. This is separate from the payment date.');
 if(c.deadlineDay)notes.push('Processor response deadline: '+c.deadlineDay+(c.deadlineTime?' '+c.deadlineTime:'')+'; time zone '+(c.zone||'not stated')+'. An unknown zone does not establish a UTC deadline instant.');
 if(d.transactionTime&&!d.transactionZone)warnings.push('The payment clock time is recorded, but its source time zone is unknown.');
 if(c.deadlineTime&&!c.zone)warnings.push('The response deadline clock time is recorded with an unknown zone; deadline urgency uses the date.');
 if(principal!==original)warnings.push('Disputed '+principal+' cents differs from the captured '+original+' cents; both amounts are retained.');
 if(rawCardholder||rawCustomer)notes.push('Raw cardholder label: '+(rawCardholder||'[blank]')+'. Raw customer label: '+(rawCustomer||'[blank]')+'.');
 if(row.customerName&&genericGoDaddyName(row.customerName)||row.cardholderName&&genericGoDaddyName(row.cardholderName))notes.push('Supplied name labels: customer '+(row.customerName||'[blank]')+'; cardholder '+(row.cardholderName||'[blank]')+'. Generic labels were not treated as people.');
 if(identityBasis)notes.push('Identity evidence: '+identityBasis);
 if(!d.customerName&&!d.cardholderName)warnings.push('Customer identity is not supplied; match the Towbook release record before contacting anyone.');
 if(sourceAccountName)notes.push('Tow-from account as supplied: '+sourceAccountName+'. A directory link is added only for an exact, unique authorized account name.');
 if(d.disputeReason)notes.push('Processor reason as supplied: '+d.disputeReason+'. This is the recorded dispute reason, not a finding of misconduct.');
 if(sourcePhase==='Pre-Arbitration')notes.push('The displayed phase alone does not prove an active election deadline, signed election or submitted response.');
 const action=clean(row.rawActionNeeded,500,'processor action'),explanation=clean(row.rawStatusExplanation,1800,'processor explanation',true);
 if(action)notes.push('Processor action as printed: '+action+'.');if(explanation)notes.push('Processor explanation: '+explanation);
 if(collectionStage)notes.push('Collection stage as supplied: '+collectionStage+'.'+(collectionBasis?' Basis: '+collectionBasis:''));
 notes.push('Response submission, submitter and submission date remain unverified. No payment, processor credit, refund, postage, processor fee, certified mailing, contact outcome, appointment or court filing was created by this import.');
 if(sourceFiles)notes.push('Referenced source files (not attached by CSV import): '+sourceFiles);
 if(sourceNotes)notes.push('Reviewed source notes:\n'+sourceNotes);
 c.sourceNotes=notes.join('\n');if(c.sourceNotes.length>8000)return fail('Row '+rowNumber+' has too many source notes; shorten them without removing material source differences.');
 c.dispositionNote='Processor facts imported for review. Actual recovery remains unverified; source references do not prove receipt of money or delivery of a letter.';
 const checked=checkedChargeback(c,undefined,principal)!;
 const identity=d.customerName||d.cardholderName||'Unknown customer';
 const title=(identity+' · GoDaddy '+disputeId).slice(0,160);
 const defaultAction=sourceStatus==='LOST'?(normalize(collectionStage)==='NOT_STARTED'?'Find Towbook release record; prepare certified demand letter':'Find Towbook release record; verify current recovery correspondence and the next action'):sourceStatus==='NEEDS_RESPONSE'?'Find Towbook release record; prepare processor evidence before the response deadline':sourceStatus==='WON'?'Verify the posted processor credit and match the Towbook release record':'Find Towbook release record; verify response submission and monitor the bank decision';
 const nextAction=clean(row.nextAction,900,'next action')||defaultAction;
 return {key:'godaddy:dispute:'+disputeId,sourceKeys:['godaddy:transaction:'+transactionId,'godaddy:dispute:'+disputeId],rowNumber,sourceCase,transactionId,disputeId,sourceStatus:sourceStatus.replaceAll('_',' '),sourcePhase,sourceAccountName,warnings,
  record:{section:'recovery',category:'Chargeback',title,status:'Open',reference:disputeId,dueOn:sourceStatus==='NEEDS_RESPONSE'?c.deadlineDay:'',nextAction,amountCents:principal,steps:[],chargeback:checked,note:'Imported reviewed GoDaddy source facts from '+sourceRef+'. No recovery payment or mailing was inferred.'}};
}

export function parseGoDaddyDisputesCsv(text:string,filename='godaddy-disputes.csv'):GoDaddyImportResult{
 const rows=readGoDaddyCsv(text);if(rows.length<2)return fail('The CSV needs a header and at least one reviewed dispute.');
 const headers=rows[0].map(h=>h.trim());if(headers.some(h=>!h)||new Set(headers).size!==headers.length)return fail('CSV column names must be present and unique.');
 for(const header of godaddyRequiredHeaders)if(!headers.includes(header))return fail('The CSV is missing '+header+'. Use the GoDaddy template or the reviewed normalized CSV.');
 const unsupported=headers.filter(h=>!(godaddyCsvHeaders as readonly string[]).includes(h));if(unsupported.length)return fail('Unsupported CSV column: '+unsupported[0]+'. Use sourceNotes for additional reviewed facts; do not include full card or identity document numbers.');
 const safeName=filename.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,80)||'godaddy-disputes.csv';
 const candidates:GoDaddyImportCandidate[]=[],warnings:string[]=[],seen=new Map<string,{fingerprint:string;rowNumber:number}>(),transactions=new Map<string,string>();let duplicatesSkipped=0;
 for(let index=1;index<rows.length;index++){
  if(rows[index].length!==headers.length)return fail('CSV row '+(index+1)+' has a different number of fields than its header.');
  const row=Object.fromEntries(headers.map((header,i)=>[header,rows[index][i].trim()]));
  let c:GoDaddyImportCandidate;try{c=candidate(row,index+1,safeName);}catch(error){if(error instanceof AppError)throw new AppError('Row '+(index+1)+': '+error.message,error.status);throw error;}
  const transactionKey=transactions.get(c.transactionId);if(transactionKey&&transactionKey!==c.key)return fail('One GoDaddy transaction has different dispute IDs in this CSV. Review those rows before importing.');transactions.set(c.transactionId,c.key);
  const fingerprint=JSON.stringify(Object.entries(row).filter(([key])=>!['caseNumber','caseKey'].includes(key)).sort(([a],[b])=>a.localeCompare(b)));
  const previous=seen.get(c.key);if(previous){if(previous.fingerprint!==fingerprint)return fail('Rows '+previous.rowNumber+' and '+c.rowNumber+' have conflicting facts for the same GoDaddy dispute.');duplicatesSkipped++;continue;}
  seen.set(c.key,{fingerprint,rowNumber:c.rowNumber});candidates.push(c);warnings.push(...c.warnings.map(w=>'Row '+c.rowNumber+': '+w));
 }
 return {candidates,warnings,duplicatesSkipped};
}
