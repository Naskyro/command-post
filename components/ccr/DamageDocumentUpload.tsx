'use client';
import {sendDamageFile} from '@/lib/ccr/damage-upload-client';
import CcrDocumentUpload from './CcrDocumentUpload';
import {stageDocument} from '@/lib/ccr/document-stage-client';
export type DamageUploadTarget={intakeId:string}|{claimId:string;accountId:string;personId?:never}|{parentId:string;personId:string;accountId?:never};
export default function DamageDocumentUpload({target,onUploaded,initiallyOpen=false,onClose}:{target:DamageUploadTarget;onUploaded:()=>void|Promise<void>;initiallyOpen?:boolean;onClose?:()=>void}){
 return <CcrDocumentUpload section="damage" initiallyOpen={initiallyOpen} onClose={onClose} onUpload={async(file,metadata)=>{
  if('intakeId' in target){await stageDocument('/api/ccr/damage-intake/documents/stage',file,{claimId:target.intakeId,documentType:metadata.documentType,...(metadata.otherDocumentType?{otherDocumentType:metadata.otherDocumentType}:{})});await onUploaded();return;}
  const form=new FormData();form.set('file',file);form.set('documentType',metadata.documentType);if(metadata.otherDocumentType)form.set('otherDocumentType',metadata.otherDocumentType);
  const property='claimId' in target;
  if(property){form.set('category','Claim evidence');form.set('accountId',target.accountId);form.set('claimId',target.claimId);}
  else {form.set('category','Asset Evidence');form.set('personId',target.personId);form.set('parentId',target.parentId);}
  const resp=await sendDamageFile(property?'/api/accounts/files':'/api/hr/files',form);
  if(!resp.ok){const result=await resp.json().catch(()=>({})) as {error?:string};throw new Error(result.error||'The document could not be saved.');}
  await onUploaded();
 }}/>;
}
