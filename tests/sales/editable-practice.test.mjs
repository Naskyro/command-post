import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';import {build} from 'esbuild';

test('private Sales workbook: genuine CRM edits and stale-write protection, no customer or cross-user side effects',async t=>{
 const sql=new DatabaseSync(':memory:'),dir=await mkdtemp(join(tmpdir(),'crm-practice-'));t.after(async()=>{sql.close();delete globalThis.practiceFixture;await rm(dir,{recursive:true,force:true});});
 for(const name of (await readdir('drizzle')).filter(s=>s.endsWith('.sql')).sort())sql.exec(await readFile('drizzle/'+name,'utf8'));
 const db={prepare(s){const q=sql.prepare(s);let a=[];return {bind(...x){a=x;return this;},first(){return q.get(...a)||null;},all(){return {results:q.all(...a)};},run(){return {meta:{changes:q.run(...a).changes}};}};},batch(ops){sql.exec('BEGIN');try{const r=ops.map(o=>o.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const grant=(tab,level='Edit')=>({module:'Sales CRM',tab,level});
 const rights={rep:['pipeline','relationships','activity','routes','email'].map(t=>grant(t)),second:['pipeline','relationships'].map(t=>grant(t)),view:[grant('record','View')],rel:[grant('relationships')],sched:[grant('activity')],outside:[{module:'Accounts',tab:'overview',level:'Edit'}]};
 const actors=Object.fromEntries(Object.entries(rights).map(([person,access])=>[person,{person,id:person,name:person,kind:'person',status:'Active',role:'Employee',department:'Sales',access,owner:false}]));
 const live={id:'live-lead',name:'A Live Account Prospect',kind:'opportunity',version:1,stage:'Engaged',assignee:'sched',address:'Real Road'};
 const realContact={id:'real-contact',kind:'contact',name:'Real Live Contact',version:1};
 const insert=sql.prepare('INSERT INTO account_records(id,kind,payload,version,updated_at) VALUES(?,?,?,?,?)');
 for(const r of [live,realContact])insert.run(r.id,r.kind,JSON.stringify(r),1,'2026-09-01');
 const fetchLive=()=>sql.prepare('SELECT payload FROM account_records ORDER BY id').all(),initial=fetchLive();
 globalThis.practiceFixture={db,actors,initial};const fake=new Map([
 ['next/server','export const NextResponse=Response;'],['cloudflare:workers','export const env={DB:globalThis.practiceFixture.db};'],
 ['@/lib/finance/server','export const allRecords=async()=>Object.values(globalThis.practiceFixture.actors);export const identify=(r,h)=>globalThis.practiceFixture.actors[h.get("test-actor")];export const branch=()=>new Set();export const validate=()=>{throw Error("Unexpected validation")};'],
 ['@/lib/accounts/google','export const connection=()=>{throw Error("Gmail must not be called for training leads")};export const authorize=connection,mailbox=connection,googleFetch=connection,thread=connection,header=connection,messageText=connection;']
 ]);
 await build({entryPoints:{api:'app/api/sales/route.ts',routes:'app/api/sales/routes/route.ts',gmail:'app/api/sales/email/route.ts',practice:'lib/sales/practice.ts'},outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'isolated-auth',setup(b){b.onResolve({filter:/.*/},a=>fake.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fake.get(a.path)}));}}]});
 const [api,routes,gmail,storage]=await Promise.all(['api','routes','gmail','practice'].map(n=>import(pathToFileURL(join(dir,n+'.mjs')).href)));
 const request=(method,actor,body,url='https://test.invalid/api/sales')=>new Request(url,{method,headers:{'test-actor':actor,'content-type':'application/json',origin:'https://test.invalid'},...(body?{body:JSON.stringify(body)}:{})});
 const get=async(actor='rep')=>{const r=await api.GET(request('GET',actor));assert.equal(r.status,200,await r.clone().text());return r.json();};
 const post=(b,who='rep')=>api.POST(request('POST',who,b));
 const ok=async(b,who)=>{const r=await post(b,who);assert.equal(r.status,200,await r.clone().text());return (await r.json()).records;};
 const lead='sales-example:cedar',seed='sales-example:jordan',item=async(id,who)=>{const d=await get(who);return [...d.records,...d.contacts].find(x=>x.id===id);};
 const base=await item(lead);assert.equal(base.readOnly,false);assert((await get()).editable.includes(lead));
 assert(!(await get('view')).editable.includes(lead));assert((await get('rel')).editableRelationships.includes(lead));assert(!(await get('rel')).editable.includes(lead));
 assert.equal((await api.GET(request('GET','outside'))).status,403);
 const save=(v,data)=>({action:'save',record:{id:lead,kind:'opportunity',version:v,...data}});
 assert.equal((await post(save(0,{name:'Unauthorized'}),'view')).status,403);
 assert.equal((await post(save(0,{name:'Unauthorized'}),'rel')).status,403);
 await ok(save(0,{name:'My Own Practice Prospect',address:'Practice Private Road',companyName:'Practice Company',units:290,service:'Full Patrol',stage:'Contract Pending'}));
 assert.equal((await item(lead)).name,'My Own Practice Prospect');assert.equal((await item(lead,'second')).name,base.name);
 assert.equal((await post(save(0,{name:'Stale'}))).status,409);
 assert.equal((await post(save(1,{companyId:'live-company'}))).status,400);
 assert.equal((await post(save(1,{contactId:'real-contact'}))).status,400);
 await ok({action:'followUp',id:lead,version:1,nextAction:'Practice follow-up',dueDate:'2027-03-01'});
 assert.equal((await post({action:'followUp',id:lead,version:2,nextAction:'invalid day',dueDate:'2027-02-30'})).status,400);
 await ok({action:'activity',id:lead,version:2,channel:'Phone call',outcome:'No Answer — Voicemail Left',details:'Practice voicemail',date:'2026-03-02'});
 assert((await get()).records.some(r=>r.example&&r.kind==='salesActivity'&&r.details==='Practice voicemail'));
 assert(!(await get('second')).records.some(r=>r.details==='Practice voicemail'));
 assert.equal((await post({action:'relationship',id:lead,version:3,role:'Other',contactId:'real-contact',startDate:'2026-03-01'})).status,400);
 const made=await ok({action:'relationship',id:lead,version:3,role:'Leasing Agent',name:'Practice Agent',startDate:'2026-03-01',email:'p@example.invalid',phone:'5125550000'}),newContact=made.find(r=>r.kind==='contact'),rel=made.find(r=>r.kind==='salesRelationship');
 assert(newContact.id.startsWith('sales-example:'));assert(rel.id.startsWith('sales-example:'));assert.equal(await item(newContact.id,'second'),undefined);
 await ok({action:'relationship',id:lead,version:4,relationshipId:rel.id,relationshipVersion:rel.version,contactId:newContact.id,decisionMaker:true,role:'Decision Maker',startDate:'2026-03-01'});
 await ok({action:'editContact',contactId:newContact.id,version:1,name:'Updated Practice Agent',email:'updated@example.invalid',phone:'5125550999'});
 assert.equal((await item(rel.id)).name,'Updated Practice Agent');assert.equal((await item(lead)).contactName,'Updated Practice Agent');
 assert.equal((await post({action:'editContact',contactId:newContact.id,version:1,name:'Retry',email:'',phone:''})).status,409);
 assert.equal((await post({action:'editContact',contactId:newContact.id,version:2,name:'Wrong viewer',email:'',phone:''},'second')).status,403);
 await ok({action:'endRelationship',id:lead,version:(await item(lead)).version,relationshipId:rel.id,endDate:'2026-03-02',reason:'Practicing ending a tenure'});
 assert.equal((await item(rel.id)).endReason,'Practicing ending a tenure');
 await ok(save((await item(lead)).version,{stage:'Won'}));assert.equal((await item(lead)).stage,'Won');assert(!(await item(lead)).onboardingAccountId);
 assert.equal((await post({action:'handoff',id:lead,version:(await item(lead)).version})).status,403);
 assert.equal((await post({action:'relationship',id:live.id,version:1,contactId:seed})).status,403);
 const practicePlan={name:'Private edited route',origin:'Start',startDate:'2027-01-01',startTime:'09:00',stops:[{leadId:lead,minutes:30,pauseMinutes:0}]};
 assert.equal((await routes.POST(request('POST','rep',{action:'save',plan:practicePlan}))).status,400);
 const er=await gmail.GET(request('GET','rep',undefined,'https://test.invalid/api/sales/email?lead='+lead));assert.equal(er.status,400);assert.match((await er.json()).error,/practice leads/);
 assert.deepEqual(fetchLive(),initial);assert.equal(sql.prepare('SELECT count(*) n FROM account_audit').get().n,0);
 assert.equal(sql.prepare('SELECT count(*) n FROM sales_practice').get().n,1);
 // Even actions on distinct objects cannot lose an update if their private snapshot races.
 const s1=await storage.readPractice('rep',[]),s2=await storage.readPractice('rep',[]),old=s1.rows.find(r=>r.id===lead),act=s1.rows.find(r=>r.kind==='salesActivity');
 await storage.writePractice([{old:act,next:{...act,details:'winning edit'}}],actors.rep,s1);
 await assert.rejects(storage.writePractice([{old,next:{...old,name:'stale snapshot'}}],actors.rep,s2),/another window/);
 assert.equal((await post({action:'deleteExample',id:lead,version:0})).status,409);
 await ok({action:'deleteExample',id:lead,version:(await item(lead)).version});assert.equal(await item(lead),undefined);assert.equal(await item(newContact.id),undefined);assert(await item(seed));assert(await item(lead,'second'));
 assert.equal((await post(save(0,{name:'Resurrect'}))).status,403);
 const personalRoute=await(await routes.GET(request('GET','rep'))).json();assert(!personalRoute.plans.flatMap(p=>p.plan.stops).some(s=>s.leadId===lead));
 const shared=await item(lead,'rel');await ok({action:'editContact',contactId:seed,version:0,name:'Practice Rename',email:'',phone:''},'rel');assert.equal((await item(lead,'rel')).propertyManager,'Practice Rename');assert.equal((await item(lead,'second')).propertyManager,shared.propertyManager);
 await ok({action:'followUp',id:lead,version:0,nextAction:'',dueDate:''},'sched');
 await ok({action:'followUp',id:live.id,version:1,nextAction:'Real follow-up',dueDate:'2027-03-01'},'sched');
 assert.equal(JSON.parse(sql.prepare('SELECT payload FROM account_records WHERE id=?').get(live.id).payload).nextAction,'Real follow-up');
 assert.equal((await post({action:'followUp',id:live.id,version:2,nextAction:'forbidden',dueDate:'2027-03-02'},'rep')).status,403);
});
