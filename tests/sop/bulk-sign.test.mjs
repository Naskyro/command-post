import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Exercise the actual request handlers and SQL transaction, not a simulated signing function.
test('bulk policy signing and onboarding', async t => {
  const db = new DatabaseSync(':memory:');
  const temp = await mkdtemp(join(tmpdir(), 'sop-signature-batch-'));
  t.after(async () => { db.close(); delete globalThis.sopBatchPeople; delete globalThis.sopBatchDb; await rm(temp, {recursive:true, force:true}); });
  for (const migration of ['0012_sop_catalog','0013_sop_version_storage','0014_sop_signatures','0016_sop_policy_opens'])
    db.exec(await readFile('drizzle/'+migration+'.sql','utf8'));
  db.exec('CREATE TABLE hr_write_guard(id TEXT PRIMARY KEY, success INTEGER CHECK(success=1))');
  let beforeBatch;
  globalThis.sopBatchDb = {
    prepare(sql) {
      const q = db.prepare(sql);
      return {args:[],bind(...args){this.args=args;return this;},run(){return {meta:{changes:q.run(...this.args).changes}};},
        first(){return q.get(...this.args);},all(){return {results:q.all(...this.args)};}};
    },
    batch(ops) {
      if(beforeBatch){const hook=beforeBatch;beforeBatch=undefined;hook();}
      db.exec('BEGIN');
      try {const results=ops.map(o=>o.run());db.exec('COMMIT');return results;} catch(e){db.exec('ROLLBACK');throw e;}
    },
  };
  const grant={module:'SOP Library',tab:'library',level:'View'};
  const person=(id,dept,extra={})=>({id,name:id,email:id+'@example.net',kind:'person',status:'Active',departmentId:dept,department:dept,
    role:'Employee',accessMode:'Custom',access:[grant],...extra});
  const hire=person('new','dispatch',{preferredName:'New Hire',status:'Onboarding',access:[]});
  const people=[{id:'dispatch',kind:'department',name:'Dispatch'},{id:'yard',kind:'department',name:'Yard'},
    person('dispatcher','dispatch'),person('peer','dispatch'),person('manual','dispatch'),person('manualhire','dispatch',{status:'Onboarding',access:[]}),person('driver','yard'),
    person('editor','yard',{authorityLevel:'Manager',access:[grant,{module:'SOP Library',tab:'workflow',level:'Edit'}]}),hire];
  globalThis.sopBatchPeople=people;
  const fake=new Map([['next/server','export const NextResponse=Response;'],['@/lib/finance/server','export const allRecords=async()=>globalThis.sopBatchPeople;'],
    ['@/db/finance','export const financeDb=()=>globalThis.sopBatchDb;']]);
  await build({entryPoints:{catalog:'app/api/sop/route.ts',onboard:'app/api/sop/onboarding/route.ts',guards:'lib/sop/onboarding.ts'},
    outdir:temp,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',plugins:[{name:'services',setup(b){
      b.onResolve({filter:/^(next\/server|@\/lib\/finance\/server|@\/db\/finance)$/},a=>({path:a.path,namespace:'service'}));
      b.onLoad({filter:/.*/,namespace:'service'},a=>({contents:fake.get(a.path)}));
    }}]});
  const load=async n=>import(pathToFileURL(join(temp,n+'.mjs')).href);
  const [catalog,onboard,guards]=await Promise.all(['catalog','onboard','guards'].map(load));
  function request(who,body) {return new Request('https://test.invalid/api/sop',{method:body?'POST':'GET',
    headers:{origin:'https://test.invalid','content-type':'application/json','oai-authenticated-user-email':who+'@example.net'},
    ...(body?{body:JSON.stringify(body)}:{})});}
  async function post(who,body,status=200,route=catalog) {
    const response=await route.POST(request(who,body));const data=await response.json();
    assert.equal(response.status,status,JSON.stringify({who,action:body.action,data}));return data;
  }
  const audience=(all,departments=[])=>({all,departments,levels:[],people:[]});
  function seed(id,version,au,options={}) {
    const status=options.status||'Published';
    const payload={id,code:id,version,status,topicId:'ALL',etag:version,content:{title:'Training '+id,revision:String(version),
      sections:[{title:'Steps',text:'Follow the assigned procedure.'}],relatedIds:[]},audience:au,requireOnboardingSignature:options.required!==false};
    db.prepare('INSERT OR REPLACE INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run(id+'|'+version,id,status,JSON.stringify(payload));
  }
  const all=audience(true),dispatch=audience(false,['dispatch']),yard=audience(false,['yard']);
  const a={id:'QA-101',version:1},b={id:'QA-102',version:1},optional={id:'QA-103',version:1},c={id:'QA-104',version:1};
  const refs=[a,b,optional];
  seed(a.id,1,all);seed(b.id,1,dispatch);seed(optional.id,1,dispatch,{required:false});seed(c.id,1,yard);
  const open=(who,ed,status=200,api=catalog)=>post(who,{action:'opened',...ed},status,api);
  const sign=(who,editions,more={},status=200,api=catalog)=>post(who,{action:'signAll',assent:true,signerName:who,policies:editions,...more},status,api);
  const receipts=who=>db.prepare('SELECT receipt FROM sop_signatures WHERE person_id=? ORDER BY policy_key').all(who).map(o=>JSON.parse(o.receipt));
  const guard=id=>guards.onboardingSopApprovalGuard(hire,people,id).run();

  await t.test('manual review attestation signs current policies without manufacturing app-open receipts',async()=>{
    await sign('manual',refs,{},400);
    await sign('manual',refs,{manualReviewAttestation:'true'},400);
    await sign('manual',refs,{manualReviewAttestation:true,signerName:'peer'},400);
    await sign('manual',refs,{manualReviewAttestation:true,assent:false},400);
    await sign('manual',refs,{manualReviewAttestation:true,personId:'peer'},403);
    await sign('manual',[...refs,c],{manualReviewAttestation:true},409);
    assert.equal(receipts('manual').length,0);
    const signed=await sign('manual',refs,{manualReviewAttestation:true});assert.equal(signed.signed,3);
    for(const r of receipts('manual')){assert.equal(r.reviewMethod,'self-attested');assert.equal(r.openedAt,undefined);assert.equal(r.batchId,signed.batchId);assert.match(r.attestation,/current policy version/i);assert.match(r.contentHash,/^[a-f0-9]{64}$/);}
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sop_policy_opens WHERE person_id=?').get('manual').n,0);
    await sign('manual',refs,{manualReviewAttestation:true},409);
    const x=await sign('manualhire',[a,b],{manualReviewAttestation:true},200,onboard);assert.equal(x.signed,2);
    const status=await (await onboard.GET(request('manualhire'))).json();assert.equal(status.complete,true);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sop_policy_opens WHERE person_id=?').get('manualhire').n,0);
  });
  await t.test('requires an individual open by the signer for each assigned current edition and explicit own-name assent',async()=>{
    await sign('dispatcher',refs,{},400);
    await open('driver',b,403);await open('editor',b,403); // Catalog editors can read other policies, but cannot sign for unassigned departments.
    for(const ed of refs)await open('peer',ed);
    const first=await open('dispatcher',a);assert.equal((await open('dispatcher',a)).openedAt,first.openedAt);
    await sign('dispatcher',refs,{},400); // A peer's openings must not count.
    await open('dispatcher',b);await open('dispatcher',optional);
    await sign('dispatcher',refs,{signerName:'Another Employee'},400);
    await sign('dispatcher',refs,{assent:false},400);await sign('dispatcher',refs,{personId:'peer'},403);
    await sign('dispatcher',[a,a,optional],{},400);await sign('dispatcher',[a,b],{},409);await sign('dispatcher',[...refs,c],{},409);
    assert.equal(receipts('dispatcher').length,0);
    const complete=await sign('dispatcher',refs);const r=receipts('dispatcher');
    assert.equal(complete.signed,3);assert.deepEqual(r.map(o=>o.policyId),refs.map(e=>e.id));
    for(const item of r){assert.equal(item.batchId,complete.batchId);assert.equal(item.personId,'dispatcher');assert.equal(item.signedAt,complete.signedAt);
      assert.match(item.contentHash,/^[a-f0-9]{64}$/);assert.match(item.attestation,/individually/i);assert.ok(item.openedAt<=item.signedAt);assert.equal(item.reviewMethod,'in-app-opened');}
    await sign('dispatcher',refs,{},409);assert.deepEqual(receipts('dispatcher'),r);
  });
  await t.test('onboarding requires only specifically assigned required policies, remains blocked until signed, and rejects optional or unauthorized access',async()=>{
    const status=async()=>await (await onboard.GET(request('new'))).json();
    assert.equal((await status()).pending,2);assert.throws(()=>guard('pending'),/CHECK/);
    await open('new',a,403);await open('new',c,403,onboard);await open('new',optional,403,onboard);
    const asHire={signerName:'New Hire'};
    await open('new',a,200,onboard);await sign('new',[a,b],asHire,400,onboard);
    await open('new',b,200,onboard);await sign('new',refs,asHire,409,onboard);
    assert.equal(receipts('new').length,0);
    const x=await sign('new',[a,b],asHire,200,onboard);assert.equal(x.signed,2);
    assert.equal((await status()).complete,true);guard('complete');
    for(const r of receipts('new')){assert.equal(r.signerName,'New Hire');assert.equal(r.personId,'new');}
  });
  await t.test('a mid-signature publication rolls back all writes and a new edition requires its own open, including on onboarding',async()=>{
    // The author republishes B after the read/validation but before D1 executes the write batch.
    const b2={...b,version:2};beforeBatch=()=>{seed(b.id,1,dispatch,{status:'Archived'});seed(b.id,2,dispatch);};
    await sign('peer',refs,{manualReviewAttestation:true},409);assert.equal(receipts('peer').length,0);
    await sign('manual',refs,{manualReviewAttestation:true},409);assert.equal(receipts('manual').length,3);
    const current=[a,b2,optional];await sign('peer',current,{},400);await open('peer',b,403);
    await open('peer',b2);await sign('peer',current);assert.equal(receipts('peer').length,3);
    const progress=await (await onboard.GET(request('new'))).json();assert.equal(progress.pending,1);
    assert.equal(progress.policies.find(x=>x.id===b.id).previousVersionSigned,1);assert.throws(()=>guard('new-version'),/CHECK/);
    await sign('new',[b2],{signerName:'New Hire'},400,onboard);await open('new',b2,200,onboard);
    await sign('new',[b2],{signerName:'New Hire'},200,onboard);guard('updated');
    assert.deepEqual(receipts('new').filter(x=>x.policyId===b.id).map(x=>x.version),[1,2]);
  });
  await t.test('bulk publication approves selected drafts, assigns company-wide corrective standards, and creates an employee signing obligation',async()=>{
    const get=async who=>{const response=await catalog.GET(request(who));assert.equal(response.status,200);return response.json();};
    const draftList=(await get('editor')).policies;
    const hr=draftList.filter(p=>p.status==='Draft'&&p.topicId==='HR-CA').sort((a,b)=>a.code.localeCompare(b.code));
    assert.equal(hr.length,43);assert.ok(hr.every(p=>p.etag===0&&!p.publishBlocker));
    const notReady=draftList.find(p=>p.sourceStatus?.includes('Needs Guidance'));assert.ok(notReady.publishBlocker.includes('guidance'));
    const ref=p=>({id:p.id,version:p.version,etag:p.etag});
    const publish=(who,list,more={},status=200)=>post(who,{action:'publishSelected',policies:list.map(ref),signerName:who,assent:true,...more},status);
    const opts={audienceForUnassigned:dispatch};
    await publish('peer',hr,opts,403);
    await publish('editor',hr,{...opts,signerName:'peer'},400);await publish('editor',hr,{...opts,assent:false},400);
    await publish('editor',[hr[0],hr[0]],opts,400);
    await publish('editor',[hr[0],notReady],opts,400);await publish('editor',[hr[0],{...hr[1],etag:1}],opts,409);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sop_versions WHERE status='Published' AND policy_id LIKE 'HR-CA-%'").get().n,0);
    // An older restricted HR-CA assignment becomes an employee standard for all personnel when issued.
    const saved=await post('editor',{action:'save',...ref(hr[0]),audience:yard});
    const set=[saved.policy,...hr.slice(1)];
    // Race after readiness checks but immediately before write; even unrelated selected rows must not publish.
    beforeBatch=()=>db.prepare('INSERT INTO sop_entries(id,etag,history) VALUES(?,1,?)').run(hr.at(-1).id,'1');
    await publish('editor',set,opts,409);assert.equal(db.prepare("SELECT COUNT(*) n FROM sop_versions WHERE status='Published' AND policy_id LIKE 'HR-CA-%'").get().n,0);
    db.prepare('DELETE FROM sop_entries WHERE id=?').run(hr.at(-1).id);
    const result=await publish('editor',set,opts);assert.equal(result.published,43);
    assert.match(result.publishedAt,/^\d{4}-\d{2}-\d{2}T/);
    const stored=JSON.parse(db.prepare('SELECT payload FROM sop_versions WHERE key=?').get(hr[0].id+'|1').payload);
    assert.deepEqual(stored.audience,all);assert.equal(stored.content.approvalStatus,'Published');
    assert.equal(stored.publication.personId,'editor');assert.equal(stored.publication.signerName,'editor');assert.equal(stored.publication.batchId,result.batchId);
    assert.match(stored.publication.contentHash,/^[a-f0-9]{64}$/);assert.equal(stored.pdfEdition.revisedBy,'editor');assert.equal(stored.pdfEdition.publishedAt,result.publishedAt);
    assert.equal(stored.originalReference,hr[0].id);assert.equal(stored.originalPdf,false);
    const canRead=(await get('driver')).policies.filter(p=>p.topicId==='HR-CA');assert.equal(canRead.length,43);assert.equal(canRead[0].publication.accountId,undefined);
    assert.equal((await get('dispatcher')).policies.filter(p=>p.topicId==='HR-CA').length,43);
    const tasks=await (await onboard.GET(request('new'))).json();assert.equal(tasks.pending,43);assert.throws(()=>guard('published-batch'),/CHECK/);
    await publish('editor',set,opts,409);
    // Publication and employee acknowledgement are two separate actions.
    assert.equal(receipts('editor').length,0);
    const next=await post('editor',{action:'draft',id:stored.id,version:1,etag:2});
    assert.equal(next.policy.publication,undefined);const revision=await publish('editor',[next.policy]);
    assert.equal(revision.published,1);
    const old=JSON.parse(db.prepare('SELECT payload FROM sop_versions WHERE key=?').get(stored.id+'|1').payload);
    assert.equal(old.status,'Archived');assert.deepEqual(old.publication,stored.publication);
    const accessible=(await get('driver')).policies.filter(p=>p.id===stored.id);assert.equal(accessible.length,1);assert.equal(accessible[0].version,2);
    assert.notEqual(accessible[0].publication.contentHash,stored.publication.contentHash);
  });

});
