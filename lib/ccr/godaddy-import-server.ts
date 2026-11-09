import {createHash} from 'node:crypto';
import type {Viewer,FinRecord} from '@/lib/finance/model';
import type {ClaimChoice} from './claim-operations';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import {parseGoDaddyDisputesCsv,type GoDaddyImportCandidate} from './godaddy-import';
import {getRegister,registerChoices,insertReviewedRegisterEdition} from './register-server';
import {leadership,ownerChoices,prepareRegister,sectionAccess,type RegisterRecord} from './register-model';

const fingerprint=(value:string)=>createHash('sha256').update(value).digest('hex');
const recordId=(candidate:GoDaddyImportCandidate)=>'godaddy-'+fingerprint(candidate.key).slice(0,48);
const identity=(value:unknown)=>typeof value==='string'?value.trim():'';
const sourceId=(value:unknown)=>/^[a-f\d]{8}$/i.test(identity(value))?identity(value).toLowerCase():identity(value);
const nameKey=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('en-US');

/** Source identifiers are used only to find an existing case. A repeat import
 * never replaces staff edits, fees, payments, evidence or history. */
export function matchGoDaddyCase(candidate:GoDaddyImportCandidate,records:RegisterRecord[]):RegisterRecord|undefined{
 const matches=records.filter(record=>{
  if(record.id===recordId(candidate))return true;
  if(record.section!=='recovery'||record.category!=='Chargeback')return false;
  const c=record.chargeback,d=c?.details;
  if(c?.processor&&c.processor!=='GoDaddy Payments')return false;
  return sourceId(d?.transactionReference)===candidate.transactionId||sourceId(d?.disputeId)===candidate.disputeId||(!d?.disputeId&&sourceId(record.reference)===candidate.disputeId);
 });
 if(matches.length>1)throw new ConflictError('More than one existing case matches this GoDaddy transaction or dispute. Review those cases before importing this row.');
 const found=matches[0];if(!found)return undefined;
 const c=found.chargeback,d=c?.details,incoming=candidate.record.chargeback.details!;
 if(c?.processor!=='GoDaddy Payments')throw new ConflictError('An existing case uses this reference without a verified GoDaddy processor. Review its processor and source IDs before importing this row.');
 if(d?.transactionReference&&sourceId(d.transactionReference)!==candidate.transactionId||d?.disputeId&&sourceId(d.disputeId)!==candidate.disputeId)throw new ConflictError('An existing case has conflicting GoDaddy transaction and dispute IDs. Review the source identities before importing this row.');
 const mismatches:string[]=[];
 for(const [key,label] of [['cardLast4','card ending'],['transactionDay','payment date']] as const)if(d?.[key]&&incoming[key]&&d[key]!==incoming[key])mismatches.push(label);
 if(d?.cardBrand&&d.cardBrand!=='Unknown'&&incoming.cardBrand!=='Unknown'&&d.cardBrand!==incoming.cardBrand)mismatches.push('card brand');
 if(d?.originalTransactionCents!==null&&d?.originalTransactionCents!==undefined&&incoming.originalTransactionCents!==null&&d.originalTransactionCents!==incoming.originalTransactionCents)mismatches.push('original payment');
 for(const key of ['customerName','cardholderName'] as const)if(d?.[key]&&incoming[key]&&nameKey(d[key])!==nameKey(incoming[key]))mismatches.push(key==='customerName'?'customer name':'cardholder name');
 if(mismatches.length)throw new ConflictError('An existing case with these IDs has a different '+mismatches.join(', ')+'. Keep the existing record and review the identity conflict.');
 return found;
}

function bindAccount(candidate:GoDaddyImportCandidate,accounts:ClaimChoice[]){
 const source=candidate.sourceAccountName;
 if(!source)return {account:undefined,warning:''};
 // Exact name equality after case/Unicode normalization; never fuzzy-match an address or guess an ID.
 const matches=accounts.filter(a=>nameKey(a.name)===nameKey(source));
 if(matches.length===1)return {account:matches[0],warning:''};
 return {account:undefined,warning:matches.length?'The source account name matches more than one directory account. It will stay unlinked for review.':'The source account name has no exact directory match. It will stay unlinked; its source name and address are retained.'};
}

export async function importGoDaddyDisputes(viewer:Viewer,staff:FinRecord[],body:Record<string,unknown>){
 if(viewer.delegatedReadOnly||!sectionAccess(viewer,'recovery',true)||!leadership(viewer,staff))throw new ForbiddenError('A department head or executive with chargeback edit access must import processor records from their own signed-in session.');
 if(body.action!=='preview'&&body.action!=='import')throw new AppError('Review the GoDaddy CSV before importing selected cases.');
 if(typeof body.csv!=='string')throw new AppError('Choose or paste a reviewed GoDaddy CSV.');
 const filename=typeof body.filename==='string'?body.filename.trim():'godaddy-disputes.csv';
 if(!filename||filename.length>120||/[\x00-\x1f\x7f/\\]/.test(filename))throw new AppError('Use a short CSV filename without a folder path.');
 const parsed=parseGoDaddyDisputesCsv(body.csv,filename),sourceDigest=fingerprint(body.csv);
 const [register,directory]=await Promise.all([getRegister(viewer,'recovery',staff),registerChoices(viewer,'recovery')]);
 const existing=register.rows,bindings=parsed.candidates.map(c=>bindAccount(c,directory.accounts));
 // Bind the reviewed bytes, source filename and canonical account decisions.
 // Existing-case status is excluded so a successful retry remains idempotent.
 const digest=fingerprint(JSON.stringify({format:'godaddy-reviewed-csv-v1',filename,sourceDigest,accounts:parsed.candidates.map((c,i)=>({key:c.key,id:bindings[i].account?.id||'',name:bindings[i].account?.name||'',warning:bindings[i].warning}))}));
 const preview=parsed.candidates.map((c,i)=>{
  let existingId='',existingTitle='',conflict='';
  try{const found=matchGoDaddyCase(c,existing);existingId=found?.id||'';existingTitle=found?.title||'';}catch(error){if(!(error instanceof ConflictError))throw error;conflict=error.message;}
  const b=c.record.chargeback,d=b.details!;
  return {key:c.key,row:c.rowNumber,title:c.record.title,transactionId:c.transactionId,disputeId:c.disputeId,amountCents:c.record.amountCents,originalTransactionCents:d.originalTransactionCents,sourceStatus:c.sourceStatus,sourcePhase:c.sourcePhase,
   transactionDay:d.transactionDay,transactionTime:d.transactionTime||'',transactionZone:d.transactionZone||'',deadlineDay:b.deadlineDay,deadlineTime:b.deadlineTime,deadlineZone:b.zone,cardBrand:d.cardBrand,cardLast4:d.cardLast4,
   customerName:d.customerName,cardholderName:d.cardholderName,stockNumber:d.stockNumber,towbookCallNumber:d.towbookCallNumber||'',vehicle:[d.vehicleYear,d.vehicleMake,d.vehicleModel].filter(Boolean).join(' '),propertyAddress:d.propertyAddress,
   sourceAccountName:c.sourceAccountName,accountName:bindings[i].account?.name||'',warnings:[...c.warnings,...(bindings[i].warning?[bindings[i].warning]:[])],sourceNotes:b.sourceNotes||'',existingId,existingTitle,conflict};
 });
 const warnings=[...parsed.warnings,...bindings.flatMap((b,i)=>b.warning?['Row '+parsed.candidates[i].rowNumber+': '+b.warning]:[])];
 if(body.action==='preview')return {digest,cases:preview,warnings,duplicatesSkipped:parsed.duplicatesSkipped};
 if(body.digest!==digest)throw new ConflictError('The CSV, filename or matching account directory changed. Review the cases again before importing.');
 const selected=body.keys;
 if(!Array.isArray(selected)||!selected.length||selected.length>200||selected.some(key=>typeof key!=='string'||!parsed.candidates.some(c=>c.key===key))||new Set(selected).size!==selected.length)throw new AppError('Select the reviewed GoDaddy cases to import.');
 // Check every selected identity and record before the first write. A blocked
 // row cannot cause an earlier selected row to be partially imported.
 const chosen=parsed.candidates.map((candidate,index)=>({candidate,index})).filter(({candidate})=>selected.includes(candidate.key));
 const owners=ownerChoices(viewer,'recovery',staff),at=new Date().toISOString();
 const prepared=chosen.map(({candidate,index})=>{
  const old=matchGoDaddyCase(candidate,existing);if(old)return {candidate,old,next:undefined};
  const chargeback=structuredClone(candidate.record.chargeback),account=bindings[index].account;
  chargeback.details!.accountId=account?.id||'';chargeback.details!.accountName=account?.name||'';
  const next=prepareRegister(viewer,'recovery',{...candidate.record,chargeback,version:0,ownerId:viewer.person,resolutionReference:'',note:candidate.record.note+'\nReviewed CSV SHA-256: '+sourceDigest},undefined,owners,true,at,directory.accounts);
  next.id=recordId(candidate);return {candidate,old:undefined,next};
 });
 const created:{id:string;title:string}[]=[],skipped:{id:string;title:string}[]=[];
 for(const item of prepared){
  if(item.old){skipped.push({id:item.old.id,title:item.old.title});continue;}
  const next=item.next!;
  try{await insertReviewedRegisterEdition(next);existing.push(next);created.push({id:next.id,title:next.title});}
  catch(error){
   if(!(error instanceof ConflictError))throw error;
   const found=matchGoDaddyCase(item.candidate,(await getRegister(viewer,'recovery',staff)).rows);
   if(!found)throw error;existing.push(found);skipped.push({id:found.id,title:found.title});
  }
 }
 return {created,skipped,digest,warnings};
}
