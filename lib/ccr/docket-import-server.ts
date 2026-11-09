import {courtStage,stageMime,finalizeCourtStage,finishCourtStage,type Stage} from './court-stage-server';
import {financeFiles} from '@/db/finance';
import {encryptBytes} from '@/lib/hr/server';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
import {prepareMatter,docketAccess,type Matter,type CourtDocument,type CourtOutcome} from './docket-model';
import {insertEdition,docket,propertyOptions,matterById} from './docket-server';
import {validatedDocumentFile} from './document-input';
import {importBytesLimit,importFileLimit,canonCause,jurisdiction,matchPrior,plain,shaHex,sourceManifest,terminalEvidence, type ImportDoc} from './docket-import';
type Upload=ImportDoc&{file?:File;stage?:Stage;bytes:number;mime:string};
const bad=(message:string):never=>{throw new AppError(message);};
const act=(v:Viewer)=>{if(!v.person||!v.id||v.id.startsWith('preview:')||!docketAccess(v,true))throw new ForbiddenError();};
const normOutcome=(o:CourtOutcome)=>JSON.stringify([o.on,o.result,o.stage||'',o.settlementCents??null,plain(o.prevailingParty||''),plain(o.otherParty||'')]);
const evidenceKey=(id:string,file:string)=>'ccr-court-documents/'+id+'/'+file;

type Manifest=ReturnType<typeof sourceManifest>;
const importMatterId=async(b:Manifest)=>'jpi_'+await shaHex(new TextEncoder().encode(b.jur+'|'+b.cause));
function sourcedMatter(v:Viewer,b:Manifest,now:Date){
 if(b.status==='Closed'&&!terminalEvidence(b.docs,b.newOutcome))return bad('A closed outcome requires its source judgment, signed settlement, findings, or disposition order. Notices, petitions, offers and receipts are not outcomes.');
 return prepareMatter({version:0,number:b.number,title:b.title,type:b.type,status:b.status,courtName:b.courtName,relatedCauses:b.relatedCauses,causeCategory:b.causeCategory,statement:b.statement,newOutcome:b.newOutcome,filedOn:b.filedOn,appearances:b.appearances},undefined,v,now);
}
type Receipt={status:'confirmed'|'incomplete';id?:string;matchedDocuments:number;expectedDocuments:number}|{status:'review'};
// Confirmation is about the latest committed version, never the staging area, temporary
// R2 writes or an HTTP response. Return no party, court, filenames, or document hashes.
export async function courtImportReceipt(v:Viewer,raw:unknown):Promise<Receipt>{
 act(v);const b=sourceManifest(raw),proposed=sourcedMatter(v,b,new Date()),id=await importMatterId(b);
 const classification=(x:{documentType:string;otherDocumentType?:string})=>JSON.stringify([x.documentType,x.otherDocumentType||'']);
 const expected=new Map<string,string>();
 for(const d of b.docs){const key=classification(d);if(expected.has(d.sha256)&&expected.get(d.sha256)!==key)return {status:'review'};expected.set(d.sha256,key);}
 const expectedDocuments=expected.size;
 let prior:Matter|undefined;
 try{prior=await matterById(id);}catch(e){
  if(!(e instanceof AppError&&e.status===404))throw e;
  // A manual case has a different opaque ID. Never guess among ambiguous manually entered records.
  try{prior=matchPrior(await docket(v),id,b.cause,b.jur);}catch(c){if(c instanceof ConflictError)return {status:'review'};throw c;}
 }
 if(!prior)return {status:'incomplete',matchedDocuments:0,expectedDocuments};
 if(canonCause(prior.number)!==b.cause||jurisdiction(prior.courtName||'')!==b.jur||prior.type!==b.type)return {status:'review'};
 const current=prior.statements.filter(s=>s.outcome).at(-1)?.outcome,requested=proposed.statements.at(-1)?.outcome;
 if(prior.status!==b.status&&!(prior.status==='Outcome Unverified'&&b.status==='Closed'))return {status:'review'};
 if(current&&(!requested||normOutcome(current)!==normOutcome(requested))||prior.status==='Closed'&&!current)return {status:'review'};
 if(prior.causeCategory&&b.causeCategory&&plain(prior.causeCategory)!==plain(b.causeCategory))return {status:'review'};
 let missing=prior.status!==b.status||!!requested&&!current||!!b.causeCategory&&!prior.causeCategory||b.relatedCauses.some(c=>!prior.relatedCauses?.some(p=>canonCause(c)===canonCause(p)));
 let matchedDocuments=0;
 for(const [digest,key] of expected){
  const found=(prior.files||[]).filter(x=>x.sha256===digest);
  if(found.some(x=>classification(x)!==key))return {status:'review'};
  if(found.length)matchedDocuments++;else missing=true;
 }
 return {status:missing?'incomplete':'confirmed',id:prior.id,expectedDocuments,matchedDocuments};
}

export async function importCourtCase(v:Viewer,raw:unknown,parts:FormDataEntryValue[]){
 act(v);const b=sourceManifest(raw),id=await importMatterId(b),now=new Date();
 if(parts.length!==b.docs.filter(d=>!d.stagedId).length||parts.some(f=>!(f instanceof File)))return bad('All listed originals must be attached in manifest order.');
 const files=parts as File[];if(files.some(f=>f.size<=0||f.size>importFileLimit)||files.reduce((n,f)=>n+f.size,0)>importBytesLimit)throw new AppError('Use nonempty originals up to 16 MB each, 40 MB per case upload.',413);
 const prior=matchPrior(await docket(v),id,b.cause,b.jur);
 const currentFiles=prior?.files||[],index=new Map(currentFiles.map(f=>[f.sha256,f])),incoming=new Map<string,Upload>();
 const stages:Stage[]=[];let indexFile=0,totalBytes=0;
 for(const m of b.docs){
  let src:Upload;
  if(m.stagedId){const st=await courtStage(v,m.stagedId);if(st.name!==m.name||st.sha256!==m.sha256)throw new AppError('The staged original does not match the manifest file and digest.');stages.push(st);src={...m,stage:st,mime:stageMime(st),bytes:st.bytes};}
  else{const f=files[indexFile++],parsed=await validatedDocumentFile(f,importFileLimit);if(parsed.name!==m.name||await shaHex(parsed.bytes)!==m.sha256)return bad('An original file name or digest does not match the manifest.');src={...m,file:f,mime:parsed.type,bytes:f.size};}
  totalBytes+=src.bytes;if(totalBytes>150*1024*1024)throw new AppError('Split this case into batches of up to 150 MB of originals.',413);
  const older=index.get(m.sha256)||incoming.get(m.sha256);if(older&&(older.documentType!==m.documentType||older.otherDocumentType!==m.otherDocumentType))throw new ConflictError('The same document already has a different classification. Review its source before importing.');
  if(!older)incoming.set(m.sha256,src);
 }
 if(currentFiles.length+incoming.size>200)throw new AppError('This matter would exceed 200 documents.');
 const prevOutcome=prior?.statements.filter(s=>s.outcome).at(-1)?.outcome;
 const proposed=sourcedMatter(v,b,now),proposedOutcome=proposed.statements.at(-1)?.outcome;
 if(prior?.type!==undefined&&prior.type!==b.type)throw new ConflictError('The case number matches a different record type. Review the docket manually.');
 if(prior&&proposedOutcome&&prevOutcome&&normOutcome(prevOutcome)!==normOutcome(proposedOutcome))throw new ConflictError('The source and recorded dispositions differ. Open the record for review; nothing was overwritten.');
 if(prior&&b.status==='Closed'&&prior.status!=='Outcome Unverified'&&!(prior.status==='Closed'&&prevOutcome))throw new ConflictError('The documented outcome changes a reviewed record. Review its status in the docket.');
 if(prior?.causeCategory&&b.causeCategory&&plain(prior.causeCategory)!==plain(b.causeCategory))throw new ConflictError('The existing case classification differs from the import. Review the cause category manually.');
 const oldLinks=prior?.relatedCauses||[],newLinks=proposed.relatedCauses?.filter(n=>!oldLinks.some(x=>canonCause(x)===canonCause(n)))||[];
 const enrich=!!prior&&!prior.causeCategory&&!!b.causeCategory;
 const improve=prior?.status==='Outcome Unverified'&&b.status==='Closed';
 if(prior&&!incoming.size&&!improve&&!enrich&&!newLinks.length){await Promise.all(stages.map(finishCourtStage));return {status:'unchanged' as const,id:prior.id,addedFiles:0};}
 const at=now.toISOString(),matterId=prior?.id||id;
 let next:Matter;
 if(prior){
  next={...prior,...(newLinks.length?{relatedCauses:[...oldLinks,...newLinks]}:{}),...(enrich?{causeCategory:b.causeCategory}:{}),version:prior.version+1,updatedAt:at,updatedBy:v.name,actorId:v.id,files:[...currentFiles],statements:[...prior.statements],status:improve?'Closed':prior.status};
  if((improve||incoming.size)&&!next.statements.some(s=>s.text===b.statement&&(!improve||s.outcome&&proposedOutcome&&normOutcome(s.outcome)===normOutcome(proposedOutcome))))next.statements.push({text:b.statement,by:v.name,byId:v.id,at,...(improve&&proposedOutcome?{outcome:proposedOutcome}:{})});
 }else{
  next={...proposed,id:matterId,files:[]};
  if(b.propertyName){const props=(await propertyOptions(v)).filter(p=>plain(p.name)===plain(b.propertyName));if(props.length===1)next.accountId=props[0].id;}
 }
 const provenance='Imported court source: '+b.partyAsPrinted+' (party as printed). Basis: '+b.partyBasis+(b.propertyName?'\nProperty as recorded: '+b.propertyName:'');
 if(!next.statements.some(s=>s.text===provenance))next.statements.push({text:provenance,by:v.name,byId:v.id,at});
 // Use attempt-private object IDs; cleanup of a losing attempt can never remove a concurrent winner’s evidence.
 const bucket=financeFiles(),keys:string[]=[],clean=()=>Promise.all(keys.map(k=>bucket.delete(k).catch(()=>{})));
 try{for(const m of incoming.values()){
  const fid=crypto.randomUUID(),key=evidenceKey(matterId,fid);let chunks:{size:number;count:number}|undefined;
  if(m.stage)chunks=await finalizeCourtStage(m.stage,key,keys);else{const cipher=await encryptBytes(new Uint8Array(await m.file!.arrayBuffer()));keys.push(key);await bucket.put(key,cipher,{httpMetadata:{contentType:'application/octet-stream'}});}
  const doc:CourtDocument={id:fid,name:m.name,documentType:m.documentType,...(m.otherDocumentType?{otherDocumentType:m.otherDocumentType}:{}),bytes:m.bytes,...(chunks?{chunks}:{}),sha256:m.sha256,type:m.mime,at,by:v.name,byId:v.id};next.files!.push(doc);
 }}catch(e){await clean();throw e;}
 try{await insertEdition(next);}catch(e){
  // A conflict or payload size rejection cannot have committed. An ambiguous DB outage may have committed: retain its protected files.
  if(e instanceof ConflictError||e instanceof AppError&&e.status===413)await clean();throw e;
 }
 await Promise.all(stages.map(finishCourtStage));
 return {status:prior?'updated' as const:'created' as const,id:next.id,addedFiles:incoming.size};
}
