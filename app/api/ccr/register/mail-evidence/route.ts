import {NextRequest,NextResponse} from 'next/server';
import {requestRoster,identify} from '@/lib/finance/server';
import {requireSourceAccess} from '@/lib/source-files/authorization';
import {AppError,ConflictError,ForbiddenError,readPayload,safeFailure} from '@/lib/shared/errors';
import {getRegister,reviewableTdlr,attachStagedRegisterFile,downloadRegisterFile} from '@/lib/ccr/register-server';
import {handleDocumentStage} from '@/lib/ccr/document-stage-server';
import {readDocumentForm,validatedDocumentFile} from '@/lib/ccr/document-input';
import type {StagedDocument} from '@/lib/ccr/document-stage-server';
import {evidenceItem,tdlrEvidenceFlag,tdlrDirectMax} from '@/lib/ccr/tdlr-evidence';
import type {RegisterFile} from '@/lib/ccr/register-model';
import {createHash} from 'node:crypto';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'}});
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new ForbiddenError();
 const staff=await requestRoster(),v=identify(staff,req.headers);await requireSourceAccess(v,'tdlr',true,staff);
 async function target(raw:unknown,id?:string){
  const f=evidenceItem(raw);let rid=id;
  if(!rid){const {rows}=await getRegister(v,'tdlr',staff);const matches=rows.filter(r=>[r.reference,r.tdlr?.pairedReference].includes(f.reference));if(matches.length!==1)throw new AppError(matches.length?'Ambiguous agency reference.':'File the complaint and its support correspondence first.',409);rid=matches[0].id;}
  const row=await reviewableTdlr(v,staff,rid);
  if(![row.reference,row.tdlr?.pairedReference].includes(f.reference))throw new ConflictError('The agency reference does not match the destination.');
  const event=row.regulatoryMail?.find(m=>m.messageId===f.messageId);if(!event)throw new ConflictError('The source message has not been filed on this complaint.');
  if(f.medium==='Gmail Attachment'&&!event.attachments.some(a=>a.name===f.originalName&&a.bytes===Number(f.sourceBytes)&&(!a.sha256||a.sha256===f.sourceSha256)))throw new ConflictError('The original is not listed on the saved source message.');
  if(f.medium==='Linked Google Drive File'&&!/drive|linked (?:pdf|file|packet)|shared link/i.test(event.summary+' '+event.body))throw new ConflictError('The saved message does not identify a linked source.');
  const matches=row.files.filter(d=>d.sha256===f.sha256||d.sourceReceipt?.messageId===f.messageId&&d.sourceReceipt?.sourceSha256===f.sourceSha256);
  const existing=matches[0];
  if(matches.length>1||existing&&(!existing.sourceReceipt||existing.sourceReceipt.kind!==f.kind||existing.sourceReceipt.medium!==f.medium||existing.sourceReceipt.originalName!==f.originalName||existing.sourceReceipt.sourceBytes!==Number(f.sourceBytes)||(existing.sourceReceipt.driveId||'')!==f.driveId||existing.sourceReceipt.sourceSha256!==f.sourceSha256||existing.sourceReceipt.messageId!==f.messageId||existing.sha256!==f.sha256||existing.bytes!==Number(f.size)||existing.documentType!==f.documentType))throw new ConflictError('A different filing or classification exists. Review it before attaching.');
  return {row,f,existing};
 }
 async function attach(doc:StagedDocument,entry:unknown,id?:string){
  const {row,f,existing}=await target(entry,id);
  if(doc.type!=='application/pdf'||doc.name!==f.name||doc.bytes.length!==Number(f.size)||createHash('sha256').update(doc.bytes).digest('hex')!==f.sha256)throw new AppError('The filed bytes do not match the approved PDF.');
  if(existing)return {id:row.id,file:existing.id};
  const source:NonNullable<RegisterFile['sourceReceipt']>={messageId:f.messageId,sourceSha256:f.sourceSha256,sourceBytes:Number(f.sourceBytes),kind:f.kind,medium:f.medium,originalName:f.originalName,...(f.driveId?{driveId:f.driveId}:{})};
  const saved=await attachStagedRegisterFile(v,'tdlr',row.id,row.version,doc,staff,f.documentType,undefined,source);return {id:saved.id};
 }
 if(req.nextUrl.searchParams.has(tdlrEvidenceFlag)){
  return json(await handleDocumentStage(req,v,'ccr-regulatory-evidence',{maxBytes:24*1048576,authorize:async s=>{await target(s,s.id);},attach:(doc,s)=>attach(doc,s,s.id)}));
 }
 if(req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')){
  const form=await readDocumentForm(req,tdlrDirectMax),entry=form.get('entry'),file=form.get('file');
  if([...form.keys()].length!==2||!(file instanceof File)||typeof entry!=='string'||entry.length>4096)throw new AppError('Choose a reviewed PDF with its source manifest.');
  let raw;try{raw=JSON.parse(entry);}catch{throw new AppError('Invalid evidence manifest.');}
  const f=evidenceItem(raw);if(Number(f.size)>tdlrDirectMax)throw new AppError('Larger PDFs require the staged upload.',413);
  const doc=await validatedDocumentFile(file,tdlrDirectMax);return json(await attach(doc,f));
 }
 const b=await readPayload(req);if(!['receipt','verify'].includes(String(b.action)))throw new AppError('Select a receipt action.');
 const {row,existing}=await target(b.entry);if(existing&&b.action==='verify'){await downloadRegisterFile(v,'tdlr',row.id,existing.id,staff);}
 return json({id:row.id,sha256:existing?.sha256,verified:!!existing&&b.action==='verify'});
 }catch(e){const f=safeFailure(e,'ccr.tdlr.mail.evidence');return json(f.body,f.status);}}
