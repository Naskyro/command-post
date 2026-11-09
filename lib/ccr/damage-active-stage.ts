import {AppError,ForbiddenError} from '@/lib/shared/errors';
import type {Viewer} from '@/lib/finance/model';
import {assertDamageIntakeAccess} from './damage-intake-server';
import {authorizeDamageIntakeOriginal} from './damage-intake-documents';
import {scopedStageCandidates} from './document-stage-server';
function txt(x:unknown,max:number,empty=false){if(typeof x!=='string'||x.length>max||!empty&&!x.length||/[\x00-\x1f\x7f]/.test(x))throw new AppError('Invalid selected upload fingerprint or name.');return x;}
export async function findDamageActive(v:Viewer,raw:unknown){assertDamageIntakeAccess(v,true);if(!v.owner)throw new ForbiddenError();
 if(!Array.isArray(raw)||!raw.length||raw.length>100)throw new AppError('Choose between one and 100 selected originals.');
 const choices=raw.map(x=>{if(!x||typeof x!=='object'||!Number.isSafeInteger(x.bytes)||x.bytes<1||x.bytes>24*1048576||typeof x.sha256!=='string'||!/^[0-9a-f]{64}$/.test(x.sha256))throw new AppError('A selected original has an invalid fingerprint or size.');return {threadId:txt(x.threadId,160),name:txt(x.name,160),bytes:x.bytes,sha256:x.sha256,sourceMessageId:txt(x.sourceMessageId,160),documentType:txt(x.documentType,200),otherDocumentType:txt(x.otherDocumentType||'',200,true)};});
 const active=await scopedStageCandidates(v,'ccr-damage-intake'),matches=new Set<number>();
 for(const s of active){const f=s.fields,possible=choices.flatMap((x,i)=>s.declaredMime===''&&x.bytes===s.bytes&&x.sha256===s.sha256&&x.name===s.name&&x.sourceMessageId===f.sourceMessageId&&x.documentType===f.documentType&&x.otherDocumentType===(f.otherDocumentType||'')?[i]:[]);if(!possible.length)continue;
 try{const r=await authorizeDamageIntakeOriginal(v,f);for(const i of possible)if(r.threadId===choices[i].threadId&&r.references.some(m=>m.messageId===choices[i].sourceMessageId))matches.add(i);}
 catch(e){if(e instanceof AppError&&[400,403,404].includes(e.status))continue;throw e;}
 }return {matches:[...matches].sort((a,b)=>a-b)};
}
