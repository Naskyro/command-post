import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('birthday appearance uses only the authenticated encrypted personnel record',async t=>{
 const db=new DatabaseSync(':memory:'),temp=await mkdtemp(join(tmpdir(),'birthday-boundary-'));
 t.after(async()=>{db.close();delete globalThis.birthdayBoundaryDb;delete globalThis.birthdayBoundaryPeople;delete globalThis.birthdayBoundaryEnv;await rm(temp,{recursive:true,force:true});});
 db.exec('CREATE TABLE hr_records(id TEXT PRIMARY KEY,kind TEXT,person_id TEXT,payload TEXT); CREATE TABLE user_settings(person_id TEXT PRIMARY KEY,theme TEXT NOT NULL,version INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const queries=[];
 globalThis.birthdayBoundaryDb={prepare(sql){const q=db.prepare(sql);return {args:[],bind(...a){this.args=a;return this;},first(){queries.push({sql,args:this.args});return q.get(...this.args);},all(){return {results:q.all(...this.args)};},run(){return {meta:{changes:q.run(...this.args).changes}};}};}};
 globalThis.birthdayBoundaryEnv={HR_DATA_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64')};
 const person=(id,extra={})=>({id,kind:'person',version:1,name:id,email:id+'@example.test',status:'Active',role:'Employee',workerType:'Employee',accessMode:'Custom',access:[],...extra});
 globalThis.birthdayBoundaryPeople=[person('self'),person('other'),person('corrupt'),person('mismatch'),person('deleted'),person('missing'),person('disabled',{accountStatus:'Disabled'}),person('former',{status:'Former'})];
 const fake=new Map([['next/server','export const NextResponse=Response;'],['cloudflare:workers','export const env=globalThis.birthdayBoundaryEnv;'],['@/lib/finance/server',`export {financeIdentity as identifyIdentity} from ${JSON.stringify(resolve('lib/finance/identity.ts'))};import {financeIdentity} from ${JSON.stringify(resolve('lib/finance/identity.ts'))};export const identify=(records,headers)=>financeIdentity(headers,records);export const allRecords=async()=>globalThis.birthdayBoundaryPeople;`],['@/db/finance','export const financeDb=()=>globalThis.birthdayBoundaryDb;export const financeFiles=()=>{throw Error("File access unexpected")};']]);
 await build({entryPoints:{api:'app/api/user-settings/route.ts',hr:'lib/hr/server.ts'},outdir:temp,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(next\/server|cloudflare:workers|@\/lib\/finance\/server|@\/db\/finance)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:fake.get(a.path),resolveDir:process.cwd()}));}}]});
 const api=await import(pathToFileURL(join(temp,'api.mjs')).href),hr=await import(pathToFileURL(join(temp,'hr.mjs')).href);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),ownDob='2000-'+today.slice(5),otherDob=today.slice(5)==='01-01'?'1991-07-01':'1991-01-01';
 const insert=db.prepare('INSERT INTO hr_records(id,kind,person_id,payload) VALUES(?,?,?,?)');
 const seed=async(id,data,extra={})=>{const r={id:'hrpersonal:'+id,kind:'personal',personId:id,data,...extra};insert.run('hrpersonal:'+id,'personal',id,await hr.encode(r));};
 await seed('self',{dateOfBirth:ownDob,homeAddress:'PRIVATE ADDRESS',identityDocumentNumber:'PRIVATE ID'});await seed('other',{dateOfBirth:otherDob});await seed('mismatch',{dateOfBirth:ownDob},{personId:'other'});await seed('deleted',{dateOfBirth:ownDob,deletedAt:'2026-01-01'});insert.run('hrpersonal:corrupt','personal','corrupt','not encrypted');
 const request=(who,body,query='')=>new Request('https://test.invalid/api/user-settings'+query,{method:body?'POST':'GET',headers:{origin:'https://test.invalid','content-type':'application/json',...(who?{'oai-authenticated-user-email':who+'@example.test'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const call=async(who,body,query='')=>{const r=await api[body?'POST':'GET'](request(who,body,query));return {status:r.status,body:await r.json()};};
 await t.test('actual HR storage is ciphertext and self settings never project DOB, age or private personnel fields',async()=>{
  const payload=db.prepare('SELECT payload FROM hr_records WHERE id=?').get('hrpersonal:self').payload;assert.match(payload,/^v1:/);assert.ok(!payload.includes(ownDob));
  const r=await call('self');assert.equal(r.status,200);assert.equal(r.body.birthday.active,true);
  const json=JSON.stringify(r.body);for(const forbidden of [ownDob,otherDob,'dateOfBirth','homeAddress','PRIVATE ADDRESS','PRIVATE ID'])assert.ok(!json.includes(forbidden));
  assert.ok(r.body.availableThemes.some(t=>t.personalOnly));
 });
 await t.test('forged query targets are ignored and each request queries only its own ID and person column',async()=>{
  queries.length=0;const r=await call('other',undefined,'?personId=self');assert.equal(r.status,200);assert.equal(r.body.birthday,undefined);assert.ok(!r.body.availableThemes.some(t=>t.personalOnly));
  const reads=queries.filter(q=>q.sql.includes('hr_records'));assert.equal(reads.length,1);assert.deepEqual(reads[0].args,['hrpersonal:other','other']);assert.match(reads[0].sql,/kind='personal'/);
 });
 await t.test('no authentication, disabled and former identities cannot inspect appearance or birthdays',async()=>{
  for(const who of [undefined,'disabled','former']){queries.length=0;const r=await call(who);assert.equal(r.status,who?403:401);assert.equal(queries.some(q=>q.sql.includes('hr_records')),false);}
 });
 await t.test('cross-user or forged-date birthday actions are rejected before any write',async()=>{
  for(const patch of [{personId:'other'},{dateOfBirth:ownDob},{day:today}]){const r=await call('self',{action:'dismiss-birthday',version:0,...patch});assert.equal(r.status,400);}
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_settings').get().n,0);
  assert.equal((await call('other',{action:'dismiss-birthday',version:0})).status,400);
 });
 await t.test('self dismissal persists without changing the base theme or another person',async()=>{
  const r=await call('self',{action:'dismiss-birthday',version:0});assert.equal(r.status,200);assert.equal(r.body.birthday.active,false);assert.equal(r.body.theme,'command');assert.equal(r.body.birthdayDismissedDay,undefined);assert.equal(r.body.birthdayThemeId,undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_settings WHERE person_id=?').get('other').n,0);
  assert.equal((await call('self')).body.birthday.active,false);
 });
 await t.test('corrupt, deleted, mismatched and missing protected records never guess or expose birthday data',async()=>{
  for(const who of ['corrupt','mismatch','deleted','missing']){const r=await call(who);assert.equal(r.status,200);assert.equal(r.body.birthday,undefined);assert.ok(!r.body.availableThemes.some(t=>t.personalOnly));}
 });
});
