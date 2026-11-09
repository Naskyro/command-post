import {AppError} from '../shared/errors.ts';
import type {RegEvidenceSource} from './register-model';
import {classifyDocument} from './document-types.ts';
export const tdlrEvidenceFlag='fileStage',tdlrEvidenceStageQuery='?'+tdlrEvidenceFlag+'=1';
export const tdlrDirectMax=400*1024;
export const tdlrEvidenceFormat='pte.tdlr-evidence.v1';
export type TdlrEvidenceItem={reference:string;messageId:string;sourceSha256:string;sourceBytes:string;kind:RegEvidenceSource['kind'];medium:RegEvidenceSource['medium'];originalName:string;driveId:string;name:string;sha256:string;size:string;documentType:string};
export function evidenceItem(x:unknown):TdlrEvidenceItem{
 if(!x||typeof x!=='object'||Array.isArray(x))throw new AppError('Use a reviewed TDLR evidence manifest.');
 const o=x as Record<string,unknown>;const field=(k:string,rx:RegExp,len=300)=>{const v=o[k];if(typeof v!=='string'||v.length>len||!rx.test(v))throw new AppError('Invalid evidence field: '+k+'.');return v;};
 const f=(k:string)=>field(k,/^[^/\\\u0000-\u001f\u007f]+$/u,160),sha=(k:string)=>field(k,/^[a-f0-9]{64}$/),num=(k:string)=>field(k,/^[1-9]\d{0,10}$/);
 const reference=field('reference',/^(TOW|VSF)\d{11}$/),messageId=field('messageId',/^[0-9a-f]{10,40}$/),sourceSha256=sha('sourceSha256'),sha256=sha('sha256'),name=f('name'),originalName=f('originalName'),sourceBytes=num('sourceBytes'),size=num('size'),kind=field('kind',/^(Original|Reviewed Copy)$/) as RegEvidenceSource['kind'],medium=field('medium',/^(Gmail Attachment|Linked Google Drive File)$/) as RegEvidenceSource['medium'],driveId=medium==='Linked Google Drive File'?field('driveId',/^[\w-]{10,165}$/):'',documentType=classifyDocument('tdlr',o.documentType).documentType;
 if(documentType==='Other'||!/[.]pdf$/i.test(name)||Number(size)>24*1048576||kind==='Original'&&(sourceSha256!==sha256||size!==sourceBytes)||kind==='Reviewed Copy'&&sourceSha256===sha256)throw new AppError('The reviewed source and filing fingerprints do not match the file designation.');
 return {reference,messageId,sourceSha256,sourceBytes,kind,medium,originalName,driveId,name,sha256,size,documentType};
}
