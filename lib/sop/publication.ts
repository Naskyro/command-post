import {financeDb} from '@/db/finance';
import {AppError,ConflictError} from '@/lib/shared/errors';
import {isCorrectivePolicy,hasCorrectiveEmployeeGuide} from './corrective-content';
import {withImportedCorrectiveSections} from './corrective-import';
import {importedPolicies} from './imported';
import {bulkPublicationAttestation} from './signature-terms';
import type {Audience,Policy,Topic} from './model';
import type {Viewer} from '@/lib/finance/model';

export type EditionLayout={topicLabel:string;related:{reference:string;title:string}[];revisedBy?:string;publishedAt?:string};
export type StoredEdition=Policy&{archivedFrom?:'Published'|'Draft';pdfEdition?:EditionLayout};
export const noAudience='Choose who can read this policy before publishing.';
export const hasAudience=(a:Audience)=>a.all||!!(a.departments.length+a.people.length+a.levels.length);
export function blocker(p:Policy,t:Topic|undefined){
 if(p.status!=='Draft')return 'Only a saved draft can be published.';
 if(!t||t.archived)return 'Restore the topic first.';
 if(!p.content.title.trim()||!p.content.sections.some(s=>s.text.trim()))return 'Add policy content before publishing.';
 if(isCorrectivePolicy(p)&&!hasCorrectiveEmployeeGuide(p.content))return 'Add a reviewed Conduct Standard and Typical Consequences to the Employee Guide before publishing.';
 const original=importedPolicies.find(x=>x.id===p.id);
 if(p.sourceStatus?.includes('Needs Guidance')&&original&&JSON.stringify(p.content.sections)===JSON.stringify(withImportedCorrectiveSections({...p,content:original.content}).content.sections))
   return 'Resolve the guidance in the policy text before publishing.';
 if(!hasAudience(p.audience))return noAudience;
 return undefined;
}
export function catalogRefs(editions:Policy[]){
 const refs=new Map<string,Policy>();
 for(const e of editions){const old=refs.get(e.id);if(!old||(e.status==='Published'&&old.status!=='Published')||(e.status===old.status&&e.version>old.version))refs.set(e.id,e);}
 return refs;
}
export async function issuePolicy(p:StoredEdition,t:Topic,refs:Map<string,Policy>,v:Viewer,signerName:string,publishedAt:string,batchId:string):Promise<StoredEdition>{
 const body={...p.content,approvalStatus:'Published'};
 const pdfEdition:EditionLayout={topicLabel:t.name,related:body.relatedIds.flatMap(id=>refs.has(id)?[{reference:refs.get(id)!.code,title:refs.get(id)!.content.title}]:[]),revisedBy:signerName,publishedAt};
 const core={policyId:p.id,code:p.code,version:p.version,revision:body.revision,signerName,publishedAt,batchId,personId:v.person,accountId:v.id,attestation:bulkPublicationAttestation};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({core,content:body,audience:p.audience,requireOnboardingSignature:p.requireOnboardingSignature!==false,originalReference:p.originalReference||null,pdfEdition})));
 const contentHash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 // An uploaded source is never modified. The new issued PDF uses the same template
 // with its authoritative approval status, revision signature and publication date.
 const next:StoredEdition={...p,status:'Published',content:body,pdfEdition,originalPdf:false,publication:{...core,contentHash},updatedAt:publishedAt,updatedBy:signerName};
 delete next.assignedToViewer;delete next.publishBlocker;delete next.acknowledged;delete next.signature;delete next.openedAt;
 return next;
}
export function publicPublication(p:Policy['publication']){
 if(!p)return undefined;
 const {accountId:_account,personId:_person,...display}=p;return display;
}
type Plan={id:string;expected:number;maxVersion:number;topic:Topic;writes:StoredEdition[]};
// Guard every selected draft/version and topic in the *same* D1 transaction as
// the full issue and archival writes. Never return a partially published batch.
export async function commitPublication(plans:Plan[],batchId:string){
 const db=financeDb(),checks=JSON.stringify(plans.map(p=>({id:p.id,etag:p.expected,max:p.maxVersion,topicId:p.topic.id,topicEtag:p.topic.etag||0})));
 const guard=db.prepare(`INSERT INTO sop_guard(id,success) SELECT ?,CASE WHEN EXISTS(
 SELECT 1 FROM json_each(?) x LEFT JOIN sop_entries e ON e.id=json_extract(x.value,'$.id')
 LEFT JOIN sop_topics t ON t.id=json_extract(x.value,'$.topicId')
 WHERE COALESCE(e.etag,0)<>json_extract(x.value,'$.etag') OR COALESCE(t.etag,0)<>json_extract(x.value,'$.topicEtag') OR COALESCE(t.archived,0)<>0) THEN 0 ELSE 1 END`).bind(batchId,checks);
 const heads=db.prepare(`INSERT INTO sop_entries(id,etag,history) SELECT json_extract(value,'$.id'),json_extract(value,'$.etag')+1,CAST(json_extract(value,'$.max') AS TEXT) FROM json_each(?) WHERE 1 ON CONFLICT(id) DO UPDATE SET etag=excluded.etag,history=excluded.history`).bind(checks);
 const ops=[guard,heads];let page:string[]=[],bytes=2;
 const flush=()=>{if(!page.length)return;ops.push(db.prepare(`INSERT INTO sop_versions(key,policy_id,status,payload) SELECT json_extract(value,'$.key'),json_extract(value,'$.id'),json_extract(value,'$.status'),json_extract(value,'$.payload') FROM json_each(?) WHERE 1 ON CONFLICT(key) DO UPDATE SET status=excluded.status,payload=excluded.payload`).bind('['+page.join(',')+']'));page=[];bytes=2;};
 for(const plan of plans)for(const edition of plan.writes){
   const item=JSON.stringify({key:edition.id+'|'+edition.version,id:edition.id,status:edition.status,payload:JSON.stringify({...edition,etag:plan.expected+1})});
   const size=new TextEncoder().encode(item).byteLength+1;
   if(size>1800000)throw new AppError(edition.code+': edition is too large to publish.',413);
   if(bytes+size>900000)flush();page.push(item);bytes+=size;
 }
 flush();ops.push(db.prepare('DELETE FROM sop_guard WHERE id=?').bind(batchId));
 try{await db.batch(ops);}catch(e){if(/sop_write_succeeded|constraint failed.*success/i.test(String(e)))throw new ConflictError('A selected draft or topic changed. Nothing was published. Refresh the list and review your selection.');throw e;}
}
