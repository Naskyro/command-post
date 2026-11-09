import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

// Real gateway identity mapping, access decisions, published-edition projection, PDF renderer,
// signature transactions and HR API. Only the roster and D1/R2 transport are fixtures.
test('HR-CA employee and supervisor materials are isolated across SOP and HR delivery surfaces', async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-hr-ca-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 for(const migration of ['0012_sop_catalog','0013_sop_version_storage','0014_sop_signatures','0015_hr_job_descriptions','0016_sop_policy_opens'])db.exec(await readFile('drizzle/'+migration+'.sql','utf8'));
 db.exec('CREATE TABLE hr_records(id TEXT PRIMARY KEY,kind TEXT,person_id TEXT,payload TEXT,version INTEGER,created_at TEXT,created_by TEXT,updated_at TEXT,updated_by TEXT);CREATE TABLE hr_audit(id TEXT PRIMARY KEY,record_id TEXT,actor TEXT,actor_id TEXT,at TEXT,action TEXT,version INTEGER,snapshot TEXT);CREATE TABLE hr_write_guard(id TEXT PRIMARY KEY,success INTEGER CHECK(success=1));');
 let duringNextBatch;
 const transport={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},run(){return{meta:db.prepare(sql).run(...this.args)};},first(){return db.prepare(sql).get(...this.args)||null;},all(){return{results:db.prepare(sql).all(...this.args)};}};},batch(ops){if(duringNextBatch){const hook=duringNextBatch;duringNextBatch=undefined;hook();}db.exec('BEGIN');try{const done=ops.map(op=>op.run());db.exec('COMMIT');return done;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const grant=(tab,level='View')=>({module:'SOP Library',tab,level}),hrAccess={module:'People & HR',tab:'hiring',level:'View'};
 const person=(id,tier,access=[grant('library')],extra={})=>({id,kind:'person',version:1,status:'Active',workerType:'Employee',name:id,email:id+'@fixture.invalid',department:'Dispatch',departmentId:'dept',role:'Employee',accessMode:'Custom',access:[...access,hrAccess],...(tier?{authorityLevel:tier}:{}),...extra});
 const coord=person('coordinator','Coordinator',[grant('library'),grant('workflow','Edit'),{module:'Admin',tab:'users',level:'Edit'}],{title:'Dispatch Manager'}),mgr=person('manager','Manager',[grant('library'),grant('workflow','Edit')],{hrResponsibilities:[{action:'issueCorrective',scope:'Company'},{action:'recordPerformance',scope:'Company'}]});
 const people=[{id:'dept',kind:'department',name:'Dispatch',status:'Active'},person('employee',undefined,[]),coord,mgr,person('lead','Department Lead'),person('director','Director'),person('exec','Executive'),person('hire','Coordinator',[],{status:'Onboarding'}),person('roleonly',undefined,[grant('library'),grant('workflow','Edit')],{role:'Supervisor',title:'Director'}),person('ownerlabel',undefined,[grant('library')],{role:'Owner'})];
 globalThis.hrCaFixtures={DB:transport,HR_DATA_ENCRYPTION_KEY:Buffer.alloc(32,55).toString('base64'),people};
 const fake=new Map([['cloudflare:workers','export const env=globalThis.hrCaFixtures;'],['next/server','export const NextResponse=Response;'],['@/lib/finance/server','export const allRecords=async()=>[...globalThis.hrCaFixtures.people];']]);
 const entries={catalog:'app/api/sop/route.ts',onboard:'app/api/sop/onboarding/route.ts',pdf:'app/api/sop/pdf/route.ts',hr:'app/api/hr/route.ts',hrReceipt:'app/api/hr/sop-signatures/route.ts',hrStore:'lib/hr/server.ts',search:'components/sop/view-model.ts'};
 await build({entryPoints:entries,outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',logLevel:'silent',
   banner:{js:"import {createRequire as __testRequire} from 'node:module'; const require=__testRequire(import.meta.url);"},
   plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/server|@\/lib\/finance\/server)$/},a=>({path:a.path,namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:fake.get(a.path)}));}}]});
 const [catalog,onboard,pdf,hr,hrReceipt,hrStore,search]=await Promise.all(Object.keys(entries).map(n=>import(pathToFileURL(join(dir,n+'.mjs')).href)));
 function req(who,query='',body){const url=new URL('https://test.invalid/api'+query);const r=new Request(url,{method:body?'POST':'GET',headers:{origin:url.origin,'content-type':'application/json','oai-authenticated-user-email':who+'@fixture.invalid'},...(body?{body:JSON.stringify(body)}:{})});r.nextUrl=url;return r;}
 async function getJson(route,who,query=''){const r=await route.GET(req(who,query));const data=await r.json();assert.equal(r.status,200,who+' GET '+query+': '+JSON.stringify(data).slice(0,180));return data;}
 async function post(route,who,data,allow=[200]){const r=await route.POST(req(who,'',data));const x=await r.json();assert.ok(allow.includes(r.status),who+' '+data.action+': '+r.status+' '+JSON.stringify(x).slice(0,220));return x;}
 const id='HR-CA-996',restricted='MGT-996',second='HR-CA-997',publicText='Report a missed shift promptly',consequence='A documented warning may follow',privateText='Compare discipline decisions consistently',canary='ZEBRA_PROTOCOL_996';
 const notes=[{heading:'Conduct Standard',text:publicText,visibility:'employee'},{heading:'Typical Consequences',text:consequence,visibility:'employee'},
  {heading:'Supervisor Review',text:privateText+' '+canary,visibility:'management'},{heading:'Unknown New Heading',text:canary+' UNMARKED'}];
 const mk=(id,topicId,status,version,extra={})=>({id,code:id,topicId,status,version,etag:1,updatedAt:'2026-10-01T12:00:00Z',updatedBy:'Test Manager',requireOnboardingSignature:true,
   audience:{all:false,departments:[],people:['manager'],levels:[]},content:{title:'Attendance '+id,shortName:'ATT',policyOwner:'',preparedDate:'2026-09-01',effectiveDate:'2026-10-01',revision:version+'.0',approvalStatus:'Approved',keywords:canary+'-keyword',sections:notes,relatedIds:[restricted]},...extra});
 const insert=r=>db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES (?,?,?,?)').run(r.id+'|'+r.version,r.id,r.status,JSON.stringify(r));
 insert(mk(id,'HR-CA','Archived',1,{originalReference:'HR-CA-001',originalPdf:true}));insert(mk(id,'HR-CA','Published',2,{originalReference:'HR-CA-001',originalPdf:true,pdfEdition:{topicLabel:'Corrective Action',related:[{reference:restricted,title:canary+' linked title'}]}}));insert(mk(id,'HR-CA','Draft',3));insert(mk(second,'HR-CA','Published',1));insert(mk(restricted,'MGT','Published',1,{requireOnboardingSignature:false,content:{...mk(restricted,'MGT','Published',1).content,title:canary+' Actual Private Reference'}}));
 // Persist realistic head rows (initial imported editions may instead be headless).
 for(const [k,v] of [[id,3],[second,1],[restricted,1]])db.prepare('INSERT INTO sop_entries (id,etag,history) VALUES (?,?,?)').run(k,1,'[]');
 const q=(k=id,v=2,more='')=>'/sop/pdf?id='+k+'&version='+v+more;
 const assertPublic=p=>{const s=JSON.stringify(p);assert.ok(!s.includes(canary),s.slice(0,450));assert.ok(!s.includes(privateText));assert.ok(!s.includes(restricted));assert.ok(!s.includes('HR-CA-001'), 'The stored original reference is private');assert.equal(p.accessEdition,'employee');assert.ok(p.content.sections.some(x=>x.text===publicText));assert.ok(p.content.sections.some(x=>x.text===consequence));assert.ok(!search.searchText(p).includes(canary.toLowerCase()));};
 await t.test('No published employee channel leaks a supervisor section, keyword, frozen related reference, original, draft or archive',async()=>{
  for(const who of ['employee','coordinator','roleonly','ownerlabel']){const l=await getJson(catalog,who);const p=l.policies.find(x=>x.id===id&&x.version===2);assert.ok(p,who+' misses published standards');assertPublic(p);assert.ok(!p.canEditPolicy);assert.ok(!l.policies.some(x=>x.id===id&&x.version!==2));for(const suffix of ['&source=1','&edition=management','&source=1&download=1'])assert.ok([403,404].includes((await pdf.GET(req(who,q(id,2,suffix)))).status),who+suffix);
   for(const v of [1,3])assert.ok([403,404].includes((await pdf.GET(req(who,q(id,v)))).status),who+' guessed v'+v);}
  const listing=await getJson(catalog,'employee'),publicP=listing.policies.find(x=>x.id===id);assert.ok(!listing.policies.some(x=>x.id===restricted));assert.ok(publicP.assignedToViewer);
  for(const who of ['manager','lead','director','exec']){const p=(await getJson(catalog,who)).policies.find(x=>x.id===id&&x.version===2);assert.equal(p.accessEdition,'management',who);assert.ok(JSON.stringify(p.content).includes(privateText));}
  const hireP=(await getJson(onboard,'hire')).policies.find(p=>p.id===id);assertPublic(hireP);const got=await pdf.GET(req('hire',q(id,2,'&onboarding=1&edition=management')));assert.ok([403,404].includes(got.status));
 });
 await t.test('Employee PDF has actual published standards and consequences; opt-in narrower manager preview cannot leak the original pages',async()=>{
  const textOf=async(who,suffix='')=>{const r=await pdf.GET(req(who,q(id,2,suffix)));assert.equal(r.status,200,who+suffix);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');return execFileSync('pdftotext',['-layout','-','-'],{input:bytes}).toString().replace(/\s+/g,' ');};
  for(const [who,suffix] of [['employee',''],['coordinator',''],['hire','&onboarding=1'],['manager','&edition=employee']]){const text=await textOf(who,suffix);assert.ok(text.includes(publicText));assert.ok(text.includes(consequence));assert.ok(!text.includes(canary));assert.ok(!text.includes(privateText));assert.ok(!text.includes('Preserve relevant records'));}const text=await textOf('director');assert.ok(text.includes(privateText));
 });
 await t.test('Module/edit grants and a claimed role cannot mutate protected content or spoof a signing edition',async()=>{
  const ref={id,version:2,etag:1};await post(catalog,'coordinator',{action:'draft',...ref},[403]);await post(catalog,'coordinator',{action:'archive',...ref},[403]);await post(catalog,'coordinator',{action:'create',topicId:'HR-CA',content:mk(id,'HR-CA','Draft',4).content},[403]);await post(catalog,'coordinator',{action:'opened',...ref,accessEdition:'employee'});
  for(const [actor,route] of [['coordinator',catalog],['hire',onboard]])await post(route,actor,{action:'sign',...ref,accessEdition:'management',assent:true,signerName:actor},[400,403,409]);
 });
 await t.test('Own historic employee signature never certifies unreleased supervisor guidance after a promotion',async()=>{
  const ref={id,version:2,accessEdition:'employee'};await post(catalog,'coordinator',{...ref,action:'opened'});const first=(await post(catalog,'coordinator',{...ref,action:'sign',assent:true,signerName:'coordinator'})).signature;assert.equal(first.accessEdition,'employee');assert.ok(!JSON.stringify(first).includes(canary));
  coord.authorityLevel='Manager';let p=(await getJson(catalog,'coordinator')).policies.find(x=>x.id===id&&x.version===2);assert.equal(p.accessEdition,'management');assert.ok(!p.acknowledged);assert.ok(!p.openedAt);
  const mgrRef={...ref,accessEdition:'management'};await post(catalog,'coordinator',{...mgrRef,action:'sign',assent:true,signerName:'coordinator'},[400,403,409]);await post(catalog,'coordinator',{...mgrRef,action:'opened'});const secondSig=(await post(catalog,'coordinator',{...mgrRef,action:'sign',assent:true,signerName:'coordinator'})).signature;assert.equal(secondSig.accessEdition,'management');assert.notEqual(first.contentHash,secondSig.contentHash);
  coord.authorityLevel='Coordinator';p=(await getJson(catalog,'coordinator')).policies.find(x=>x.id===id&&x.version===2);assertPublic(p);assert.equal(p.signature.accessEdition,'employee');const recs=await getJson(hrReceipt,'coordinator','/hr/sop-signatures?personId=coordinator');assert.equal(recs.receipts.filter(x=>x.code===id).length,2);assert.ok(!JSON.stringify(recs).includes(canary));
 });
 await t.test('Onboarding bulk signature uses only the actual hire’s employee editions and valid, individually opened documents',async()=>{
  const list=[{id,version:2,accessEdition:'employee'},{id:second,version:1,accessEdition:'employee'}];for(const ed of list)await post(onboard,'hire',{action:'opened',...ed});
  await post(onboard,'hire',{action:'signAll',assent:true,signerName:'hire',policies:list.map(x=>({...x,accessEdition:'management'}))},[400,403,409]);
  await post(onboard,'hire',{action:'signAll',assent:true,signerName:'hire',policies:list});const receipts=db.prepare('SELECT receipt FROM sop_signatures WHERE person_id=?').all('hire').map(x=>JSON.parse(x.receipt));assert.equal(receipts.length,2);assert.ok(receipts.every(r=>r.accessEdition==='employee'));assert.ok(!JSON.stringify(receipts).includes(canary));
 });
 await t.test('HR list, detail, and employee response keep the actual write-up but not internal policy snapshots',async()=>{
  const persisted={id:'case-fixture',kind:'corrective',personId:'coordinator',version:1,createdAt:'2026-10-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z',createdBy:'Manager',updatedBy:'Manager',
   data:{status:'Issued',employeeVisible:true,subject:'Attendance',action:'Written Warning',reason:'Missed assigned shift',consequence:'Written Warning Issued',policyReference:'HR-CA-001',policySnapshot:{id:'HR-CA-001',version:'3.0',title:'Attendance',description:canary+' confidential facts',response:canary+' enforcement steps',newField:canary}}};
  await hrStore.writeHrRecord(undefined,persisted,{name:'Fixture Manager',id:'test',person:'manager'},'Fixture');
  const list=await getJson(hr,'coordinator','/hr'),detail=await getJson(hr,'coordinator','/hr?id=case-fixture');const outcome=await post(hr,'coordinator',{id:persisted.id,version:1,action:'respond',data:{statement:'I received the warning.'}});
  for(const r of [list.records.find(x=>x.id===persisted.id),detail.record,outcome.record]){assert.equal(r.data.reason,persisted.data.reason);assert.equal(r.data.consequence,persisted.data.consequence);assert.equal(r.data.policySnapshot.title,'Attendance');assert.ok(!JSON.stringify(r).includes(canary));}const original=await getJson(hr,'manager','/hr?id=case-fixture');assert.equal(original.record.data.policySnapshot.response,persisted.data.policySnapshot.response);
 });
 await t.test('HR uses current issued citations atomically for notes and write-ups; protected primary never leaks in the employee subject or PDF',async()=>{
  const target='employee',draftId='case-linked',raw={action:'Written Warning',reason:'Attendance issue on Monday',subject:'untrusted client subject',status:'Draft',consequence:'Actual written warning',sopCitations:[{id:restricted,version:1,title:'forged title'},{id,version:2}]};
  const save=(actor,kind,recordId,v,data,status=[200])=>post(hr,actor,{action:'save',id:recordId,kind,personId:target,version:v,data},status);
  const saved=(await save('manager','corrective',draftId,0,raw)).record;
  assert.equal(saved.data.subject,canary+' Actual Private Reference');assert.equal(saved.data.sopCitations.length,2);assert.equal(saved.data.sopCitations[0].title,canary+' Actual Private Reference');assert.equal(saved.data.sopCitations[0].publicationState,'current');
  assert.deepEqual(saved.data.employeePdfCitations[0],{restricted:true});assert.equal(saved.data.employeePolicySubject,'Restricted Policy Reference');assert.equal(saved.data.employeePdfCitations[1].id,id);
  await save('manager','corrective','case-deprecated',0,{action:'Documented Conversation',subject:'Old policy',policyReference:'HR-CA-001',reason:'Fixture',status:'Draft'},[400,403,409]);
  await save('manager','corrective','case-draft',0,{...raw,sopCitations:[{id,version:3}]},[400,403,409]);
  await save('employee','corrective','case-guess',0,raw,[403]);const noteData={eventType:'Performance Note',eventDate:'2026-10-10',summary:'Employee shift follow-up'};
  const note=(await save('manager','note','note-linked',0,{...noteData,sopCitations:[{id,version:2}]})).record;assert.equal(note.data.sopCitations.length,1);assert.equal(note.data.sopCitations[0].id,id);const plain=(await save('manager','note','note-plain',0,noteData)).record;assert.deepEqual(plain.data.sopCitations,[]);
  // Actual HR publication checks a verified signed scan attached to this exact record version.
  const scanned={id:'hrdoc:fixture-signed-writeup',kind:'document',personId:target,version:1,createdAt:saved.createdAt,updatedAt:saved.createdAt,createdBy:'manager',updatedBy:'manager',data:{category:'Signed Corrective Action',parentId:draftId,parentVersion:saved.version,signatureStatus:'Wet Signature Verified'}};
  await hrStore.writeHrRecord(undefined,scanned,{id:'mgr',name:'manager'},'Fixture Signed Scan');await post(hr,'manager',{action:'publishCorrective',id:draftId,version:saved.version,data:{signedDocumentId:scanned.id}});
  const issued=(await getJson(hr,'employee','/hr?id='+draftId)).record;assert.equal(issued.data.subject,'Restricted Policy Reference');assert.equal(issued.data.consequence,'Actual written warning');assert.equal(issued.data.reason,'Attendance issue on Monday');assert.ok(!JSON.stringify(issued).includes(canary));assert.ok(!JSON.stringify(issued).includes(restricted));assert.equal(issued.data.sopCitations[1].title,'Attendance '+id);
  // Simulate an edition retiring between resolution and the D1 batch; no HR record or audit may survive.
  const race='MGT-998';insert(mk(race,'MGT','Published',1));duringNextBatch=()=>db.prepare("UPDATE sop_versions SET status='Archived' WHERE key=?").run(race+'|1');
  await save('manager','note','stale-note',0,{...noteData,sopCitations:[{id:race,version:1}]},[409]);assert.equal(db.prepare('SELECT count(*) n FROM hr_records WHERE id=?').get('stale-note').n,0);assert.equal(db.prepare('SELECT count(*) n FROM hr_audit WHERE record_id=?').get('stale-note').n,0);
  db.prepare("UPDATE sop_versions SET status='Archived' WHERE key=?").run(restricted+'|1');insert(mk(restricted,'MGT','Published',2,{content:{...mk(restricted,'MGT','Published',2).content,title:'Different Later Title'}}));const historical=(await getJson(hr,'manager','/hr?id='+draftId)).record;assert.equal(historical.data.sopCitations[0].publicationState,'historical');assert.equal(historical.data.sopCitations[0].title,canary+' Actual Private Reference');
 });
});
