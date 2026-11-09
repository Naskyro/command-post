// Server-only. HR records keep bibliographic citations, never SOP bodies or management instructions.
import {financeDb} from '@/db/finance';
import {canAccess,grantsFor} from '@/lib/finance/access';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {departmentFor} from '@/lib/people/departments';
import {authorityLevelOf} from '@/lib/people/policy';
import {verifiedOwnerRecord} from '@/lib/finance/identity';
import {canManageCorrectiveContent,correctiveView} from '@/lib/sop/corrective-access';
import type {Policy} from '@/lib/sop/model';
import {isCorrectivePolicy} from '@/lib/sop/corrective-content';
import topicDefaults from '@/lib/sop/private/topics.json';
import {AppError,ConflictError,ForbiddenError} from '@/lib/shared/errors';
import {hrCan} from './permissions';

export type PerformanceSopCitation={id:string;version:number;code:string;title:string;revision:string;topicId:string;topic:string};
type Key={id:string;version:number};
type Edition=PerformanceSopCitation & {status:string;audience:string};
type Index={editions:Map<string,Edition>;current:Map<string,Edition>};
type Access={reader:boolean;editor:boolean;baseline:boolean;management:boolean;personId:string;departmentId:string;level:string};
const key=(v:Key)=>v.id+'|'+v.version;
const maxRefs=50;
const looksLikeKey=(v:unknown):v is Key=>!!v&&typeof v==='object'&&'id' in v&&typeof v.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,159}$/.test(v.id)&&'version' in v&&Number.isSafeInteger(v.version)&&Number(v.version)>0;
function authorAccess(v:Viewer,p:FinRecord,records:FinRecord[],targetOnly=false):Access{
 const active=p.status==='Active'&&p.accountStatus!=='Disabled'&&!v.onboardingOnly;
 const level=authorityLevelOf(p),d=departmentFor(records,p.departmentId||p.department);
 const editor=active&&canAccess(v,'SOP Library','workflow',true);
 return {reader:active&&(canAccess(v,'SOP Library','library')||canAccess(v,'SOP Library','assigned')||editor),
    editor:editor&&!targetOnly,baseline:active&&(v.companyPolicyReader===true||['Employee','Owner'].includes(String(p.workerType))),
    management:active&&canManageCorrectiveContent(p),
    personId:p.id,level,departmentId:d&&d.status!=='Retired'?d.id:''};
}
function canSee(p:Edition,scope:Access){
 if(isCorrectivePolicy(p))return scope.baseline||scope.reader;
 if(scope.editor)return true;
 if(!scope.reader)return false;
 const a=JSON.parse(p.audience) as {all?:boolean;people?:string[];departments?:string[];levels?:string[]};
 return a.all===true||a.people?.includes(scope.personId)===true||!!scope.departmentId&&a.departments?.includes(scope.departmentId)===true||!!scope.level&&a.levels?.includes(scope.level)===true;
}
function requireWriter(v:Viewer,records:FinRecord[],personId:string,kind:string){
 const p=records.find(r=>r.kind==='person'&&r.id===v.person);
 if(!p||p.status!=='Active'||p.accountStatus==='Disabled'||!['note','corrective'].includes(kind)||!records.some(r=>r.kind==='person'&&r.id===personId)||!hrCan(v,kind==='note'?'recordPerformance':'issueCorrective',personId,records))throw new ForbiddenError('Performance access for this employee is required.');
 return authorAccess(v,p,records);
}
const slim=(p:PerformanceSopCitation):PerformanceSopCitation=>({id:p.id,version:p.version,code:p.code,title:p.title,revision:p.revision,topicId:p.topicId,topic:p.topic});
async function loadIndex(historical:boolean):Promise<Index>{
 const db=financeDb();
 const sql=`SELECT policy_id AS id,status,CAST(json_extract(payload,'$.version') AS INTEGER) AS version,
 json_extract(payload,'$.code') AS code,json_extract(payload,'$.content.title') AS title,
 COALESCE(json_extract(payload,'$.content.revision'),'') AS revision,json_extract(payload,'$.topicId') AS topicId,
 COALESCE(json_extract(payload,'$.audience'),'{}') AS audience
 FROM sop_versions WHERE `+(historical?"status IN ('Published','Archived')":"status='Published'");
 const [versions,topics]=await Promise.all([db.prepare(sql).all<Omit<Edition,'topic'>>(),db.prepare('SELECT id,name FROM sop_topics').all<{id:string;name:string}>()]);
 const names=new Map([...topicDefaults,...topics.results].map(t=>[t.id,t.name])),editions=new Map<string,Edition>(),current=new Map<string,Edition>();
 for(const row of versions.results){const p={...row,topic:names.get(row.topicId)||row.topicId};editions.set(key(p),p);if(p.status==='Published'&&(current.get(p.id)?.version??0)<p.version)current.set(p.id,p);}
 return {current,editions};
}
// HR list/detail handlers pass a fresh staff array from allRecords() per request. Share one metadata-only read for all its records.
const displayIndices=new WeakMap<FinRecord[],Promise<Index>>();
function displayIndex(records:FinRecord[]){let i=displayIndices.get(records);if(!i){i=loadIndex(true);displayIndices.set(records,i);}return i;}
export async function performanceSopOptions(viewer:Viewer,records:FinRecord[],personId:string,kind:string,query:string,offset:number){
 const scope=requireWriter(viewer,records,personId,kind);
 if(query.length>240||!Number.isSafeInteger(offset)||offset<0)throw new AppError('Enter a valid search or page.');
 const index=await loadIndex(false),terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 const visible=[...index.current.values()].filter(p=>canSee(p,scope)).sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})||a.title.localeCompare(b.title));
 if(!terms.length)return {options:visible.slice(offset,offset+40).map(slim),nextOffset:offset+40<visible.length?offset+40:null};
 // Search only published, already audience-filtered candidates. Bound each database read; paginate after matching, never before.
 const person=records.find(p=>p.kind==='person'&&p.id===viewer.person)!,matched:(PerformanceSopCitation&{matchExcerpt?:string})[]=[];
 const chunkSize=45;
 for(let i=0;i<visible.length&&matched.length<=offset+40;i+=chunkSize){
  const group=visible.slice(i,i+chunkSize),docs=await financeDb().prepare("SELECT key,payload FROM sop_versions WHERE status='Published' AND key IN(SELECT value FROM json_each(?))").bind(JSON.stringify(group.map(key))).all<{key:string;payload:string}>();
  const content=new Map(docs.results.map(r=>[r.key,JSON.parse(r.payload) as Policy]));
  for(const p of group){
   const raw=content.get(key(p));if(!raw)continue;
   // An audience edited during a search must still pass before any body/snippet leaves this handler.
   if(!canSee({...p,audience:JSON.stringify(raw.audience)},scope))continue;
   const projection=correctiveView(raw,person,!scope.management).content;
   const metadata=[p.code,p.title,p.topicId,p.topic,p.revision,projection.keywords||''].join(' ').toLocaleLowerCase();
   const sections=(projection.sections||[]).map(s=>[s.heading,s.text].filter(Boolean).join(' · ').replace(/\s+/g,' ').trim()).filter(Boolean);
   const entire=metadata+' '+sections.join(' ').toLocaleLowerCase();
   if(!terms.every(t=>entire.includes(t)))continue;
   const needed=terms.filter(t=>!metadata.includes(t)),section=sections.find(s=>needed.some(t=>s.toLocaleLowerCase().includes(t)));
   let matchExcerpt:string|undefined;
   if(section){const hits=needed.map(t=>section.toLocaleLowerCase().indexOf(t)).filter(n=>n>=0),start=Math.max(0,Math.min(...hits)-46),end=Math.min(section.length,start+156);matchExcerpt=(start?'…':'')+section.slice(start,end).trim()+(end<section.length?'…':'');}
   matched.push({...slim(p),...(matchExcerpt?{matchExcerpt}:{})});
  }
 }
 return {options:matched.slice(offset,offset+40),nextOffset:matched.length>offset+40?offset+40:null};
}

type Stored=PerformanceSopCitation;
function stored(raw:unknown):Stored[]{return Array.isArray(raw)?raw.filter(x=>looksLikeKey(x)&&typeof (x as Stored).code==='string'&&typeof (x as Stored).title==='string').map(x=>slim(x as Stored)):[];}
function delivery(p:Key,index:Index,scope:Access):'current'|'historical'|null{
 const original=index.editions.get(key(p)),current=index.current.get(p.id);
 if(!original||!canSee(original,scope)||current&&!canSee(current,scope))return null;
 if(!current&&(!scope.editor||isCorrectivePolicy(original)&&!scope.management))return null;
 return current?.version===p.version?'current':'historical';
}
async function describe(citations:unknown,scope:Access,records:FinRecord[]){
 const prior=stored(citations);if(!prior.length)return [];
 const index=await displayIndex(records);return prior.flatMap(c=>{const publicationState=delivery(c,index,scope);return publicationState?[{...c,publicationState}]:[];});
}
export async function describePerformanceSopCitations(citations:unknown,viewer:Viewer,records:FinRecord[]){
 const p=records.find(r=>r.kind==='person'&&r.id===viewer.person);return !p?[]:describe(citations,authorAccess(viewer,p,records),records);
}
export async function describeRecipientPerformanceSopCitations(citations:unknown,person:FinRecord,records:FinRecord[]){
 if(person.kind!=='person'||person.status!=='Active'||person.accountStatus==='Disabled')return [];
 // Plain FLSA/HR classification or managerial seniority is not a grant. Use the recipient's real configured rights.
 const owner=verifiedOwnerRecord(person);
 const rights:Viewer={person:person.id,id:'',name:'',email:'',department:String(person.department||''),role:String(person.role||''),owner,canManage:false,canRelease:false,access:grantsFor(person),onboardingOnly:person.onboardingRequired===true&&!person.onboardingClearedAt};
 return describe(citations,authorAccess(rights,person,records,true),records);
}
export async function resolvePerformanceSopCitations(args:{viewer:Viewer;records:FinRecord[];personId:string;kind:string;input:unknown;previous?:unknown}):Promise<{citations:PerformanceSopCitation[];guards:D1PreparedStatement[]}>{
 const old=stored(args.previous);
 if(args.input===undefined)return {citations:old,guards:[]};
 if(!Array.isArray(args.input)||args.input.length>maxRefs||!args.input.every(looksLikeKey))throw new AppError('Select up to '+maxRefs+' valid SOP editions.');
 const keys=args.input as Key[];if(new Set(keys.map(x=>x.id)).size!==keys.length)throw new AppError('Select each policy only once.');
 if(!keys.length&&!old.length)return {citations:[],guards:[]};
 const scope=requireWriter(args.viewer,args.records,args.personId,args.kind),index=await loadIndex(true),prior=new Map(old.map(c=>[key(c),c]));
 const check:Edition[]=[],citations:PerformanceSopCitation[]=[];
 for(const selected of keys){
  const pinned=prior.get(key(selected));if(pinned){citations.push(pinned);continue;}
  const current=index.current.get(selected.id);
  if(!current||!canSee(current,scope))throw new ForbiddenError('This SOP is not available to cite.');
  if(current.version!==selected.version)throw new ConflictError('A selected SOP has been revised. Choose its current published version.');
  citations.push(slim(current));check.push(current);
 }
 // A hidden historical citation cannot be silently erased by an editor who only received a restricted placeholder.
 old.forEach((c,i)=>{if(!keys.some(k=>k.id===c.id)&&!delivery(c,index,scope))citations.splice(Math.min(i,citations.length),0,c);});
 if(citations.length>maxRefs)throw new AppError('This record has reached its citation limit.');
 if(!check.length)return {citations,guards:[]};
 // Guard and cleanup run inside the HR record/audit transaction. A concurrent revision, withdrawal or audience change aborts both.
 const token=crypto.randomUUID(),db=financeDb(),wanted=check.map(p=>({key:key(p),version:p.version,id:p.id,audience:p.audience,code:p.code,title:p.title,revision:p.revision,topicId:p.topicId}));
 const guard=db.prepare(`INSERT INTO hr_write_guard(id,success) SELECT ?,CASE WHEN EXISTS(
 SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM sop_versions v WHERE v.key=json_extract(s.value,'$.key') AND v.status='Published'
 AND json_extract(v.payload,'$.audience')=json_extract(s.value,'$.audience') AND json_extract(v.payload,'$.content.title')=json_extract(s.value,'$.title')
 AND json_extract(v.payload,'$.code')=json_extract(s.value,'$.code') AND COALESCE(json_extract(v.payload,'$.content.revision'),'')=json_extract(s.value,'$.revision')
 AND json_extract(v.payload,'$.topicId')=json_extract(s.value,'$.topicId')
 AND NOT EXISTS(SELECT 1 FROM sop_versions newer WHERE newer.policy_id=v.policy_id AND newer.status='Published' AND CAST(json_extract(newer.payload,'$.version') AS INTEGER)>json_extract(s.value,'$.version')))) THEN 0 ELSE 1 END`).bind(token,JSON.stringify(wanted));
 return {citations,guards:[guard,db.prepare('DELETE FROM hr_write_guard WHERE id=?').bind(token)]};
}
