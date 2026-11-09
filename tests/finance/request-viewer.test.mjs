import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('scoped viewers match the full roster and read current records on every court request', async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-viewer-')),db=new DatabaseSync(':memory:');
 t.after(async()=>{delete globalThis.requestViewerFixture;db.close();await rm(dir,{recursive:true,force:true});});
 db.exec('create table finance_records(id text primary key,kind text not null,payload text not null)');
 const queries=[];
 globalThis.requestViewerFixture={prepare(q){queries.push(q);return {all:async()=>({results:db.prepare(q).all()})};}};
 const out=join(dir,'api.mjs');
 await build({entryPoints:['lib/finance/server.ts'],outfile:out,bundle:true,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/db\/finance$/},()=>({path:'db',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const financeDb=()=>globalThis.requestViewerFixture;'}));}}]});
 const {allRecords,identify,requestViewer}=await import(pathToFileURL(out));
 const insert=r=>db.prepare('insert or replace into finance_records values (?,?,?)').run(r.id,r.kind,JSON.stringify(r));
 const standalone=person=>new Headers({'x-command-internal-verified-person':person});
 const read=async fn=>{try{return {ok:true,value:await fn()};}catch(e){return {ok:false,status:e.status,message:e.message};}};
 const parity=async h=>{const full=await read(async()=>identify(await allRecords(),h));const index=queries.length;const fast=await read(()=>requestViewer(h));assert.deepEqual(fast,full);assert.equal(queries.length,index+1);assert.match(queries[index],/WHERE kind IN \('person','department'\)/);return fast;};
 assert.equal((await parity(standalone('jerson'))).value.owner,true); // built-in roster
 const mgr={id:'test-staff',kind:'person',name:'Test Staff',department:'Operations',departmentId:'department-0',role:'Director of Operations',status:'Active',workerType:'Employee',userId:'assigned-user',email:'test@example.invalid',emailAliases:['alias@example.invalid']};
 const dept={id:'department-0',kind:'department',name:'Field Services',aliases:['Operations'],head:mgr.id};
 insert(mgr);insert(dept);
 const native=standalone(mgr.id),sites=new Headers({'oai-authenticated-user-id':'assigned-user','oai-authenticated-user-email':'alias@example.invalid'});
 for(const h of [native,sites]){const {value:v}=await parity(h);assert.equal(v.department,'Field Services');assert.equal(v.role,'Department Head');assert(v.canRelease);assert(v.access.some(g=>g.module==='Compliance, Claims & Recovery'&&g.tab==='hearings'&&g.level==='Edit'));}
 insert({...dept,head:'other-user'});insert({...mgr,accessMode:'Custom',access:[]});
 const revised=(await parity(native)).value;assert.equal(revised.canRelease,false);assert.deepEqual(revised.access,[]);
 insert({...mgr,status:'Former'});for(const h of [native,sites])assert.equal((await parity(h)).status,403);
 insert({...mgr,status:'Onboarding'});assert.equal((await parity(native)).status,403);
 insert({...mgr,accountStatus:'Disabled'});assert.equal((await parity(sites)).status,403);
 insert({...mgr,commandSignInRevoked:true});assert.equal((await parity(native)).status,403);
 assert.equal((await parity(new Headers())).status,401);
 assert.equal((await parity(standalone('unknown'))).status,403);
 // A malformed unrelated transaction is never read or parsed in the scoped request.
 db.prepare('insert into finance_records values (?,?,?)').run('unrelated','transaction','INVALID');
 assert.equal((await requestViewer(standalone('jerson'))).owner,true);
});
