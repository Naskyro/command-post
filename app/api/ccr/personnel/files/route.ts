import {NextRequest,NextResponse} from 'next/server';
import {allRecords,identify} from '@/lib/finance/server';
import {canOpenPersonnelReview,reviewDocuments} from '@/lib/ccr/personnel-review';
import {canAccessReviewRecord,reviewDocSection,ccrReviewCategory} from '@/lib/hr/review-document-access';
import {readHrRecords,readHrRecord,recordId,writeHrRecord,encryptBytes,decryptBytes,financeFiles,auditHrAccess} from '@/lib/hr/server';
import {canReadRecord} from '@/lib/hr/workflow';
import {canAccess} from '@/lib/finance/access';
import {readDocumentForm,ccrMaxFileBytes,validatedDocumentFile} from '@/lib/ccr/document-input';
import {handleDocumentStage,type StagedDocument} from '@/lib/ccr/document-stage-server';
import type {Viewer,FinRecord} from '@/lib/finance/model';
import {classifyDocument} from '@/lib/ccr/document-types';
import type {HrRecord} from '@/lib/hr/model';
import {AppError,ForbiddenError,safeFailure} from '@/lib/shared/errors';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization','X-Content-Type-Options':'nosniff'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers});
export async function GET(req:NextRequest){try{
 const staff=await allRecords(),v=identify(staff,req.headers);if(!canOpenPersonnelReview(v))throw new ForbiddenError();
 const hr=await readHrRecords(),q=req.nextUrl.searchParams,parent=hr.find(r=>r.id===recordId(q.get('review')));if(!parent||!canAccessReviewRecord(v,parent,staff))throw new AppError('Review unavailable.',404);
 if(!q.has('file')){await auditHrAccess(parent,v,'Viewed CCR Review Document Index');return json({files:reviewDocuments(parent,v,staff,hr),canUpload:canAccessReviewRecord(v,parent,staff,true)});}
 const id=recordId(q.get('file')),file=hr.find(d=>d.id===id&&d.kind==='document'&&d.personId===parent.personId&&d.data.parentId===parent.id&&!d.data.deletedAt&&canReadRecord(d,v,staff,hr));
 if(!file)throw new AppError('Document unavailable.',404);const key=String(file.data.storageKey||'');if(!key.startsWith('hr/'))throw new AppError('Document unavailable.',404);
 const obj=await financeFiles().get(key);if(!obj)throw new AppError('Document unavailable.',404);
 const bytes=await decryptBytes(new Uint8Array(await obj.arrayBuffer()));
 await auditHrAccess(file,v,'Downloaded CCR Personnel Review Document');
 const filename=encodeURIComponent(String(file.data.fileName||'Document')).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
 return new Response(bytes.buffer as ArrayBuffer,{headers:{...headers,'Content-Security-Policy':"sandbox; default-src 'none'",'Content-Type':String(file.data.mimeType||'application/octet-stream'),'Content-Length':String(bytes.length),'Content-Disposition':"attachment; filename*=UTF-8''"+filename}});
}catch(e){const f=safeFailure(e,'ccr.personnel.files.read');return json(f.body,f.status);}}
async function saveReviewDocument(parent:HrRecord,v:Viewer,staff:FinRecord[],input:StagedDocument,category:unknown,other:unknown,stageId?:string){
 if(!canAccessReviewRecord(v,parent,staff,true))throw new AppError('Review unavailable.',404);
 const typed=classifyDocument(reviewDocSection(parent)!,category,other),{bytes,type,name}=input;
 const id='hrdoc:'+(stageId||crypto.randomUUID()),at=new Date().toISOString();
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const existing=async()=>{const d=await readHrRecord(id);if(!d)return;const valid=d.data.parentId===parent.id&&d.data.uploadedById===v.id&&d.data.sha256===sha256&&d.data.documentType===typed.documentType&&d.data.otherDocumentType===typed.otherDocumentType;const f=valid&&reviewDocuments(parent,v,staff,[parent,d])[0];if(!f)throw new AppError('This record could not be attached.',409);return {file:f};};
 if(stageId){const old=await existing();if(old)return old;}
 // Independent storage keys ensure two simultaneous final requests never remove the winning original.
 const storageKey='hr/'+id+(stageId?'/'+crypto.randomUUID():'');
 const doc:HrRecord={id,kind:'document',personId:parent.personId,version:1,createdAt:at,createdBy:v.name,updatedAt:at,updatedBy:v.name,data:{...typed,category:ccrReviewCategory,ccrReviewSection:reviewDocSection(parent),parentId:parent.id,parentVersion:parent.version,fileName:name,mimeType:type,size:bytes.byteLength,sha256,storageKey,uploadedAt:at,uploadedBy:v.name,uploadedById:v.id}};
 await financeFiles().put(storageKey,await encryptBytes(bytes),{httpMetadata:{contentType:'application/octet-stream'}});
 try{await writeHrRecord(undefined,doc,v,'Uploaded CCR Personnel Review Document');}catch(e){await financeFiles().delete(storageKey);if(stageId){const old=await existing();if(old)return old;}throw e;}
 return {file:reviewDocuments(parent,v,staff,[parent,doc])[0]};
}
export async function POST(req:NextRequest){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==req.nextUrl.origin)throw new ForbiddenError();
 const staff=await allRecords(),v=identify(staff,req.headers);if(!canOpenPersonnelReview(v)||!canAccess(v,'Compliance, Claims & Recovery','people',true)||!canAccess(v,'People & HR'))throw new ForbiddenError();
 const reviewId=recordId(req.nextUrl.searchParams.get('review')),parent=await readHrRecord(reviewId);
 if(!parent||!canAccessReviewRecord(v,parent,staff,true))throw new AppError('Review unavailable.',404);
 if(req.nextUrl.searchParams.has('personnelStage')){
  return json(await handleDocumentStage(req,v,'personnel-review:'+parent.id,{maxBytes:ccrMaxFileBytes,authorize(fields){if(fields.reviewId!==parent.id)throw new ForbiddenError();classifyDocument(reviewDocSection(parent)!,fields.documentType,fields.otherDocumentType);},async attach(document,fields,stageId){
   const current=await readHrRecord(parent.id);if(!current||current.personId!==parent.personId||reviewDocSection(current)!==reviewDocSection(parent))throw new AppError('Review unavailable.',404);
   return saveReviewDocument(current,v,staff,document,fields.documentType,fields.otherDocumentType,stageId);
  }}));
 }
 const form=await readDocumentForm(req),f=form.get('file');if(!(f instanceof File))throw new AppError('Choose the original document.');
 return json(await saveReviewDocument(parent,v,staff,await validatedDocumentFile(f),form.get('documentType'),form.get('otherDocumentType')||undefined),201);
}catch(e){const f=safeFailure(e,'ccr.personnel.files.save');return json(f.body,f.status);}}
