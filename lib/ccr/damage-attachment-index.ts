import {classifyDocument} from './document-types.ts';
import {AppError,ConflictError} from '../shared/errors.ts';
import type {DamageIntake} from './damage-intake-model.ts';
export type IndexedOriginal={name:string;sha256:string;bytes:number;documentType:string;otherDocumentType?:string;sourceMessageId:string};
export type IndexGroup={threadId:string;documents:IndexedOriginal[]};
const bad=()=>new AppError('Choose a reviewed source attachment index with original filenames, message identifiers, types, sizes and full fingerprints.');
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{5,160}$/.test(v);
export function parseIndex(input:unknown):IndexGroup[]{
 if(!input||typeof input!=='object')throw bad();const val=input as {format?:unknown;claims?:unknown};
 if(val.format!=='command-damage-attachment-inventory-v1'||!Array.isArray(val.claims)||!val.claims.length||val.claims.length>100)throw bad();
 const claimIds=new Set<string>(),seen=new Set<string>(),src=new Map<string,string>();let total=0;
 return val.claims.map(c=>{if(!c||!ident(c.threadId)||claimIds.has(c.threadId)||!Array.isArray(c.documents)||!c.documents.length||c.documents.length>200||(total+=c.documents.length)>750)throw bad();claimIds.add(c.threadId);
 const documents=c.documents.map((d:IndexedOriginal)=>{if(!d||typeof d.name!=='string'||d.name.length>240||/[\\/\u0000-\u001f]/.test(d.name)||!/^.+[.](?:pdf|docx|png|jpe?g)$/i.test(d.name)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>24*1048576||!ident(d.sourceMessageId)||!(/^[a-f0-9]{64}$/.test(d.sha256)))throw bad();
 const k=c.threadId+':'+d.sha256;if(seen.has(k)||src.has(d.sourceMessageId)&&src.get(d.sourceMessageId)!==c.threadId)throw bad();seen.add(k);src.set(d.sourceMessageId,c.threadId);
 return {name:d.name,sha256:d.sha256,bytes:d.bytes,...classifyDocument('damage',d.documentType,d.otherDocumentType),sourceMessageId:d.sourceMessageId};});return {threadId:c.threadId,documents};});
}
export function sourceForIndex(r:DamageIntake,g:IndexGroup,d:IndexedOriginal){const source=r.references.find(x=>x.messageId===d.sourceMessageId);if(r.threadId!==g.threadId||!source)throw new ConflictError('A source message does not match its stored claim. Review the source reference.');return source;}
export function indexedFile(r:DamageIntake,d:IndexedOriginal){const f=r.files.find(x=>x.sha256===d.sha256);if(!f)return {state:'Original Pending' as const};if(f.name!==d.name||f.bytes!==d.bytes||f.sourceMessageId!==d.sourceMessageId||f.documentType!==d.documentType||(f.otherDocumentType||'')!==(d.otherDocumentType||''))return {state:'Needs Review' as const};return {state:'Filed' as const,fileId:f.id};}
