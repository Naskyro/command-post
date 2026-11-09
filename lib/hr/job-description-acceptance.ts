import type { HrRecord } from './model';
import type { FinRecord } from '../finance/model';
import { AppError } from '../shared/errors.ts';

export const JOB_ACCEPTANCE='I have read and accept the responsibilities in this job description and agree to sign this version electronically.';
export const acceptedJobDocument=(document:HrRecord)=>['Signed','Wet Signature Verified'].includes(String(document.data.signatureStatus));
export const jobDocumentTitle=(document:HrRecord)=>String(document.data.title||document.data.fileName||'Job Description');
export function personnelJobDocuments(personId:string,records:HrRecord[]){
 const own=records.filter(r=>r.personId===personId&&!r.data.deletedAt),all=own.filter(r=>r.kind==='document'&&r.data.category==='Job Description');
 const evidence=new Set(all.map(r=>r.id));
 const editions=all.filter(r=>!evidence.has(String(r.data.parentId||''))).sort((a,b)=>String(b.data.jobDescriptionAssignedAt||b.createdAt).localeCompare(String(a.data.jobDescriptionAssignedAt||a.createdAt))||b.id.localeCompare(a.id));
 const onboarding=own.find(r=>r.kind==='onboarding');
 const task=Array.isArray(onboarding?.data.tasks)?(onboarding.data.tasks as Record<string,unknown>[]).find(t=>t.key==='jobDescription'):undefined;
 const pointer=task?.documentId||onboarding?.data.jobDescriptionDocumentId;
 const current=editions.find(r=>r.data.jobDescriptionId&&r.data.jobDescriptionAssignedAt&&!r.data.assignmentSupersededBy)||editions.find(r=>r.id===pointer&&!r.data.assignmentSupersededBy);
 return {current,history:editions.filter(r=>r.id!==current?.id),evidence:all.filter(r=>evidence.has(String(r.data.parentId||'')))};
}
export function validateJobAcceptance(doc:HrRecord,records:HrRecord[],input:Record<string,unknown>,person:FinRecord|undefined){
 if(!person||person.id!==doc.personId||personnelJobDocuments(person.id,records).current?.id!==doc.id)throw new AppError('Only the currently assigned job description can be signed. Refresh to review the current version.');
 if(acceptedJobDocument(doc))throw new AppError('This job description has already been accepted.');
 if(!doc.data.sha256||input.documentHash!==doc.data.sha256||input.consent!==true)throw new AppError('Review and accept this exact document before signing.');
 const name=String(input.signatureName||'').trim(),norm=(v:unknown)=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
 if(!name||name.length>180||![person.legalName,person.name,person.fullName,person.preferredName].some(v=>v&&norm(v)===norm(name)))throw new AppError('Enter your full name as it appears in your personnel file.');
 return {signatureName:name,acceptanceText:JOB_ACCEPTANCE};
}
export function jobWetProof(doc:HrRecord,records:HrRecord[],proofId:unknown){
 if(!doc.personId||personnelJobDocuments(doc.personId,records).current?.id!==doc.id)throw new AppError('This job description is no longer the assigned version.');
 const proof=records.find(r=>r.id===proofId&&r.kind==='document'&&r.personId===doc.personId&&r.data.parentId===doc.id&&r.data.category==='Job Description'&&!r.data.deletedAt&&r.data.sha256&&['application/pdf','image/jpeg','image/png'].includes(String(r.data.mimeType)));
 if(!proof||proof.data.sha256===doc.data.sha256)throw new AppError('Upload the signed paper copy for this exact assignment and review it before verifying.');
 return {signedCopyId:proof.id,signedCopyHash:proof.data.sha256,signedDocumentHash:doc.data.sha256};
}
