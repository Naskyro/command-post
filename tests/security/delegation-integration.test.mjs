import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Exercise the actual edge policy, worker dispatch, API handlers, identity,
// migrations and projections. Replace only runtime services: router binding,
// authenticated gateway headers, storage and roster. Never opens a remote DB.
test('delegated access: read-only boundary, identity and attributable audit', async t => {
 const sql = new DatabaseSync(':memory:');
 const scratch = await mkdtemp(join(tmpdir(),'command-delegation-test-'));
 const OriginalRequest = globalThis.Request;
 // Cloudflare accepts a ReadableStream body. Undici additionally requires duplex.
 globalThis.Request = class extends OriginalRequest {
  constructor(url, init) {super(url, init?.body instanceof ReadableStream ? {...init, duplex:'half'} : init);}
 };
 t.after(async () => {
  globalThis.Request = OriginalRequest; delete globalThis.commandDelegationFixture;
  sql.close(); await rm(scratch,{recursive:true,force:true});
 });
 for(const f of (await readdir('drizzle')).filter(s=>s.endsWith('.sql')).sort())sql.exec(await readFile(join('drizzle',f),'utf8'));
 const d1={
  prepare(query){const stmt=sql.prepare(query);let binds=[];
   return {bind(...args){binds=args;return this;},first(){return stmt.get(...binds)??null;},all(){return {results:stmt.all(...binds)};},run(){return {meta:{changes:stmt.run(...binds).changes}};}};
  },
  batch(ops){sql.exec('BEGIN');try{const r=ops.map(op=>op.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}
 };
 const week=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const grant=(module,tab,level='View')=>({module,tab,level});
 const person=(id,userId,name,extra={})=>({id,userId,name,email:id+'@example.invalid',kind:'person',version:1,status:'Active',accountStatus:'Enabled',workerType:'Employee',role:'Employee',department:'Dispatch',...extra});
 const operator=person('jerson','gateway-test-operator','Fixture Operator',{role:'Owner'});
 const employee=person('fixture-employee','gateway-test-employee','Fixture Dispatcher',{accessMode:'Custom',access:[grant('Home','home'),grant('Timeclock','Schedule'),grant('Finance','My pay'),grant('People & HR','people')],privateNote:'SECRET-PERSONAL-TEXT'});
 const outsider=person('fixture-other','gateway-test-other','Fixture Colleague');
 const shift=(id,who,department)=>({id,kind:'shift',version:1,person:who,department,status:'Published',start:week+'T08:00',end:week+'T16:00',notes:'SECRET-SHIFT-NOTES'});
 const records=[operator,employee,outsider,shift('shift1',employee.id,'Dispatch'),shift('shift2',outsider.id,'SECRET-OTHER-DEPT')];
 const internal=[];
 globalThis.commandDelegationFixture={d1,records};
 const runtime=new Map([
  ['@/db/finance','export const financeDb=()=>globalThis.commandDelegationFixture.d1;export const financeFiles=()=>{throw Error("Unexpected file access")};'],
  ['@/lib/finance/server','export * from '+JSON.stringify(resolve('lib/finance/server.ts'))+';export const allRecords=async()=>globalThis.commandDelegationFixture.records;export const requestRoster=async()=>globalThis.commandDelegationFixture.records;'],
  ['cloudflare:workers','export const env={};'],
  ['@/lib/home/pulse','export const buildHomePulse=async(v)=>({signals:[{id:"schedule_today",module:"Timeclock",title:"Your shift",description:"Assigned shift details",items:[{title:"Shift for "+v.person}],count:1,score:1,tone:"neutral",target:{module:"Timeclock",tab:"Schedule"}}],learning:null,analytics:null,orderAnalytics:null,workAnalytics:null,businessTrends:{},unavailable:[]});'],
  ['next/server',`export class NextResponse extends Response {static json(body,opts){const res=Response.json(body,opts);res.cookies={set:(k,v)=>res.headers.append('set-cookie',k+'='+v),delete:k=>res.headers.append('set-cookie',k+'=; Max-Age=0')};return res;}}`],
  ['vinext/server/app-router-entry','export default {fetch:(req)=>globalThis.commandDelegationFixture.router(req)};'],
  ['vinext/server/image-optimization','export const DEFAULT_DEVICE_SIZES=[],DEFAULT_IMAGE_SIZES=[];export const handleImageOptimization=()=>{throw Error("Unexpected image route")};'],
 ]);
 await build({entryPoints:{worker:'worker/index.ts',control:'app/api/delegated-access/route.ts',view:'app/api/delegated-access/view/route.ts',session:'app/api/session/route.ts',finance:'app/api/finance/route.ts',people:'app/api/people/route.ts',home:'app/api/home/route.ts'},outdir:scratch,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',plugins:[{name:'isolated-services',setup(b){
  b.onResolve({filter:/^(?:next\/server|@\/db\/finance|@\/lib\/finance\/server|@\/lib\/home\/pulse|cloudflare:workers|vinext\/server\/(?:app-router-entry|image-optimization))$/},a=>({path:a.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:runtime.get(a.path),resolveDir:process.cwd()}));
 }}]});
 const load=name=>import(pathToFileURL(join(scratch,name+'.mjs')).href);
 const [{default:worker},control,view,sessionRoute,financeRoute,peopleRoute,homeRoute]=await Promise.all([load('worker'),load('control'),load('view'),load('session'),load('finance'),load('people'),load('home')]);
 let allowOrdinarySession=false;
 globalThis.commandDelegationFixture.router=async req=>{
  const path=new URL(req.url).pathname;internal.push({path,identity:req.headers.get('oai-authenticated-user-id'),subject:req.headers.get('x-command-internal-delegated-person')});
  if(req.headers.has('x-command-internal-delegated-person'))assert.equal(new URL(req.url).searchParams.has('_command_view'),false,'restriction marker is consumed before the application endpoint');
  req.nextUrl=new URL(req.url);req.cookies={get:()=>undefined};
  if(path==='/people/accident-followups.rsc'){assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('oai-authenticated-user-id'),null);assert.equal(req.headers.get('x-command-internal-delegated-person'),null);assert.equal(req.headers.get('rsc'),'1');return new Response('public shell',{headers:{'Content-Type':req.headers.get('accept')}});}
  if(path==='/api/finance')return financeRoute.GET(req);
  if(path==='/api/people')return peopleRoute.GET(req);
  if(path==='/api/home')return homeRoute.GET(req);
  if(path==='/api/delegated-access')return control[req.method](req);
  if(path==='/api/delegated-access/view')return view.GET(req);
  if(allowOrdinarySession && path==='/api/session'){
   req.nextUrl=new URL(req.url);req.cookies={get:()=>undefined};return sessionRoute[req.method](req);
  }
  assert.fail('Delegate entered ordinary route: '+path);
 };
 const origin='https://command.example.invalid', controlUrl='/api/delegated-access', why='Verify schedule navigation after a role change';
 let workerEnv={COMMAND_AUTH_MODE:'sites'};
 const request=(path,{who=operator,cookie='',signal=false,method='GET',body,headers={}}={})=>{
  const requestHeaders={'oai-authenticated-user-id':who.userId,'oai-authenticated-user-email':who.email,origin,...(cookie?{cookie}:{}),...(signal?{'x-command-read-only':'1'}:{}),...(body?{'content-type':'application/json'}:{}),...headers};
  return worker.fetch(new Request(origin+path,{method,headers:requestHeaders,...(body?{body:JSON.stringify(body)}:{})}),workerEnv, {});
 };
 const call=async(...args)=>{const res=await request(...args);return {status:res.status,headers:res.headers,body:await res.json()};};
 const audit=()=>sql.prepare("SELECT * FROM finance_audit ORDER BY rowid").all();
 const start={action:'start',person:employee.id,reason:why};
 assert.equal((await call(controlUrl,{who:outsider,method:'POST',body:start})).status,403);
 assert.equal((await call(controlUrl,{method:'POST',body:start,headers:{origin:'https://other.example.invalid'}})).status,403);
 assert.equal(audit().length,0);
 const entered=await call(controlUrl,{method:'POST',body:start});
 assert.equal(entered.status,200,JSON.stringify(entered.body));assert.equal(entered.body.session.subjectId,employee.id);
 const issued=entered.headers.get('set-cookie');
 for(const attr of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(issued?.includes(attr));
 const cookie=issued.split(';')[0],raw=cookie.slice(cookie.indexOf('=')+1);
 assert.equal(raw.length,64);
 const session=sql.prepare('SELECT * FROM delegated_sessions').get();
 assert.equal(session.token_hash,createHash('sha256').update(raw).digest('hex'));
 assert.equal(Date.parse(session.expires_at)-Date.parse(session.started_at),15*60000);
 // A second browser/tab without the marker cannot silently supersede a live session.
 assert.equal((await call(controlUrl,{method:'POST',body:start})).status,409);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM delegated_sessions').get().n,1);
 const first=audit()[0];assert.equal(first.actor,operator.name);assert.equal(first.actor_id,operator.userId);assert.equal(JSON.parse(first.after).reason,why);
 const shared={cookie,signal:true};
 const identity=await call('/api/session',shared);
 assert.equal(identity.status,200);assert.equal(identity.body.delegation.actorName,operator.name);assert.equal(identity.body.viewer.person,employee.id);assert.equal(identity.body.viewer.owner,false);assert.notEqual(identity.body.viewer.id,employee.userId);assert.equal(identity.body.viewer.delegatedReadOnly,true);assert.match(identity.body.viewer.id,/^delegated:/);
 assert.equal(identity.headers.get('set-cookie'),null);assert.equal(audit().length,1);
 const schedule=await call('/api/delegated-access/workspace?module=Timeclock&tab=Schedule',shared);
 assert.equal(schedule.status,200,JSON.stringify(schedule.body));assert.equal(schedule.body.protected,false);assert.equal(schedule.body.rows.length,1);assert.ok(schedule.body.rows[0].includes('Dispatch'));
 const home=await call('/api/home',shared);assert.equal(home.status,200,JSON.stringify(home.body));assert.equal(home.body.viewer.person,employee.id);
 assert.ok(Array.isArray(home.body.pulse.signals));assert.equal(home.body.pulse.signals[0].items[0].title,'Shift for '+employee.id);
 const finance=await call('/api/finance?surface=timeclock&_command_view=1',shared);assert.equal(finance.status,200,JSON.stringify(finance.body));assert.equal(finance.body.viewer.person,employee.id);assert.equal(finance.body.viewer.owner,false);assert.equal(finance.body.viewer.delegatedReadOnly,true);assert.ok(finance.body.records.some(r=>r.id==='shift1'));assert.equal(finance.body.records.find(r=>r.id==='shift1').notes,'SECRET-SHIFT-NOTES','authorized details should be visible rather than replaced by aggregates');assert.ok(!finance.body.records.some(r=>r.id==='shift2'));
 const people=await call('/api/people',shared);assert.equal(people.status,200,JSON.stringify(people.body));assert.deepEqual(people.body.records.filter(r=>r.kind==='person').map(r=>r.id),[employee.id]);
 assert.equal((await call('/api/people?surface=admin',shared)).status,403,'subject permissions must deny an Admin route even though the actor is Owner');
 const forgedRead=await call('/api/people',{...shared,headers:{'x-command-internal-delegated-person':operator.id,'x-command-internal-delegated-session':crypto.randomUUID(),'x-command-internal-delegated-actor':operator.id,'x-middleware-rewrite':'/api/admin/users'}});assert.equal(forgedRead.status,200);assert.equal(forgedRead.body.viewer.person,employee.id,'forged internal identity must be stripped');
 assert.ok(internal.filter(c=>['/api/home','/api/finance','/api/people'].includes(c.path)).every(c=>c.subject===employee.id));
 const readAudits=audit();assert.equal(readAudits.length,6);assert.ok(readAudits.slice(1).every(r=>JSON.parse(r.after).event.startsWith('Read requested /api/')));
 for(const data of [identity.body,home.body,schedule.body])assert.doesNotMatch(JSON.stringify(data),/SECRET-|gateway-test-employee/);
 const readCount=internal.length;
 for(const [path,method,body] of [['/api/future','GET'],['/api/accounts/google/callback?code=secret','GET'],['/api/delegated-access/view?surface=/api/home','GET'],['/api/school/media/stage','GET'],['/api/session','POST',{action:'signOut'}],['/api/home','POST',{action:'save-dashboard',preferences:{},version:0}],['/api/admin/activity','DELETE'],['/api/hr/bank','POST',{action:'replace'}]]){
  const r=await call(path,{...shared,method,body});assert.equal(r.status,403,method+' '+path);
 }
 assert.equal(internal.length,readCount,'unapproved reads and writes must be rejected at the outer worker boundary');
 assert.ok(internal.every(c=>c.identity===operator.userId||c.path===controlUrl));
 const shell=await request('/people/accident-followups.rsc?_command_view=1',{...shared,headers:{Accept:'text/x-component',RSC:'1'}});assert.equal(shell.status,200);assert.equal(shell.headers.get('Content-Type'),'text/x-component');assert.equal(shell.headers.get('Cache-Control'),'private, no-store');
 assert.equal((await call('/api/session',{...shared,who:outsider})).status,403);
 assert.equal(audit().length,readAudits.length,'blocked writes or foreign actors cannot create employee login events');
 const finished=await call(controlUrl,{...shared,method:'POST',body:{action:'end'}});
 assert.equal(finished.status,200);assert.match(finished.headers.get('set-cookie'),/Max-Age=0/);
 // Simulate the second tab: either still holding the older marker, or no cookie
 // because another tab cleared it. Neither path may upgrade back to operator.
 for(const old of [{cookie,signal:true},{signal:true}]) {
  assert.equal((await call('/api/session',old)).status,403);assert.equal((await call('/api/home',old)).status,403);
  assert.equal((await call('/api/hr/concerns',old)).status,403);
  assert.equal((await call('/api/home',{...old,method:'POST',body:{action:'save-dashboard'}})).status,403);
 }
 for(const path of ['/api/session?_command_view=1','/api/finance?_command_view=1','/api/people?_command_view=1'])assert.equal((await call(path)).status,403,'a stale new-tab/document URL cannot fall back to the operator');
 await call(controlUrl,{...shared,method:'POST',body:{action:'end',actor:'Forged Actor',reason:'Replace original justification'}});
 const rows=audit();assert.equal(rows.length,readAudits.length+1,'one start, attributable reads and one end; no duplicate exit or employee login');
 assert.deepEqual(rows[0],first);assert.ok(rows.every(r=>r.actor===operator.name&&r.actor_id===operator.userId&&r.record_id===first.record_id));
 assert.equal(JSON.parse(rows[0].after).event,'Started');assert.equal(JSON.parse(rows.at(-1).after).event,'Returned to Admin');
 for(const row of rows){const payload=JSON.parse(row.after);assert.equal(payload.actorPerson,operator.id);assert.equal(payload.subjectPerson,employee.id);assert.equal(payload.reason,why);assert.ok(row.at);}
 assert.equal(sql.prepare('SELECT end_reason FROM delegated_sessions').get().end_reason,'Returned to Admin');
 for(const r of rows){
  assert.throws(()=>sql.prepare('UPDATE finance_audit SET actor=?,reason=? WHERE id=?').run('spoofed','altered',r.id),/append.only/i);
  assert.throws(()=>sql.prepare('DELETE FROM finance_audit WHERE id=?').run(r.id),/append.only/i);
  assert.throws(()=>sql.prepare('INSERT OR REPLACE INTO finance_audit (id,record_id,actor,actor_id,at,reason,after) VALUES(?,?,?,?,?,?,?)').run(r.id,'benign','fake','fake',r.at,'altered','{}'),/append.only/i);
 }
 assert.deepEqual(audit(),rows);
 const normalForged=await call('/api/people',{who:employee,headers:{'x-command-internal-delegated-person':operator.id,'x-command-internal-delegated-session':crypto.randomUUID(),'x-command-internal-delegated-actor':operator.id}});assert.equal(normalForged.status,200);assert.equal(normalForged.body.viewer.person,employee.id);assert.equal(normalForged.body.viewer.delegatedReadOnly,undefined);assert.equal(audit().length,rows.length);

 // On the managed host an independently authenticated, linked person with
 // disabled operational access can still reach the personal reporting surface.
 // This exception does not grant a viewer, set a session cookie or log a login.
 allowOrdinarySession=true;
 employee.accountStatus='Disabled';
 const hostedDenied=await call('/api/session',{who:employee});
 assert.equal(hostedDenied.status,403);assert.equal(hostedDenied.body.reportingOnly,true);
 assert.equal(hostedDenied.body.viewer,undefined);assert.equal(hostedDenied.headers.get('set-cookie'),null);
 assert.equal(audit().length,rows.length);
 employee.accountStatus='Enabled';

 // Run the actual worker, session API and delegation routes again through the
 // independent gateway contract. Spoofed hosted identities have no authority.
 const key='fixture-upstream-key-at-least-32-bytes-7288920';
 workerEnv={COMMAND_AUTH_MODE:'standalone',COMMAND_AUTH_GATEWAY_SECRET:key};
 const asStandalone=person=>({'x-command-gateway-key':key,'x-command-person-id':person.id});
 const signedIn=await call('/api/session',{headers:asStandalone(employee)});
 assert.equal(signedIn.status,200,JSON.stringify(signedIn.body));assert.equal(signedIn.body.viewer.id,'command-roster:'+employee.id);
 assert.equal(signedIn.body.viewer.person,employee.id);assert.equal(signedIn.body.viewer.owner,false);
 // A revoked independent Command credential must fail closed, even during
 // outbox delivery when the gateway may still forward a cached session.
 const beforeRevocation=audit().length;
 for(const [field,value] of [['accountStatus','Disabled'],['status','Former'],['commandSignInRevoked',true]]){
  const previous=employee[field];employee[field]=value;
  const denied=await call('/api/session',{headers:asStandalone(employee)});
  assert.equal(denied.status,403);assert.equal(denied.body.reportingOnly,undefined);
  assert.equal(denied.body.viewer,undefined);assert.equal(denied.body.signInUrl,'/auth/login');
  assert.equal(denied.headers.get('set-cookie'),null);assert.equal(audit().length,beforeRevocation);
  if(previous===undefined)delete employee[field];else employee[field]=previous;
 }
 const forged=await call('/api/session',{headers:{...asStandalone(employee),'x-command-gateway-key':'spoof'}});
 assert.equal(forged.status,401);
 const standaloneStart=await call(controlUrl,{headers:asStandalone(operator),method:'POST',body:start});
 assert.equal(standaloneStart.status,200);const marker=standaloneStart.headers.get('set-cookie').split(';')[0];
 const sview=await call('/api/session',{...shared,cookie:marker,headers:asStandalone(operator)});
 assert.equal(sview.status,200);assert.equal(sview.body.viewer.person,employee.id);
 assert.equal((await call('/api/session',{...shared,cookie:marker,headers:asStandalone(outsider)})).status,403);
 assert.equal((await call(controlUrl,{...shared,cookie:marker,headers:asStandalone(operator),method:'POST',body:{action:'end'}})).status,200);
 assert.ok(audit().slice(-2).every(a=>a.actor_id==='command-roster:'+operator.id));
 const logout=await call('/api/session',{headers:asStandalone(employee),method:'POST',body:{}});
 assert.equal(logout.body.redirect,'/auth/logout');
 const switchResponse=await request('/command-access/sign-out',{headers:asStandalone(employee)});
 assert.equal(switchResponse.headers.get('location'),'/auth/logout');

 // Current permissions, account revocation and expiry are rechecked per read.
 const fresh=await call(controlUrl,{headers:asStandalone(operator),method:'POST',body:start});assert.equal(fresh.status,200);const freshCookie=fresh.headers.get('set-cookie').split(';')[0],freshArgs={cookie:freshCookie,signal:true,headers:asStandalone(operator)};
 const beforeAccess=employee.access;employee.access=employee.access.filter(g=>!['Finance','Timeclock'].includes(g.module));assert.equal((await call('/api/finance',freshArgs)).status,403);employee.access=beforeAccess;
 employee.commandSignInRevoked=true;const routeCount=internal.length;assert.equal((await call('/api/finance',freshArgs)).status,403);assert.equal(internal.length,routeCount);delete employee.commandSignInRevoked;
 await call(controlUrl,{...freshArgs,method:'POST',body:{action:'end'}});
 const expiring=await call(controlUrl,{headers:asStandalone(operator),method:'POST',body:start});assert.equal(expiring.status,200);const expiryCookie=expiring.headers.get('set-cookie').split(';')[0];sql.prepare('UPDATE delegated_sessions SET expires_at=? WHERE ended_at IS NULL').run(new Date(Date.now()-1000).toISOString());
 const expiredCount=internal.length;assert.equal((await call('/api/finance',{cookie:expiryCookie,signal:true,headers:asStandalone(operator)})).status,403);assert.equal(internal.length,expiredCount);assert.equal(JSON.parse(audit().at(-1).after).event,'Expired');
});
