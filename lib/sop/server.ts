import {canManageCorrectiveContent,correctiveView,allEmployees} from './corrective-access';
import {isCorrectivePolicy,isCorrectiveTopic,employeeCorrectiveHeadings} from './corrective-content';
import {withImportedCorrectiveSections} from './corrective-import';
import {blocker,hasAudience,catalogRefs,issuePolicy,commitPublication,publicPublication,type StoredEdition} from './publication';
import {dismissSample,dismissedSampleIds} from '@/lib/preferences/sample-dismissals';
import {canReadGeneralSop} from './acknowledgment-access';
import {sampleRequest} from './request-example';
import {financeDb} from '@/db/finance';
import {allRecords} from '@/lib/finance/server';
import {financeIdentity} from '@/lib/finance/identity';
import {canAccess} from '@/lib/finance/access';
import {authorityLevelOf,authorityLevels} from '@/lib/people/policy';
import {displayPersonName} from '@/lib/people/display-name';
import {activeDepartments,departmentFor} from '@/lib/people/departments';
import {AppError,ForbiddenError,ConflictError} from '@/lib/shared/errors';
import {sopSignatureHistoryFor,signCurrent,addSignatureData,signerNames,sopAttestation,recordPolicyOpened,openedPolicyVersions,bulkSignCurrent,inPersonalAudience} from './onboarding';
import {importedPolicies,importedTopics} from './imported';
import type {SopContent,Policy,Audience,SopRequest,SopData,Topic} from './model';
import type {FinRecord,Viewer} from '@/lib/finance/model';

const moduleName='SOP Library';
type Ctx={hrcaOnly:boolean;v:Viewer;person:FinRecord;records:FinRecord[];canRead:boolean;canEdit:boolean;canInbox:boolean;canManageInbox:boolean};
const assignablePerson=(p:FinRecord)=>p.kind==='person'&&['Active','Onboarding'].includes(String(p.status))&&p.accountStatus!=='Disabled';
const now=()=>new Date().toISOString();
const none=():Audience=>({all:false,departments:[],levels:[],people:[]});
export async function context(r:Request):Promise<Ctx>{const records=await allRecords(),v=financeIdentity(r.headers,records),person=records.find(p=>p.kind==='person'&&p.id===v.person);if(!person||person.status!=='Active'||v.onboardingOnly||!canAccess(v,moduleName)&&!v.companyPolicyReader)throw new ForbiddenError();
 return {records,v,person,hrcaOnly:v.companyPolicyReader===true&&!canReadGeneralSop(v),canRead:canAccess(v,moduleName,'library')||canAccess(v,moduleName,'assigned'),canEdit:canAccess(v,moduleName,'workflow',true),canInbox:canAccess(v,moduleName,'inbox'),canManageInbox:canAccess(v,moduleName,'inbox',true)};}
type StoredPolicy=StoredEdition;
function initial(id:string):StoredPolicy|undefined{const p=importedPolicies.find(x=>x.id===id);if(!p)return;const audience=none();audience.all=p.topicId==='ALL';// Only All Personnel is preselected. An editor confirms all other releases and audiences.
 return withImportedCorrectiveSections({id:p.id,code:p.id,topicId:p.topicId,version:1,etag:0,status:'Draft',audience:isCorrectivePolicy(p)?allEmployees():audience,content:p.content,sourceStatus:p.sourceStatus,originalPdf:true,originalReference:id,updatedAt:'2026-10-31T00:00:00Z',updatedBy:'SOP Import'} as StoredPolicy);}
function canEditEntry(p:Policy,ctx:Ctx){return ctx.canEdit&&(!isCorrectivePolicy(p)||canManageCorrectiveContent(ctx.person));}
export function entitled(p:Policy,ctx:Ctx){if(isCorrectivePolicy(p))return canEditEntry(p,ctx)||p.status==='Published'&&(ctx.canRead||ctx.canEdit||ctx.hrcaOnly);if(ctx.canEdit)return true;if(!ctx.canRead||p.status!=='Published')return false;const d=departmentFor(ctx.records,ctx.person.departmentId||ctx.person.department);
 return p.audience.all||p.audience.people.includes(ctx.v.person)||!!d&&d.status!=='Retired'&&p.audience.departments.includes(d.id)||p.audience.levels.includes(authorityLevelOf(ctx.person));}
const versionKey=(id:string,n:number)=>id+'|'+n;
async function one(id:string,version:number):Promise<StoredPolicy|undefined>{const rec=await financeDb().prepare('SELECT payload FROM sop_versions WHERE key=?').bind(versionKey(id,version)).first<{payload:string}>();return rec?JSON.parse(rec.payload):version===1?initial(id):undefined;}
export async function protectedPolicy(ctx:Ctx,id:string,version:number){const p=await one(id,version);if(!p||!entitled(p,ctx))throw new ForbiddenError('This policy is unavailable.');return correctiveView(p,ctx.person);}
function seedTopics():Topic[]{return importedTopics.map(t=>({id:t.id,prefix:t.id,name:t.name,archived:false,etag:0}));}
async function topics(){const map=new Map(seedTopics().map(t=>[t.id,t]));const rows=await financeDb().prepare('SELECT id,prefix,name,archived,etag FROM sop_topics').all<Topic>();for(const row of rows.results)map.set(row.id,{...row,archived:!!row.archived});return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));}
async function policies(ctx:Ctx){const db=financeDb(),map=new Map<string,StoredPolicy>();if(!ctx.canRead&&!ctx.canEdit&&!ctx.hrcaOnly)return [];if(ctx.canEdit)for(const row of importedPolicies){const p=initial(row.id)!;map.set(versionKey(p.id,1),p);}
 const rows=await db.prepare('SELECT payload FROM sop_versions'+(ctx.canEdit?'':" WHERE status='Published'")).all<{payload:string}>();for(const row of rows.results){const p=withImportedCorrectiveSections(JSON.parse(row.payload) as StoredPolicy);if(isCorrectivePolicy(p))p.audience=allEmployees();map.set(versionKey(p.id,p.version),p);}const list=[...map.values()].filter(p=>entitled(p,ctx));for(const p of list)p.assignedToViewer=inPersonalAudience(p,ctx.person,ctx.records);if(ctx.canEdit){const heads=await db.prepare('SELECT id,etag FROM sop_entries').all<{id:string;etag:number}>();const etags=new Map(heads.results.map(h=>[h.id,h.etag]));return list.map(p=>({...p,etag:etags.get(p.id)||0}));}
 const ids=new Set(list.map(p=>p.id));return list.map(({pdfEdition:_,archivedFrom:__,...p})=>({...p,publication:publicPublication(p.publication),audience:none(),content:{...p.content,relatedIds:p.content.relatedIds.filter(id=>ids.has(id))}}));}
export async function library(ctx:Ctx):Promise<SopData>{const db=financeDb();const [ps,ts,incoming,receipts,dismissed,opened]=await Promise.all([policies(ctx),topics(),ctx.canInbox?db.prepare('SELECT payload FROM sop_requests ORDER BY rowid DESC').all<{payload:string}>():Promise.resolve({results:[]}),sopSignatureHistoryFor(ctx.v.person),ctx.canInbox?dismissedSampleIds(ctx.v.person,'sop'):Promise.resolve(new Set<string>()),openedPolicyVersions(ctx.v.person)]);return {signerNames:signerNames(ctx.person),attestation:sopAttestation,canRequest:ctx.canRead||ctx.canEdit,canEdit:ctx.canEdit,canInbox:ctx.canInbox,canManageInbox:ctx.canManageInbox,canManageCorrective:canManageCorrectiveContent(ctx.person),hrcaOnly:ctx.hrcaOnly,topics:ts.filter(t=>ctx.hrcaOnly&&!ctx.canInbox?isCorrectiveTopic(t)&&ps.some(p=>p.topicId===t.id):ctx.canEdit||ctx.canInbox||!t.archived),policies:ps.map(p=>addSignatureData({...correctiveView(p,ctx.person),assignedToViewer:p.assignedToViewer,canEditPolicy:canEditEntry(p,ctx),...(canEditEntry(p,ctx)&&p.status==='Draft'?{publishBlocker:blocker(p,ts.find(t=>t.id===p.topicId))}:{}),openedAt:opened.get(versionKey(p.id,p.version)+(isCorrectivePolicy(p)?'|'+(canManageCorrectiveContent(ctx.person)?'management':'employee'):''))},receipts)),requests:[...incoming.results.map(r=>JSON.parse(r.payload)),...(ctx.canInbox&&!dismissed.has(sampleRequest.id)?[sampleRequest]:[])],departments:ctx.canEdit?activeDepartments(ctx.records).map(d=>({id:d.id,name:String(d.name)})):[],people:ctx.canEdit?ctx.records.filter(assignablePerson).map(p=>({id:p.id,name:displayPersonName(p)})):[],levels:ctx.canEdit?[...authorityLevels]:[]};}
function str(x:unknown,max:number,required=false){if(x===undefined||x===null)x='';if(typeof x!=='string'||x.length>max||required&&!x.trim())throw new AppError('A required value is missing or too long.');return x.trim();}
function list(x:unknown,max:number){if(!Array.isArray(x)||x.length>max)throw new AppError('Invalid list.');return [...new Set(x.map(i=>str(i,160,true)))];}
function object(x:unknown){if(!x||Array.isArray(x)||typeof x!=='object')throw new AppError('Invalid record.');return x as Record<string,unknown>;}
function content(x:unknown):SopContent{const o=object(x);if(!Array.isArray(o.sections)||o.sections.length>100)throw new AppError('Use up to 100 policy sections.');return {title:str(o.title,350,true),shortName:str(o.shortName,90),policyOwner:str(o.policyOwner,240),preparedDate:str(o.preparedDate,100),effectiveDate:str(o.effectiveDate,100),revision:str(o.revision,120),approvalStatus:str(o.approvalStatus,240),keywords:str(o.keywords,6000),sections:o.sections.map(s=>{const row=object(s);const heading=str(row.heading,200,true);
 if(row.visibility!==undefined&&row.visibility!=='employee'&&row.visibility!=='management')throw new AppError('Choose a valid section visibility.');
 if(row.visibility==='employee'&&!(employeeCorrectiveHeadings as readonly string[]).includes(heading))throw new AppError('Choose an approved employee-facing section heading.');
 return {heading,text:str(row.text,120000),...(row.visibility?{visibility:row.visibility}:{})};}),relatedIds:list(o.relatedIds||[],200)};}
function audience(x:unknown,ctx:Ctx):Audience{const o=object(x);if(typeof o.all!=='boolean')throw new AppError('Choose an access scope.');if(o.all)return {...none(),all:true};const departments=list(o.departments||[],500),people=list(o.people||[],1000),levels=list(o.levels||[],20);if(departments.some(id=>!activeDepartments(ctx.records).some(p=>p.id===id))||people.some(id=>!ctx.records.some(p=>p.id===id&&assignablePerson(p)))||levels.some(l=>!authorityLevels.some(x=>x===l)))throw new AppError('Choose active departments, employees, or valid authority levels.');return {all:false,departments,people,levels};}
function audit(ctx:Ctx){return {updatedAt:now(),updatedBy:ctx.v.name};}
function need(b:boolean){if(!b)throw new ForbiddenError();}
async function ensureRefs(ids:string[],self:string){if(ids.includes(self))throw new AppError('A policy cannot reference itself.');const unknown=ids.filter(id=>!importedPolicies.some(p=>p.id===id));if(unknown.length){const rows=await financeDb().prepare('SELECT id FROM sop_entries').all<{id:string}>();if(unknown.some(id=>!rows.results.some(p=>p.id===id)))throw new AppError('Unknown related policy.');}}
async function policyHistory(id:string){const db=financeDb(),head=await db.prepare('SELECT etag,history FROM sop_entries WHERE id=?').bind(id).first<{etag:number;history:string}>();if(!head){const p=initial(id);return {etag:0,versions:p?[p]:[]};}const rows=await db.prepare('SELECT payload FROM sop_versions WHERE policy_id=?').bind(id).all<{payload:string}>();return {etag:head.etag,versions:rows.results.map(r=>withImportedCorrectiveSections(JSON.parse(r.payload) as StoredPolicy))};}
async function commit(id:string,expected:number,changed:StoredPolicy[],maxVersion:number){const db=financeDb(),uid=crypto.randomUUID();const query=expected===0?db.prepare('INSERT INTO sop_entries(id,etag,history) VALUES(?,1,?) ON CONFLICT(id) DO NOTHING').bind(id,String(maxVersion)):db.prepare('UPDATE sop_entries SET etag=etag+1,history=? WHERE id=? AND etag=?').bind(String(maxVersion),id,expected);
 const ops=[query,db.prepare('INSERT INTO sop_guard(id,success) VALUES(?,changes())').bind(uid)];for(const p of changed){ops.push(db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status,payload=excluded.payload').bind(versionKey(id,p.version),id,p.status,JSON.stringify({...p,etag:expected+1})));}ops.push(db.prepare('DELETE FROM sop_guard WHERE id=?').bind(uid));try{await db.batch(ops);}catch(e){if(/sop_write_succeeded|constraint failed.*success/i.test(String(e)))throw new ConflictError();throw e;}}
async function allocate(prefix:string){const max=Math.max(0,...importedPolicies.filter(p=>p.topicId===prefix).map(x=>Number(x.id.split('-').at(-1))||0));const row=await financeDb().prepare('INSERT INTO sop_counters(prefix,last_number) VALUES(?,?) ON CONFLICT(prefix) DO UPDATE SET last_number=MAX(sop_counters.last_number+1,excluded.last_number) RETURNING last_number').bind(prefix,max+1).first<{last_number:number}>();if(!row)throw new AppError('Could not assign a policy number.',503);return prefix+'-'+String(row.last_number).padStart(3,'0');}
export async function change(ctx:Ctx,b:Record<string,unknown>){
 const db=financeDb(),action=str(b.action,40,true),id=str(b.id,160),ts=await topics();
 if(action==='dismissRequestExample'){need(ctx.canInbox);if(id!==sampleRequest.id)throw new AppError('Choose a sample request.');await dismissSample(ctx.v.person,'sop',id);return {ok:true};}
 if(action==='request'){need(ctx.canRead||ctx.canEdit);const topicId=str(b.topicId,160,true);if(!ts.some(t=>t.id===topicId&&!t.archived))throw new AppError('Select an active topic.');const policyId=str(b.policyId,160);if(policyId&&!(await policies(ctx)).some(p=>p.id===policyId))throw new ForbiddenError();
 const createdAt=now();const req:SopRequest={id:crypto.randomUUID(),kind:str(b.kind,100,true),topicId,policyId,question:str(b.question,6000,true),reason:str(b.reason,6000),requestedBy:ctx.v.name,createdAt,status:'New',updatedAt:createdAt,updatedBy:ctx.v.name,note:''};
 await db.prepare('INSERT INTO sop_requests(id,payload) VALUES(?,?)').bind(req.id,JSON.stringify(req)).run();return {id:req.id};}
 if(action==='triage'){need(ctx.canManageInbox);const found=await db.prepare('SELECT payload FROM sop_requests WHERE id=?').bind(id).first<{payload:string}>();if(!found)throw new AppError('Request unavailable.',404);const req=JSON.parse(found.payload) as SopRequest;const status=str(b.status,30,true) as SopRequest['status'];if(!['New','In Review','Completed','Declined'].includes(status))throw new AppError('Choose an available status.');const updated={...req,...audit(ctx),note:str(b.note,8000),status};const w=await db.prepare('UPDATE sop_requests SET payload=? WHERE id=? AND payload=?').bind(JSON.stringify(updated),id,found.payload).run();if(!w.meta.changes)throw new ConflictError();return {id};}
 if(action==='opened'){need(ctx.canRead||ctx.canEdit||ctx.hrcaOnly);return recordPolicyOpened(ctx.person,ctx.records,id,Number(b.version),false,b.accessEdition,ctx.hrcaOnly);}
 if(action==='signAll'){need(ctx.canRead||ctx.canEdit||ctx.hrcaOnly);return bulkSignCurrent(ctx.v,ctx.person,ctx.records,b,false,ctx.hrcaOnly);}
 if(action==='sign'||action==='ack'){const p=await protectedPolicy(ctx,id,Number(b.version));const signature=await signCurrent(ctx.v,ctx.person,p,b);return {id,version:p.version,signature};}
 need(ctx.canEdit);
 if(action==='publishSelected')return publishSelected(ctx,b,ts);
 if(action==='topic'){const prefix=str(b.prefix,24,true).toUpperCase(),name=str(b.name,120,true);if(!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/.test(prefix))throw new AppError('Use a capital letter first, then letters, numbers, or hyphens.');const old=id?ts.find(t=>t.id===id):undefined;if(id&&!old)throw new AppError('Topic unavailable.',404);
 if(ts.some(t=>t.id!==old?.id&&(t.prefix===prefix||t.name.toLowerCase()===name.toLowerCase()))||importedTopics.some(t=>t.id===prefix&&t.id!==old?.id))throw new AppError('That abbreviation or topic is already in use.');const topicId=old?.id||crypto.randomUUID();const etag=old?.etag||0;if(b.etag!==undefined&&Number(b.etag)!==etag)throw new ConflictError();if((isCorrectivePolicy({id,code:prefix})||old&&isCorrectivePolicy({id:old.id,code:old.prefix}))&&!canManageCorrectiveContent(ctx.person))throw new ForbiddenError('Manager authority is required to change this topic.');if(old&&typeof b.archived!=='boolean')throw new AppError('Set the topic status.');try{const w=etag?await db.prepare('UPDATE sop_topics SET prefix=?,name=?,archived=?,etag=etag+1 WHERE id=? AND etag=?').bind(prefix,name,b.archived?1:0,topicId,etag).run():await db.prepare('INSERT INTO sop_topics(id,prefix,name,archived,etag) VALUES(?,?,?,?,1) ON CONFLICT(id) DO NOTHING').bind(topicId,prefix,name,b.archived?1:0).run();if(!w.meta.changes)throw new ConflictError();}catch(e){if(/unique constraint/i.test(String(e)))throw new ConflictError('That topic abbreviation is in use.');throw e;}return {id:topicId};}
 if(action==='create'){const t=ts.find(t=>t.id===b.topicId&&!t.archived);if(!t)throw new AppError('Choose an active policy topic.');if(isCorrectivePolicy({topicId:t.id,code:t.prefix})&&!canManageCorrectiveContent(ctx.person))throw new ForbiddenError('Manager authority is required to edit corrective policies.');const c=content(b.content),au=isCorrectiveTopic(t)?allEmployees():b.audience?audience(b.audience,ctx):none();await ensureRefs(c.relatedIds,'');if(b.requireOnboardingSignature!==undefined&&typeof b.requireOnboardingSignature!=='boolean')throw new AppError('Choose a valid onboarding signature option.');const newId=await allocate(t.prefix);const row:StoredPolicy=withImportedCorrectiveSections({id:newId,code:newId,requireOnboardingSignature:b.requireOnboardingSignature!==false,topicId:t.id,version:1,etag:1,content:c,audience:au,status:'Draft',...audit(ctx)} as StoredPolicy);await commit(newId,0,[row],1);return {id:newId,version:1,policy:{...row,etag:1}};}
 const {etag,versions}=await policyHistory(id);const p=versions.find(p=>p.version===b.version);if(!p)throw new AppError('Policy version unavailable.',404);if(!canEditEntry(p,ctx))throw new ForbiddenError('Manager authority is required to edit this policy.');if(b.etag!==etag)throw new ConflictError();const max=Math.max(...versions.map(x=>x.version));const draft=versions.find(x=>x.status==='Draft');const topic=ts.find(t=>t.id===p.topicId);
 if(action==='draft'||action==='restore'){if(action==='draft'&&p.status!=='Published'||action==='restore'&&p.status!=='Archived')throw new AppError('Select a current policy to revise or an archived version to restore.');if(draft)throw new ConflictError('A working draft already exists. Open it before starting another revision.');if(!topic||topic.archived)throw new AppError('Restore the topic first.');const copy:StoredPolicy={...p,...audit(ctx),status:'Draft',version:max+1,sourceStatus:undefined,originalPdf:false,content:{...p.content,revision:(max+1)+'.0',approvalStatus:'Draft'}};delete copy.archivedFrom;delete copy.pdfEdition;delete copy.publication;await commit(id,etag,[copy],copy.version);return {id,version:copy.version,policy:{...copy,etag:etag+1}};}
 if(action==='archive'){if(p.status==='Archived')throw new AppError('Already archived.');const archived:StoredPolicy={...p,...audit(ctx),status:'Archived',archivedFrom:p.status};await commit(id,etag,[archived],max);return {id,version:p.version};}
 if(!['save','publish'].includes(action)||p.status!=='Draft')throw new AppError('Only a working draft can be changed.');if(!topic||topic.archived)throw new AppError('Restore the topic first.');
 const c=b.content===undefined?p.content:content(b.content),au=isCorrectivePolicy(p)?allEmployees():b.audience===undefined?p.audience:audience(b.audience,ctx);await ensureRefs(c.relatedIds,id);
 if(b.requireOnboardingSignature!==undefined&&typeof b.requireOnboardingSignature!=='boolean')throw new AppError('Choose a valid onboarding signature option.');
 const next:StoredPolicy=withImportedCorrectiveSections({...p,requireOnboardingSignature:b.requireOnboardingSignature===undefined?p.requireOnboardingSignature!==false:b.requireOnboardingSignature,content:c,audience:au,originalPdf:!!p.originalPdf&&JSON.stringify(content(p.content))===JSON.stringify(content(c)),...audit(ctx)});
 if(action==='save'){await commit(id,etag,[next],max);return {id,version:p.version,policy:{...next,etag:etag+1}};}
 const problem=blocker(next,topic);if(problem)throw new AppError(problem);
 const signer=publicationSigner(ctx,b),refs=catalogRefs(await policies(ctx)),batchId=crypto.randomUUID(),at=now();
 const published=await issuePolicy(next,topic,refs,ctx.v,signer,at,batchId);
 const writes:StoredPolicy[]=versions.filter(e=>e.status==='Published').map(e=>({...e,updatedAt:at,updatedBy:signer,status:'Archived',archivedFrom:'Published'}));writes.push(published);
 await commitPublication([{id,expected:etag,maxVersion:max,topic,writes}],batchId);
 return {id,version:p.version,policy:{...published,etag:etag+1}};
}

function publicationSigner(ctx:Ctx,b:Record<string,unknown>){
 if(ctx.person.id!==ctx.v.person||b.personId!==undefined&&b.personId!==ctx.v.person||b.accountId!==undefined&&b.accountId!==ctx.v.id)throw new ForbiddenError();
 const norm=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
 const signed=typeof b.signerName==='string'&&b.signerName.length<=200?b.signerName:'';
 const name=signerNames(ctx.person).find(n=>norm(n)===norm(signed));
 if(b.assent!==true||!name)throw new AppError('Confirm publication using your signed-in name.');
 return name;
}

async function publishSelected(ctx:Ctx,b:Record<string,unknown>,ts:Topic[]){
 const signer=publicationSigner(ctx,b);
 if(!Array.isArray(b.policies)||!b.policies.length||b.policies.length>1000)throw new AppError('Select between 1 and 1,000 saved drafts.');
 const selected=b.policies.map(value=>{const e=object(value),id=str(e.id,160,true);if(!Number.isSafeInteger(e.version)||Number(e.version)<1||!Number.isSafeInteger(e.etag)||Number(e.etag)<0)throw new AppError('Each selection needs its version and latest change number.');return {id,version:Number(e.version),etag:Number(e.etag)};});
 if(new Set(selected.map(e=>e.id)).size!==selected.length)throw new AppError('Select each policy once.');
 const fill=b.audienceForUnassigned===undefined?undefined:audience(b.audienceForUnassigned,ctx);
 const catalog=await policies(ctx),byId=new Map<string,StoredPolicy[]>();
 for(const row of catalog){const {assignedToViewer:_,...e}=row;if(!byId.has(e.id))byId.set(e.id,[]);byId.get(e.id)!.push(e);}
 const pending=selected.map(sel=>{
   const history=byId.get(sel.id),p=history?.find(p=>p.version===sel.version);
   if(isCorrectivePolicy({id:sel.id})&&!canManageCorrectiveContent(ctx.person)||p&&!canEditEntry(p,ctx))throw new ForbiddenError('Manager authority is required to publish this policy.');
   if(!history||!p||p.etag!==sel.etag||p.status!=='Draft')throw new ConflictError(sel.id+': this is no longer the selected draft. Nothing was published.');
   const t=ts.find(t=>t.id===p.topicId),au=isCorrectivePolicy(p)?allEmployees():audience(!hasAudience(p.audience)&&fill?fill:p.audience,ctx),next={...p,audience:au};
   const issue=blocker(next,t);if(issue||!t)throw new AppError(sel.id+': '+(issue||'Topic unavailable.')+' Nothing was published.');
   if(next.content.relatedIds.some(id=>id===next.id||!byId.has(id)))throw new AppError(sel.id+': resolve the related policy references before publishing.');
   return {p:next,topic:t,history,sel};
 });
 const refs=catalogRefs(catalog);
 for(const item of pending)refs.set(item.p.id,item.p);
 const batchId=crypto.randomUUID(),at=now(),plans=await Promise.all(pending.map(async({p,topic,history,sel})=>{
   const issue=await issuePolicy(p,topic,refs,ctx.v,signer,at,batchId);
   const writes:StoredPolicy[]=history.filter(e=>e.status==='Published').map(e=>({...e,status:'Archived',archivedFrom:'Published',updatedAt:at,updatedBy:signer}));
   writes.push(issue);return {id:p.id,expected:sel.etag,maxVersion:Math.max(...history.map(e=>e.version)),topic,writes};
 }));
 await commitPublication(plans,batchId);
 return {published:plans.length,batchId,publishedAt:at};
}
