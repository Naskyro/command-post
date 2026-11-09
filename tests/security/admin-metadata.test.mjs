import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('dedicated Admin data cannot bypass its permissions through generic record routes',async t=>{
 const db=new DatabaseSync(':memory:'),temp=await mkdtemp(join(tmpdir(),'admin-boundary-'));
 t.after(async()=>{db.close();delete globalThis.boundaryDb;delete globalThis.boundaryPeople;delete globalThis.boundaryRecords;await rm(temp,{recursive:true,force:true});});
 for(const f of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile('drizzle/'+f,'utf8'));
 globalThis.boundaryDb={prepare(sql){const q=db.prepare(sql);return {args:[],bind(...a){this.args=a;return this;},first(){return q.get(...this.args);},all(){return {results:q.all(...this.args)};},run(){return {meta:{changes:q.run(...this.args).changes}};}};},batch(ops){db.exec('BEGIN');try{const r=ops.map(o=>o.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const person=(id,more={})=>({id,kind:'person',version:1,name:id,email:id+'@example.test',role:'Employee',workerType:'Employee',status:'Active',accountStatus:'Enabled',accessMode:'Custom',access:[{module:'Finance',tab:'My pay',level:'View'}],...more});
 const grant=(module,tab,level='Edit')=>({module,tab,level});
 globalThis.boundaryPeople=[person('jerson',{role:'Owner'}),person('delegated',{access:[grant('Admin','users')]}),person('one'),person('disabled',{accountStatus:'Disabled'}),person('former',{status:'Former'})];
 const records=[
  {id:'secret-ann',kind:'siteAnnouncement',version:1,title:'Unreleased Plan',body:'Private draft',status:'Draft',contentRevision:1,requiresAcknowledgment:true,createdAt:'2026-11-01T10:00:00Z',updatedAt:'2026-11-01T10:00:00Z',recipientIds:['one']},
  {id:'secret-ack',kind:'announcementReceipt',version:1,announcementId:'secret-ann',personId:'one',contentRevision:1,acknowledgedAt:'2026-11-01T10:00:00Z'},
  {id:'secret-theme',kind:'siteTheme',version:1,status:'Archived',themeId:'winter',reason:'Internal decision'},
  {id:'secret-template',kind:'accessTemplate',version:1,name:'Restricted Executive Set',description:'Private',status:'Active',access:[grant('Finance','Settings')],hrResponsibilities:[]},
 ];
 const insert=db.prepare('INSERT INTO finance_records (id,kind,payload,version,updated_by,updated_at) VALUES (?,?,?,?,?,?)');for(const r of records)insert.run(r.id,r.kind,JSON.stringify(r),r.version,'fixture','2026-11-01T10:00:00Z');
 globalThis.boundaryRecords=()=>[...globalThis.boundaryPeople,...db.prepare('SELECT payload FROM finance_records').all().map(x=>JSON.parse(x.payload))];
 const fake=new Map([['cloudflare:workers','export const env={};'],['next/server','export const NextResponse=Response;'],['@/lib/finance/server',`export {persist,identify,visible,validate,runSnapshot} from ${JSON.stringify(resolve('lib/finance/server.ts'))};export const allRecords=async()=>globalThis.boundaryRecords();`],['@/db/finance','export const financeDb=()=>globalThis.boundaryDb;export const financeFiles=()=>{throw Error("File access unexpected")};']]);
 await build({entryPoints:{finance:'app/api/finance/route.ts',templates:'app/api/admin/access-templates/route.ts',announcements:'app/api/site-announcements/route.ts',themes:'app/api/site-themes/route.ts',settings:'app/api/user-settings/route.ts'},outdir:temp,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(next\/server|cloudflare:workers|@\/lib\/finance\/server|@\/db\/finance)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:fake.get(a.path),resolveDir:process.cwd()}));}}]});
 const apis={};for(const name of ['finance','templates','announcements','themes','settings'])apis[name]=await import(pathToFileURL(join(temp,name+'.mjs')).href);
 const request=(name,who,body,query='')=>{const r=new Request('https://test.invalid/api/'+name+query,{method:body?'POST':'GET',headers:{origin:'https://test.invalid','content-type':'application/json','oai-authenticated-user-email':who+'@example.test'},...(body?{body:JSON.stringify(body)}:{})});r.nextUrl=new URL(r.url);return r;};
 const call=async(name,who,body,query='')=>{const r=await apis[name][body?'POST':'GET'](request(name,who,body,query));return {status:r.status,body:await r.json()};};
 const stored=id=>JSON.parse(db.prepare('SELECT payload FROM finance_records WHERE id=?').get(id).payload);
 await t.test('owner and ordinary finance projections omit drafts, receipts, theme schedules and access templates',async()=>{for(const who of ['jerson','one']){const r=await call('finance',who);assert.equal(r.status,200);for(const secret of records)assert.ok(!r.body.records.some(x=>x.id===secret.id),secret.kind+' leaked');}});
 await t.test('generic mutations cannot modify or disguise Admin metadata even for an owner',async()=>{for(const old of records){for(const payload of [{...old,title:'Forged'}, {id:old.id,kind:'expense',version:1,person:'jerson',status:'Draft',amount:1}]){const r=await call('finance','jerson',{record:payload,reason:'Test bypass'});assert.notEqual(r.status,200);assert.deepEqual(stored(old.id),old);}}});
 await t.test('special payroll action cannot overwrite a different record kind',async()=>{const r=await call('finance','jerson',{action:'reviewPayroll',id:'secret-ann',version:1});assert.notEqual(r.status,200);assert.match(r.body.error,/payroll run/);assert.equal(stored('secret-ann').kind,'siteAnnouncement');});
 await t.test('generic finance history cannot expose private Admin records',async()=>{for(const old of records){const r=await call('finance','jerson',undefined,'?history='+old.id);assert.equal(r.status,403);}});
 await t.test('delegated template editor cannot replace a restricted template with their own weaker grants',async()=>{const before=stored('secret-template');const r=await call('templates','delegated',{action:'save',reason:'Attempt unauthorized rewrite',template:{...before,name:'Overwritten',access:[grant('Admin','users')],hrResponsibilities:[]}});assert.equal(r.status,403);assert.deepEqual(stored('secret-template'),before);});
 await t.test('disabled and separated accounts cannot access any new or generic authenticated surface',async()=>{for(const who of ['disabled','former'])for(const api of Object.keys(apis)){const r=await call(api,who);assert.equal(r.status,403,api+' accepted '+who);}});
 await t.test('a caller cannot supply another user as the target of appearance settings',async()=>{const r=await call('settings','one',{theme:'command-post',version:0,personId:'jerson'});assert.notEqual(r.status,200);assert.equal(db.prepare("SELECT COUNT(*) n FROM user_settings WHERE person_id='jerson'").get().n,0);});
});
