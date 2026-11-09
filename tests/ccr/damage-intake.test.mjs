import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {pathToFileURL} from 'node:url';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
const req=createRequire(resolve('package.json')),{build}=req('esbuild'),tmp=await mkdtemp(join(tmpdir(),'intake-originals-')),sql=new DatabaseSync(':memory:');
sql.exec(await readFile('drizzle/0028_ccr_damage_intake.sql','utf8'));
sql.exec(await readFile('drizzle/0033_damage_correspondence.sql','utf8'));
sql.exec(await readFile('drizzle/0034_damage_attachment_inventory.sql','utf8'));
sql.exec('CREATE TABLE hr_records (kind TEXT NOT NULL, payload TEXT NOT NULL);');
const db={prepare(statement){let args=[];return {bind(...vals){args=vals;return this;},async all(){return {results:sql.prepare(statement).all(...args)};},async first(){return sql.prepare(statement).get(...args)||null;},async run(){return {meta:{changes:sql.prepare(statement).run(...args).changes}};}};},async batch(arr){sql.exec('begin immediate');try{const rows=[];for(const s of arr)rows.push(await s.run());sql.exec('commit');return rows;}catch(e){sql.exec('rollback');throw e;}}};
const objs=new Map(),bucket={list:async({prefix})=>({objects:[...objs].filter(([k])=>k.startsWith(prefix)).map(([key,b])=>({key,size:b.length}))}),put:async(k,b)=>objs.set(k,Uint8Array.from(b)),delete:async k=>{for(const i of Array.isArray(k)?k:[k])objs.delete(i);},get:async k=>objs.has(k)?{arrayBuffer:async()=>objs.get(k).slice().buffer}:null};
const roles={writer:{id:'native',name:'Test Reviewer',person:'one',owner:true},reader:{id:'native-read',name:'Test Reader',person:'two',access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'View'}]},none:{id:'native-block',name:'Other',person:'three',access:[]}};globalThis.damageDocTest={db,bucket,roles,key:Buffer.alloc(32,5).toString('base64')};
const defs=new Map([['@/db/finance','export const financeDb=()=>globalThis.damageDocTest.db,financeFiles=()=>globalThis.damageDocTest.bucket'],['cloudflare:workers','export const env={get HR_DATA_ENCRYPTION_KEY(){return globalThis.damageDocTest.key}}'],['@/lib/finance/server','export const requestViewer=async h=>globalThis.damageDocTest.roles[h.get("role")],allRecords=async()=>globalThis.damageDocTest.staff||[],identify=()=>null'],['@/lib/accounts/server','export const yearCaseRows=async()=>globalThis.damageDocTest.property||[],claimChoiceRows=yearCaseRows'],['next/server','export const NextResponse={json:Response.json}']]);
try{
await build({bundle:true,format:'esm',platform:'node',outdir:tmp,outExtension:{'.js':'.mjs'},entryPoints:{active:'app/api/ccr/damage-intake/documents/active/route.ts',inventory:'lib/ccr/damage-attachment-index-server.ts',mail:'lib/ccr/damage-correspondence-server.ts',methods:'lib/ccr/damage-intake-server.ts',stage:'app/api/ccr/damage-intake/documents/stage/route.ts',read:'app/api/ccr/damage-intake/documents/route.ts'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>defs.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:defs.get(a.path)}));}}]});
const [m,st,g]=await Promise.all(['methods','stage','read'].map(x=>import(pathToFileURL(join(tmp,x+'.mjs')))));
const inp={threadId:'123abc',title:'Smoke claim',reportedOn:'2025-12-31',summary:'Fixture only',status:'Outcome Unverified',references:[{messageId:'876fed',threadId:'123abc',on:'2025-12-31',subject:'Fixture source',note:'Test'}]};
const {id}=await m.damageImport(roles.writer,inp),url='https://example.test/api/ccr/damage-intake/documents';
const cm=await import(pathToFileURL(join(tmp,'mail.mjs'))),group={threadId:inp.threadId,record:inp,messages:[{messageId:'email-reply-100',threadId:inp.threadId,on:'2026-01-01',sentAt:'2026-01-01T12:14:00Z',direction:'PTE Reply',senderLabel:'Support Team',subject:'Re: Fixture source',body:'A private original message.',omissions:[]}]};
const beforeMail=await cm.fileHistoricalGroup(roles.writer,group,false);assert.equal(beforeMail.matched,0);assert.equal(beforeMail.sourcesComplete,false);
assert.equal((await cm.fileHistoricalGroup(roles.writer,group,true)).matched,1);
assert.equal((await cm.fileHistoricalGroup(roles.writer,group,true)).matched,1);
assert.equal((await cm.fileHistoricalGroup(roles.writer,group,false)).sourcesComplete,true);
assert.equal((await m.getDamageIntake(id)).references.find(r=>r.messageId==='email-reply-100').subject,'Re: Fixture source');
assert.equal((await cm.historicalByCase(roles.writer,id))[0].body,'A private original message.');
assert.equal(sql.prepare('SELECT count(*) n FROM ccr_damage_mail').get().n,1);
assert.ok(!sql.prepare('SELECT payload FROM ccr_damage_mail').get().payload.includes('private original'));
await assert.rejects(()=>cm.historicalByCase(roles.reader,id),e=>e.status===403);
await assert.rejects(()=>cm.fileHistoricalGroup({...roles.writer,id:'preview:bad'},group,true),e=>e.status===403);
await assert.rejects(()=>cm.fileHistoricalGroup(roles.writer,{...group,messages:[{...group.messages[0],body:'Altered'}]},true),e=>e.status===409);
assert.deepEqual(await m.damageImport(roles.writer,inp,true),{status:'confirmed',id,matchedSources:1});
assert.equal((await m.damageImport(roles.writer,inp)).status,'unchanged');
assert.equal((await m.getDamageIntake(id)).accountId,undefined);
assert.equal((await m.getDamageIntake(id)).status,'Outcome Unverified');
await assert.rejects(()=>m.damageImport(roles.reader,inp),e=>e.status===403);
await assert.rejects(()=>m.damageImport({...roles.writer,id:'preview:bad'},inp),e=>e.status===403);
await assert.rejects(()=>m.damageImport(roles.writer,{...inp,threadId:'999new',references:[...inp.references,{messageId:'extra001',threadId:'999new',on:'2025-12-30',subject:'Different message',note:'Other source'}].map(r=>r.messageId==='876fed'?{...r,subject:'Altered'}:r)}),e=>e.status===409);
await assert.rejects(()=>m.damageImport(roles.writer,{...inp,status:'Closed'}),e=>e.status===400);
let existing=(await m.getDamageIntake(id));
assert((await m.listDamageIntakes(roles.reader)).some(x=>x.id===id));
assert.doesNotMatch(sql.prepare('SELECT payload FROM ccr_damage_intake_versions LIMIT 1').get().payload,/Smoke claim|123abc|876fed/);
assert.doesNotMatch(sql.prepare('SELECT lookup FROM ccr_damage_intake_sources LIMIT 1').get().lookup,/876fed/);
const md={...inp,title:'Another Verified Incident',threadId:'555abc',references:[{...inp.references[0],messageId:'555ddd',threadId:'555abc'}],propertyName:'East Bay',claimReference:'TEST-CLAIM-0001'};
globalThis.damageDocTest.property=[{id:'accountA',kind:'account',name:'East Bay'}];
const second=await m.damageImport(roles.writer,md),s=await m.getDamageIntake(second.id);
assert.equal(s.accountId,'accountA');assert.equal(s.files.length,0);
assert.equal((await m.damageImport(roles.writer,{...md,references:[...md.references,{messageId:'555eee',threadId:'555fff',on:'2026-01-01',subject:'Same incident follow-up',note:'Additional verified source.'}]})).status,'updated');
const append=await m.getDamageIntake(s.id);
await m.noteDamage(roles.writer,{id:s.id,version:append.version,status:'Closed',note:'Reviewed a final decision.'});
assert.equal((await m.damageImport(roles.writer,md)).status,'unchanged');
assert.equal((await m.getDamageIntake(s.id)).status,'Closed');assert.equal((await m.getDamageIntake(s.id)).initialStatus,'Outcome Unverified');
await assert.rejects(()=>m.noteDamage(roles.writer,{id:s.id,version:1,status:'Open',note:'Expired tab'}),e=>e.status===409);
// Operational facts can be added after closure without changing the original report or source evidence.
globalThis.damageDocTest.staff=[{id:'former-driver',kind:'person',name:'Former Driver',status:'Former',department:'Drivers'}];
globalThis.damageDocTest.property=[{id:'accountA',kind:'account',name:'East Bay'},{id:'contactA',kind:'contact',name:'Property Contact'}];
const beforeDetails=await m.getDamageIntake(s.id);
await m.noteDamage(roles.writer,{id:s.id,version:beforeDetails.version,status:'Closed',note:'Verified the driver and incident details.',details:{driverId:'former-driver',contactId:'contactA',accidentInvolved:'Yes',accidentOn:'2025-12-31',driverInjury:'Unknown',ownerInjury:'No',lawAgency:'Fixture Agency'}});
const withDetails=await m.getDamageIntake(s.id);
assert.equal(withDetails.driverId,'former-driver');assert.equal(withDetails.driverName,'Former Driver');assert.equal(withDetails.driverStatus,'Former');assert.equal(withDetails.contactName,'Property Contact');assert.equal(withDetails.status,'Closed');
for(const key of ['summary','title','reportedOn','propertyName','initialStatus','statusBasis','references','files'])assert.deepEqual(withDetails[key],beforeDetails[key],key);
assert.deepEqual(withDetails.updates.slice(0,-1),beforeDetails.updates);assert.deepEqual(withDetails.updates.at(-1).changes.driverId,{before:'',after:'former-driver'});
await assert.rejects(()=>m.noteDamage(roles.writer,{id:s.id,version:withDetails.version,status:'Closed',note:'Forbidden detail change',details:{paidAmount:900}}),/Only operational/);
await assert.rejects(()=>m.noteDamage(roles.reader,{id:s.id,version:withDetails.version,status:'Closed',note:'Unauthorized note',details:{driverInjury:'No'}}),e=>e.status===403);
assert.deepEqual(await m.damageIntakeReferencesForDriver('former-driver'),[{id:s.id,driverId:'former-driver',reportedOn:'2025-12-31',status:'Closed',claimReference:'TEST-CLAIM-0001'}]);
assert.deepEqual(await m.damageIntakeReferencesForDriver('other-driver'),[]);
const sampleId='dmi_'+'a'.repeat(64);await m.saveDamageEdition({...withDetails,id:sampleId,version:1,sample:true});
assert.equal((await m.damageIntakeReferencesForDriver('former-driver')).length,1);
await m.saveDamageEdition({...withDetails,version:withDetails.version+1,driverId:'another-driver'});
assert.deepEqual(await m.damageIntakeReferencesForDriver('former-driver'),[]);
globalThis.damageDocTest.property=[{kind:'claim',name:'Other Title',insurerClaimNumber:'property-00044'}];
await assert.rejects(()=>m.damageImport(roles.writer,{...md,claimReference:'property-00044',threadId:'new_1234',references:[{...md.references[0],messageId:'new_7890',threadId:'new_1234'}],title:'New source'}),e=>e.status===409);
globalThis.damageDocTest.property=[];
const content=new Uint8Array(850000);content.set(new TextEncoder().encode('%PDF-1.7\ntest'));const sha256=createHash('sha256').update(content).digest('hex');
const headers=(role,ctype)=>({role,origin:'https://example.test','content-type':ctype});
async function post(action,query='',role='writer'){const q=new URL(url+'/stage'+query),p=new Request(q,{method:'POST',body:action instanceof Uint8Array?action:JSON.stringify(action),headers:headers(role,action instanceof Uint8Array?'application/octet-stream':'application/json')});Object.defineProperty(p,'nextUrl',{value:q});return st.POST(p);}
function download(fid,role='reader'){const q=new URL(url+'?id='+id+'&file='+fid),p=new Request(q,{headers:headers(role,'none')});Object.defineProperty(p,'nextUrl',{value:q});return g.GET(p);}
const ctrl=(type,src)=>({action:'start',name:'report.pdf',bytes:content.length,sha256,declaredMime:'application/pdf',fields:{claimId:id,documentType:type,sourceMessageId:src}});
assert.equal((await post(ctrl('Correspondence','bad-reference'))).status,400);assert.equal((await post(ctrl('Correspondence','876fed'),'','reader')).status,403);
async function complete(type='Correspondence'){const resp=await post(ctrl(type,'email-reply-100'));assert.equal(resp.status,200,await resp.clone().text());const s=await resp.json();
 assert.equal((await post(content.slice(0,s.partBytes),'?stage='+s.id+'&part=0','none')).status,403);
 for(let i=0;i<s.parts;i++)assert.equal((await post(content.subarray(i*s.partBytes,(i+1)*s.partBytes),'?stage='+s.id+'&part='+i)).status,200);
 assert.equal((await post({action:'seal',id:s.id,group:0})).status,200);return post({action:'attach',id:s.id});}
const ok=await complete();assert.equal(ok.status,200,await ok.clone().text());const f=await ok.json();assert.equal(f.status,'added');assert.equal(f.sha256,sha256);const r=await m.getDamageIntake(id);assert.equal(r.version,3);assert.equal(r.files[0].sourceMessageId,'email-reply-100');assert.equal(r.files[0].byId,'native');
assert.equal((await download(f.fileId,'none')).status,403);assert.equal((await download(f.fileId,'reader')).status,403);const read=await download(f.fileId,'writer');assert.match(read.headers.get('cache-control'),/no-store/);assert.equal(createHash('sha256').update(Buffer.from(await read.arrayBuffer())).digest('hex'),sha256);
const repeat=await (await complete()).json();assert.equal(repeat.status,'already-attached');assert.equal(repeat.fileId,f.fileId);assert.equal((await m.getDamageIntake(id)).version,3);assert.equal((await complete('Evidence Packet')).status,409);assert.equal((await m.getDamageIntake(id)).files.length,1);
const key=[...objs.keys()].find(k=>k.startsWith('ccr-damage-intake-originals'));assert.notEqual(Buffer.from(objs.get(key).slice(0,4)).toString(),'%PDF');objs.get(key)[48]^=1;assert.notEqual((await download(f.fileId,'writer')).status,200);
const short=Buffer.from('%PDF-1.7\nfixture-small-document\n%%EOF'),sum=createHash('sha256').update(short).digest('hex');
async function small(role,hash=sum,src='876fed',bytes=short,name='small.pdf'){const form=new FormData();form.set('claimId',id);form.set('documentType','Correspondence');form.set('sourceMessageId',src);form.set('sha256',hash);form.set('file',new File([bytes],name,{type:'application/pdf'}));const q=new URL(url),p=new Request(q,{method:'POST',headers:{role,origin:q.origin},body:form});Object.defineProperty(p,'nextUrl',{value:q});return g.POST(p);}
assert.equal((await small('reader')).status,403);assert.equal((await small('writer','0'.repeat(64))).status,400);assert.equal((await small('writer',sum,'bad-source')).status,400);
const tiny=await (await small('writer')).json();assert.equal(tiny.sha256,sum);assert.equal((await (await small('writer')).json()).fileId,tiny.fileId);assert.equal((await small('writer',sum,'876fed',Buffer.alloc(409601))).status,413);
const inv=await import(pathToFileURL(join(tmp,'inventory.mjs')));const baseDoc={name:'small.pdf',sha256:sum,bytes:short.length,documentType:'Correspondence',sourceMessageId:'876fed'};
const sec={...baseDoc,name:'not-yet.pdf',sha256:'1'.repeat(64)},unmapped={...baseDoc,name:'no-link.pdf',sha256:'2'.repeat(64),sourceMessageId:'no-matching-doc'};
sql.exec('DROP TABLE ccr_damage_source_inventory'); // Simulate a cold partition with ordinary grants unchanged.
const pack={format:'command-damage-attachment-inventory-v1',claims:[{threadId:inp.threadId,documents:[baseDoc,sec,unmapped]}]};
await assert.rejects(()=>inv.indexDamageSources(roles.reader,pack,true),/access/);await assert.rejects(()=>inv.readDamageSources(roles.reader,id),/access/);assert.equal((await inv.indexDamageSources(roles.writer,pack,false)).matched,0);
const receiptInv=await inv.indexDamageSources(roles.writer,pack,true);assert.equal(receiptInv.matched,2);assert.equal(receiptInv.files,1);assert.equal(receiptInv.pending,1);assert.equal(receiptInv.waiting,1);
assert.deepEqual(await inv.indexDamageSources(roles.writer,pack,false),receiptInv);assert.deepEqual(await inv.indexDamageSources(roles.writer,pack,true),receiptInv);
const catalog=await inv.readDamageSources(roles.writer,id);assert.equal(catalog.find(x=>x.sha256===sum).fileId,tiny.fileId);assert.equal(catalog.find(x=>x.sha256===sec.sha256).fileId,undefined);assert(catalog.every(x=>x.subject&&x.on));assert(!JSON.stringify(sql.prepare('SELECT * FROM ccr_damage_source_inventory').all()).includes('small.pdf'));
await assert.rejects(()=>inv.indexDamageSources(roles.writer,{...pack,claims:[{threadId:inp.threadId,documents:[{...baseDoc,name:'altered-name.pdf'}]}]},true),/different original/);
// Legacy stages recover only for the exact principal, current native destination, source and bytes. Discovery is read-only.
const stReq={...ctrl('Correspondence','email-reply-100'),name:'new-resume-fixture.pdf',declaredMime:'',resume:true};
const res=await(await post({...stReq,resume:false})).json();assert.equal(res.resumable,undefined);
assert.equal((await post(content.slice(0,res.partBytes),'?stage='+res.id+'&part=0')).status,200);
const active=await import(pathToFileURL(join(tmp,'active.mjs')));
roles.secondOwner={...roles.writer,id:'another-owner',person:'another-person'};
const cd={threadId:inp.threadId,name:stReq.name,bytes:stReq.bytes,sha256:stReq.sha256,sourceMessageId:'email-reply-100',documentType:'Correspondence'};
async function look(candidates,role='writer',origin='https://example.test'){const q=new URL(url+'/active'),p=new Request(q,{method:'POST',body:JSON.stringify({candidates}),headers:{...headers(role,'application/json'),origin}});Object.defineProperty(p,'nextUrl',{value:q});return active.POST(p);}
const variants=[cd,{...cd,name:'else.pdf'},{...cd,bytes:cd.bytes+1},{...cd,sha256:'7'.repeat(64)},{...cd,sourceMessageId:'555ddd'},{...cd,threadId:md.threadId},{...cd,documentType:'Evidence Packet'}];
assert.deepEqual(await(await look(variants)).json(),{matches:[0]});assert.deepEqual(await(await look([cd],'secondOwner')).json(),{matches:[]});
assert.equal((await look([cd],'reader')).status,403);assert.equal((await look([cd],'writer','https://wrong.test')).status,403);
const stageCount=()=>sql.prepare('SELECT count(*) n FROM ccr_document_upload_stages').get().n,countBefore=stageCount();
for(const altered of [{name:'else.pdf'},{bytes:stReq.bytes+1},{sha256:'7'.repeat(64)},{declaredMime:'application/pdf'},{fields:{claimId:second.id,documentType:'Correspondence',sourceMessageId:'555ddd'}},{fields:{...stReq.fields,documentType:'Evidence Packet'}}]){
 assert.equal((await post({...stReq,...altered,existingOnly:true})).status,409);}
assert.equal((await post({...stReq,existingOnly:true},'','secondOwner')).status,409);
assert.equal((await post({...stReq,fields:{...stReq.fields,sourceMessageId:'555ddd'},existingOnly:true})).status,400);
assert.equal(stageCount(),countBefore);assert.equal((await(await post({...stReq,existingOnly:true})).json()).id,res.id);
const resumed=await(await post(stReq)).json();assert.equal(resumed.id,res.id);assert.deepEqual(resumed.receivedParts,[0]);assert.deepEqual(resumed.sealedGroups,[]);const different=await(await post({...stReq,fields:{...stReq.fields,documentType:'Evidence Packet'}})).json();assert.notEqual(different.id,res.id);assert.deepEqual(different.receivedParts,[]);
assert.equal((await post(content.subarray(res.partBytes),'?stage='+res.id+'&part=1')).status,200);assert.equal((await post({action:'seal',id:res.id,group:0})).status,200);const sealed=await(await post(stReq)).json();assert.deepEqual(sealed.sealedGroups,[0]);const receipt=await(await post({action:'attach',id:res.id})).json();assert.equal(receipt.fileId,f.fileId);
const jpegBytes=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAFAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz+iiivsD50//Z','base64'),jsha=createHash('sha256').update(jpegBytes).digest('hex');const j=await(await small('writer',jsha,'876fed',jpegBytes,'As Received.PNG')).json();assert.equal(j.sha256,jsha);const mr=(await m.getDamageIntake(id)).files.find(x=>x.id===j.fileId);assert.equal(mr.name,'As Received.PNG');assert.equal(mr.type,'image/jpeg');const dl=await download(j.fileId,'writer');assert.equal(dl.status,200);assert.equal(createHash('sha256').update(new Uint8Array(await dl.arrayBuffer())).digest('hex'),jsha);
console.log('PASS: protected 850,000-byte multi-part receipt, immutable version, exact digest, row-bound source and authorization, dedupe, type conflict, corruption check');
}finally{delete globalThis.damageDocTest;sql.close();await rm(tmp,{recursive:true,force:true});}
