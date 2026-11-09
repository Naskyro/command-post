import {handleDocumentStage} from '@/lib/ccr/document-stage-server';
import {assetClaimLimit,assignmentFileLimit,stagedFields,validAssetBytes,type DamageOriginal} from '@/lib/ccr/damage-stage-input';
import {classifyDocument} from '@/lib/ccr/document-types';
import {validatedDocumentFile} from '@/lib/ccr/document-input';
import {assignmentAccess,claimAccess} from '@/lib/hr/assignments';
import {NextRequest,NextResponse} from 'next/server';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {documentCategories,type HrRecord} from '@/lib/hr/model';
import {can,canReadRecord,documentPermission,listRecord,selfService} from '@/lib/hr/workflow';
import {readHrRecord,readHrRecords,writeHrRecord,recordId,encryptBytes,decryptBytes,financeFiles,auditHrAccess} from '@/lib/hr/server';
import {AppError,ConflictError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const mimeTypes=new Set(['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document','video/mp4']);
export async function GET(request:NextRequest){try{const finance=await allRecords(),v=financeIdentity(request.headers,finance,{allowOnboarding:true}),records=await readHrRecords(),id=recordId(request.nextUrl.searchParams.get('id')),record=records.find(r=>r.id===id&&r.kind==='document');if(!record)throw new AppError('File not found.',404);if(!canReadRecord(record,v,finance,records))throw new ForbiddenError();const object=await financeFiles().get(String(record.data.storageKey));if(!object)throw new AppError('This file is temporarily unavailable.',404);const bytes=await decryptBytes(new Uint8Array(await object.arrayBuffer()));await auditHrAccess(record,v,'Downloaded File');return new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':String(record.data.mimeType||'application/octet-stream'),'Content-Disposition':'attachment; filename="'+String(record.data.fileName||'document').replace(/[^a-zA-Z0-9._ -]/g,'_')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){const f=safeFailure(e,'hr.file.read');return json(f.body,f.status);}}
export async function POST(request:NextRequest){try{
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
 if(request.headers.get('origin')&&request.headers.get('origin')!==request.nextUrl.origin)throw new ForbiddenError('Cross-origin upload rejected.');
 if(Number(request.headers.get('content-length')||0)>21*1024*1024)throw new AppError('Choose a file smaller than 20 MB.',413);
 const finance=await allRecords(),v=financeIdentity(request.headers,finance,{allowOnboarding:true}),staged=request.nextUrl.searchParams.get('damageStage')==='1';let records:HrRecord[]=staged?[]:await readHrRecords();
 async function save(form:FormData,stagedId='',original?:DamageOriginal){const personId=recordId(form.get('personId')),category=String(form.get('category')||''),parentId=String(form.get('parentId')||''),incoming=form.get('file'),file=original||(incoming instanceof File?incoming:null),size=file instanceof File?file.size:file?.bytes.length;
 const configured=finance.find(r=>r.id==='hr-assignment-catalog')?.documents;const categories:string[]=Array.isArray(configured)?configured.map(String):[...documentCategories];const workflowCategory=parentId&&documentCategories.includes(category as typeof documentCategories[number]);
 if(!finance.some(r=>r.kind==='person'&&r.id===personId)||!categories.includes(category)&&!workflowCategory)throw new AppError('Choose an employee and file category.');
 const selfAllowed=v.person===personId&&selfService(v,'document',category)&&['Form I-9','Form W-4','Form W-9','Bank Authorization','Offer Letter','Job Description','Policy Acknowledgment','Resume'].includes(category);
 const managerAllowed=!v.onboardingOnly&&(can(v,documentPermission(category),personId,finance)||['Offer Letter','Job Description','Resume','Policy Acknowledgment','Training Record','Driver Insurance Confirmation'].includes(category)&&can(v,'manageOnboarding',personId,finance));
 if(category==='Driver Insurance Confirmation'&&v.person===personId&&!v.owner)throw new ForbiddenError('A supervisor must retain the driver insurance confirmation.');
 const assetParent=records.find(r=>r.id===parentId&&r.personId===personId&&['assignment','assetClaim'].includes(r.kind));
 const assetAllowed=category==='Asset Evidence'&&!!assetParent&&(assignmentAccess(v,personId,finance,true)||claimAccess(v,true)||v.person===personId&&assetParent.kind==='assignment'&&assetParent.data.type==='Asset');
 if(category==='Asset Evidence'&&!assetAllowed)throw new ForbiddenError('Choose an authorized asset or claim for this evidence.');
 if(!selfAllowed&&!managerAllowed&&!assetAllowed)throw new ForbiddenError('This document responsibility is not assigned to you.');
 if(!file||!size||!mimeTypes.has(file.type)||size>20*1024*1024)throw new AppError('Choose a PDF, JPG, PNG, DOCX, or MP4 file up to 20 MB.');
 if(parentId){const parent=records.find(r=>r.id===parentId&&r.personId===personId);if(!parent||(!canReadRecord(parent,v,finance,records)&&!assetAllowed))throw new ForbiddenError('The related record is unavailable.');}
 if(['Corrective Action','Signed Corrective Action','Evidence'].includes(category)&&!records.some(r=>r.id===parentId&&r.kind==='corrective'&&r.personId===personId))throw new AppError('Attach this file to the related corrective action.');
 const claimDoc=category==='Asset Evidence'&&assetParent?.kind==='assetClaim',metadata=claimDoc?classifyDocument('damage',form.get('documentType'),form.get('otherDocumentType')):{};
 const verified=original||(claimDoc&&file instanceof File?await validatedDocumentFile(file):null);
 const bytes=verified?.bytes||new Uint8Array(await (file as File).arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''),id='hrdoc:'+(stagedId||crypto.randomUUID()),storageKey='hr/'+id+(stagedId?'/'+crypto.randomUUID():''),at=new Date().toISOString();
 if(stagedId){const old=await readHrRecord(id);if(old){if(!old.data.deletedAt&&old.kind==='document'&&old.personId===personId&&old.data.parentId===parentId&&old.data.category===category&&old.data.sha256===sha256&&old.data.uploadedById===v.id&&old.data.fileName===file.name.slice(0,200)&&old.data.documentType===('documentType'in metadata?metadata.documentType:undefined)&&old.data.otherDocumentType===('otherDocumentType'in metadata?metadata.otherDocumentType:undefined))return {record:listRecord(old)};throw new ConflictError();}}
 const encrypted=await encryptBytes(bytes);
 const record:HrRecord={id,kind:'document',personId,version:1,createdAt:at,createdBy:v.name,updatedAt:at,updatedBy:v.name,data:{category,...metadata,parentId,parentVersion:records.find(r=>r.id===parentId)?.version||null,fileName:file.name.slice(0,200),mimeType:verified?.type||file.type,size,sha256,storageKey,signatureStatus:'Not Verified',uploadedBy:v.name,uploadedById:v.id,uploadedAt:at}};
 await financeFiles().put(storageKey,encrypted,{httpMetadata:{contentType:'application/octet-stream'}});
 try{await writeHrRecord(undefined,record,v,'Uploaded '+category);}catch(e){if(!stagedId||e instanceof ConflictError)await financeFiles().delete(storageKey);throw e;}return {record:listRecord(record)};
 }
 if(staged){
  const result=await handleDocumentStage(request,v,'personnel-asset-evidence',{
   maxBytes:fields=>records.find(r=>r.id===fields.parentId&&r.personId===fields.personId)?.kind==='assetClaim'?assetClaimLimit:assignmentFileLimit,
   validate:validAssetBytes,
   async authorize(fields){const {category,personId,parentId,documentType,otherDocumentType}=fields;
    const candidate=await readHrRecord(recordId(parentId)),parent=candidate&&!candidate.data.deletedAt&&candidate.personId===personId&&['assetClaim','assignment'].includes(candidate.kind)?candidate:undefined;records=parent?[parent]:[];
    if(category!=='Asset Evidence'||!parent||!finance.some(r=>r.kind==='person'&&r.id===personId)||!(assignmentAccess(v,personId,finance,true)||claimAccess(v,true)||v.person===personId&&parent.kind==='assignment'&&parent.data.type==='Asset'))throw new ForbiddenError('Choose an authorized asset or claim.');
    if(parent.kind==='assetClaim')classifyDocument('damage',documentType,otherDocumentType);
   },attach:(doc,fields,uploadId)=>save(stagedFields(fields,uploadId),uploadId,doc)});
  return json(result);
 }
 return json(await save(await request.formData()),201);
}catch(e){const f=safeFailure(e,'hr.file.write');return json(f.body,f.status);}}
