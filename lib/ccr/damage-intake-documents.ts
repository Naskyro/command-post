import {createHash} from 'node:crypto';
import {financeFiles} from '@/db/finance';
import {encryptBytes,decryptBytes} from '@/lib/hr/server';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
import type {DamageIntakeFile,DamageIntake} from './damage-intake-model';
import {assertDamageIntakeAccess,getDamageIntake,saveDamageEdition} from './damage-intake-server';
import {classifyDocument} from './document-types';
import {validateDamageSourceBytes} from './damage-source-image';
import type {StagedDocument} from './document-stage-server';

export const intakeFileLimit=24*1024*1024;
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const key=(id:string,fid:string)=>'ccr-damage-intake-originals/'+id+'/'+fid;
const identifier=(s:unknown)=>{if(typeof s!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/.test(s))throw new AppError('Choose a saved damage claim and document.');return s;};
async function granted(v:Viewer,edit:boolean){if(!v?.owner||!v.person||!v.id||v.id.startsWith('preview:'))throw new ForbiddenError();await assertDamageIntakeAccess(v,edit);}
async function destination(id:string){const r=await getDamageIntake(id);if(!r)throw new AppError('Damage claim not found.',404);return r;}
function metaFor(f:Record<string,string>,r:DamageIntake){
 if(Object.keys(f).some(k=>!['claimId','documentType','otherDocumentType','sourceMessageId'].includes(k)))throw new AppError('Choose a valid evidence destination.');
 const source=f.sourceMessageId||'';
 if(source&&(source.length>250||/[\u0000-\u0020\u007f]/.test(source)||!(r.references||[]).some(ref=>ref.messageId===source)))throw new AppError('Link an original source message already recorded on this damage claim.');
 return {...classifyDocument('damage',f.documentType,f.otherDocumentType),...(source?{sourceMessageId:source}:{})};
}
export async function authorizeDamageIntakeOriginal(v:Viewer,fields:Record<string,string>){
 await granted(v,true);const r=await destination(identifier(fields.claimId));metaFor(fields,r);return r;
}
export async function attachDamageIntakeOriginal(v:Viewer,fields:Record<string,string>,original:StagedDocument){
 let current=await authorizeDamageIntakeOriginal(v,fields);
 const {name,type,bytes}=validateDamageSourceBytes(original.bytes,original.name,intakeFileLimit,!!fields.sourceMessageId),sha256=digest(bytes),id=current.id,fileId=crypto.randomUUID(),objectKey=key(id,fileId);
 const bucket=financeFiles();let stored=false,uncertain=false;
 try{
  for(let attempt=0;attempt<3;attempt++){
   const meta=metaFor(fields,current),known=(current.files||[]).find(f=>f.sha256===sha256);
   if(known){
    if(known.documentType!==meta.documentType||(known.otherDocumentType||'')!==(meta.otherDocumentType||'')||(meta.sourceMessageId&&known.sourceMessageId!==meta.sourceMessageId))throw new ConflictError('This original already has a different document type or source reference. Review the recorded evidence.');
    if(stored)await bucket.delete(objectKey).catch(()=>{});
    return {status:'already-attached' as const,id,fileId:known.id,sha256};
   }
   if((current.files||[]).length>=200)throw new AppError('This claim already has 200 evidence documents.');
   const at=new Date().toISOString(),file:DamageIntakeFile={id:fileId,name,type,bytes:bytes.length,sha256,...meta,at,by:v.name,byId:v.id};
   if(!stored){await bucket.put(objectKey,await encryptBytes(bytes),{httpMetadata:{contentType:'application/octet-stream'}});stored=true;}
   const next:DamageIntake={...current,files:[...(current.files||[]),file],version:current.version+1,updatedAt:at,updatedBy:v.name,actorId:v.id};
   try{await saveDamageEdition(next);return {status:'added' as const,id,fileId,sha256};}
   catch(e){
    if(e instanceof ConflictError){if(attempt===2)throw e;current=await destination(id);continue;}
    // The write may have succeeded even if its acknowledgement was lost. Keep the protected original.
    if(!(e instanceof AppError&&e.status===413))uncertain=true;throw e;
   }
  }
  throw new ConflictError('This claim changed. Refresh before attaching the original.');
 }catch(e){if(stored&&!uncertain)await bucket.delete(objectKey).catch(()=>{});throw e;}
}
export async function readDamageIntakeOriginal(v:Viewer,claim:unknown,document:unknown){
 await granted(v,false);const r=await destination(identifier(claim)),fid=identifier(document),file=(r.files||[]).find(f=>f.id===fid);
 if(!file)throw new AppError('This original is not attached to the selected claim.',404);
 const o=await financeFiles().get(key(r.id,file.id));if(!o)throw new AppError('The stored original is unavailable.',503);
 const bytes=await decryptBytes(new Uint8Array(await o.arrayBuffer()));if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw new AppError('The stored original could not be verified.',503);
 return {file,bytes};
}
