import {createHash} from 'node:crypto';
import type {Viewer,FinRecord} from '@/lib/finance/model';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import {parseSquareDisputesCsv} from './square-import';
import {getRegister,insertReviewedRegisterEdition} from './register-server';
import {leadership,ownerChoices,prepareRegister,sectionAccess,type RegisterRecord} from './register-model';

const fingerprint=(s:string)=>createHash('sha256').update(s).digest('hex');
/** Imports run with the signed-in person's normal casework scope. Source identities
 * make retries idempotent; a repeat export never overwrites staff's case updates. */
export async function importSquareDisputes(v:Viewer,staff:FinRecord[],body:Record<string,unknown>){
 if(!sectionAccess(v,'recovery',true)||!leadership(v,staff))throw new ForbiddenError('A department head or executive with chargeback access can import processor records.');
 if(body.action!=='preview'&&body.action!=='import')throw new AppError('Preview the processor export before importing.');
 if(typeof body.csv!=='string'||body.csv.length>300000)throw new AppError('Use a CSV export up to 300 KB.',413);
 const name=typeof body.filename==='string'?body.filename.trim():'disputes.csv';
 if(!name||name.length>120||/[\x00-\x1f/\\]/.test(name))throw new AppError('Use a short export filename.');
 const parsed=parseSquareDisputesCsv(body.csv,name),digest=fingerprint(body.csv);
 const existing=(await getRegister(v,'recovery',staff)).rows;
 const match=(candidate:typeof parsed.candidates[number],records:RegisterRecord[])=>{
  const matches=records.filter(r=>r.id==='square-'+fingerprint(candidate.key).slice(0,48)||r.chargeback?.processor==='Square'&&Boolean(candidate.informationRequestId&&r.chargeback.details?.disputeId===candidate.informationRequestId||candidate.paymentId&&r.chargeback.details?.transactionReference===candidate.paymentId));
  if(matches.length>1)throw new ConflictError('This export matches more than one existing recovery case. Review the payment and processor request IDs before importing.');
  const found=matches[0],details=found?.chargeback?.details;
  if(found&&(found.chargeback?.processor!=='Square'||candidate.informationRequestId&&details?.disputeId&&candidate.informationRequestId!==details.disputeId||candidate.paymentId&&details?.transactionReference&&candidate.paymentId!==details.transactionReference))throw new ConflictError('An existing case has conflicting Square payment or request IDs. Review that case before importing.');
  return found;
 };
 const preview=parsed.candidates.map(c=>({key:c.key,row:c.rowNumber,title:c.record.title,amountCents:c.record.amountCents,sourceStatus:c.sourceStatus,deadlineDay:c.record.chargeback.deadlineDay,cardBrand:c.record.chargeback.details?.cardBrand,cardLast4:c.record.chargeback.details?.cardLast4,warnings:c.warnings,existingId:match(c,existing)?.id||''}));
 if(body.action==='preview')return {digest,cases:preview,warnings:parsed.warnings,duplicatesSkipped:parsed.duplicatesSkipped};
 if(body.digest!==digest)throw new ConflictError('The export changed. Preview it again before importing.');
 const selected=body.keys;
 if(!Array.isArray(selected)||!selected.length||selected.length>200||selected.some(k=>typeof k!=='string'||!parsed.candidates.some(c=>c.key===k))||new Set(selected).size!==selected.length)throw new AppError('Select the reviewed processor cases to import.');
 const created:{id:string;title:string}[]=[],skipped:{id:string;title:string}[]=[];
 for(const c of parsed.candidates.filter(c=>selected.includes(c.key))){
  const old=match(c,existing);if(old){skipped.push({id:old.id,title:old.title});continue;}
  const at=new Date().toISOString();
  const next=prepareRegister(v,'recovery',{...c.record,version:0,ownerId:v.person,resolutionReference:'',note:c.record.note+'\nExport SHA-256: '+digest},undefined,ownerChoices(v,'recovery',staff),true,at,[]);
  next.id='square-'+fingerprint(c.key).slice(0,48);
  try{await insertReviewedRegisterEdition(next);existing.push(next);created.push({id:next.id,title:next.title});}
  catch(e){if(!(e instanceof ConflictError))throw e;const found=match(c,(await getRegister(v,'recovery',staff)).rows);if(!found)throw e;existing.push(found);skipped.push({id:found.id,title:found.title});}
 }
 return {created,skipped,digest,warnings:parsed.warnings};
}
