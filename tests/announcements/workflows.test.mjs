import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('announcements: authorized publication, personal acknowledgement and history',async t=>{
 const db=new DatabaseSync(':memory:'),temp=await mkdtemp(join(tmpdir(),'announcements-test-'));
 t.after(async()=>{db.close();delete globalThis.annDb;delete globalThis.annPeople;delete globalThis.annRecords;await rm(temp,{recursive:true,force:true});});
 for(const f of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile('drizzle/'+f,'utf8'));
 globalThis.annDb={prepare(sql){const q=db.prepare(sql);return {args:[],bind(...a){this.args=a;return this;},first(){return q.get(...this.args);},all(){return {results:q.all(...this.args)};},run(){return {meta:{changes:q.run(...this.args).changes}};}};},batch(ops){db.exec('BEGIN');try{const r=ops.map(o=>o.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const person=(id,more={})=>({id,kind:'person',name:id,email:id+'@example.net',role:'Employee',workerType:'Employee',status:'Active',version:1,accessMode:'Custom',access:[],...more});
 globalThis.annPeople=[person('jerson',{role:'Owner'}),person('author',{access:[{module:'Admin',tab:'announcements',level:'Edit'}]}),person('reader',{access:[{module:'Admin',tab:'announcements',level:'View'}]}),person('one'),person('two'),person('disabled',{accountStatus:'Disabled'}),person('former',{status:'Terminated'}),person('new',{status:'Onboarding'})];
 globalThis.annRecords=()=>[...globalThis.annPeople,...db.prepare('SELECT payload FROM finance_records').all().map(x=>JSON.parse(x.payload))];
 const fake=new Map([['next/server','export const NextResponse=Response;'],['@/lib/finance/server',`export {persist} from ${JSON.stringify(resolve('lib/finance/server.ts'))};export const allRecords=async()=>globalThis.annRecords();`],['@/db/finance','export const financeDb=()=>globalThis.annDb;']]);
 await build({entryPoints:{api:'app/api/site-announcements/route.ts'},outdir:temp,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(next\/server|@\/lib\/finance\/server|@\/db\/finance)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:fake.get(a.path),resolveDir:process.cwd()}));}}]});
 const api=await import(pathToFileURL(join(temp,'api.mjs')).href);
 const request=(who,b,admin=false)=>new Request('https://test.invalid/api/site-announcements'+(admin?'?admin=1':''),{method:b?'POST':'GET',headers:{origin:'https://test.invalid','content-type':'application/json','oai-authenticated-user-email':who+'@example.net'},...(b?{body:JSON.stringify(b)}:{})});
 async function post(who,b,status=200){const r=await api.POST(request(who,b)),x=await r.json();assert.equal(r.status,status,JSON.stringify({who,b,x}));return x;}
 async function get(who,admin=false,status=200){const r=await api.GET(request(who,undefined,admin)),x=await r.json();assert.equal(r.status,status,JSON.stringify({who,x}));return x;}
 const base={title:'Office Update',body:'Please read this company update.',priority:'Important',startsAt:'',endsAt:'',requiresAcknowledgment:true};
 let a,b;
 await t.test('there are no seeded blasts and only designated editors can create or publish',async()=>{
  assert.equal((await get('one')).active.length,0);await get('one',true,403);await post('reader',{action:'save',announcement:base},403);await post('one',{action:'save',announcement:base},403);
  a=(await post('author',{action:'save',announcement:{...base,requiresAcknowledgment:false}})).announcement;assert.equal(a.requiresAcknowledgment,true);assert.equal(a.status,'Draft');assert.equal((await get('one')).active.length,0);assert.equal((await get('reader',true)).announcements.length,1);
  await post('one',{action:'publish',id:a.id,version:a.version},403);a=(await post('author',{action:'publish',id:a.id,version:a.version})).announcement;assert.equal(a.status,'Published');assert.equal((await get('one')).active.length,1);assert.equal((await get('new')).active.length,1);
 });
 await t.test('acknowledgment is personal, revision-bound and durable',async()=>{
  await post('one',{action:'ack',id:a.id,revision:a.contentRevision,personId:'two'},403);await post('one',{action:'ack',id:a.id,revision:99},409);
  await post('one',{action:'ack',id:a.id,revision:a.contentRevision});assert.equal((await get('one')).active.length,0);assert.equal((await get('two')).active.length,1);
  const report=(await get('author',true)).announcements.find(x=>x.id===a.id);assert.equal(report.acknowledgedCount,1);assert.ok(!report.recipients.some(r=>['disabled','former'].includes(r.personId)));assert.equal(report.recipients.find(r=>r.personId==='one').revision,1);
 });
 await t.test('date-only edits retain receipts, message revisions require a new acknowledgement',async()=>{
  a=(await post('author',{action:'save',announcement:{...a,endsAt:new Date(Date.now()+86400000).toISOString()}})).announcement;assert.equal(a.contentRevision,1);assert.equal((await get('one')).active.length,0);
  a=(await post('author',{action:'save',announcement:{...a,body:'Revised instructions. Read the new procedure.'}})).announcement;assert.equal(a.contentRevision,2);assert.equal((await get('one')).active.length,1);await post('one',{action:'ack',id:a.id,revision:1},409);await post('one',{action:'ack',id:a.id,revision:2});assert.equal((await get('one')).active.length,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM finance_records WHERE kind='announcementReceipt'").get().n,2);
 });
 await t.test('multiple banners are independent, and schedules/expiration filter on the server',async()=>{
  b=(await post('author',{action:'save',announcement:{...base,title:'Second Update'}})).announcement;b=(await post('author',{action:'publish',id:b.id,version:b.version})).announcement;assert.equal((await get('two')).active.length,2);await post('two',{action:'ack',id:b.id,revision:1});assert.equal((await get('two')).active.length,1);
  const future=new Date(Date.now()+86400000).toISOString();let scheduled=(await post('author',{action:'save',announcement:{...base,title:'Scheduled',startsAt:future}})).announcement;scheduled=(await post('author',{action:'publish',id:scheduled.id,version:scheduled.version})).announcement;assert.ok(!(await get('one')).active.some(x=>x.id===scheduled.id));await post('one',{action:'ack',id:scheduled.id,revision:1},400);
  let expired=(await post('author',{action:'save',announcement:{...base,title:'Expired',endsAt:'2000-01-01T00:00:00Z'}})).announcement;await post('author',{action:'publish',id:expired.id,version:expired.version},400);
  b=(await post('author',{action:'save',announcement:{...b,endsAt:'2000-01-01T00:00:00Z'}})).announcement;assert.ok(!(await get('one')).active.some(x=>x.id===b.id));
 });
 await t.test('archive and republish preserve audit and reset only the republished revision',async()=>{
  a=(await post('author',{action:'archive',id:a.id,version:a.version,reason:'Superseded by a new procedure'})).announcement;assert.equal((await get('two')).active.length,0);assert.equal((await get('reader',true)).announcements.find(x=>x.id===a.id).state,'Archived');
  a=(await post('author',{action:'publish',id:a.id,version:a.version})).announcement;assert.equal(a.contentRevision,3);assert.ok((await get('one')).active.some(x=>x.id===a.id));
  const audit=db.prepare("SELECT reason,actor FROM finance_audit WHERE record_id=?").all(a.id);assert.ok(audit.some(x=>x.reason.includes('Archived')&&x.actor==='author'));assert.ok(audit.some(x=>x.reason.includes('Published')));
 });
});
