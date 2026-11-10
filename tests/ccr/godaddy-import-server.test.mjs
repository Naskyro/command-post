import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('GoDaddy reviewed import authenticates, previews conflicts, binds directory choices and writes audited encrypted editions idempotently',async t=>{
 const sql=new DatabaseSync(':memory:'),tmp=await mkdtemp(join(tmpdir(),'ccr-godaddy-'));
 t.after(async()=>{sql.close();delete globalThis.goDaddyImportFixture;await rm(tmp,{recursive:true,force:true});});
 let dbCalls=0;
 const db={prepare(statement){dbCalls++;const query=sql.prepare(statement);let values=[];return {bind(...v){values=v;return this;},async first(){return query.get(...values)||null;},async all(){return {results:query.all(...values)};},async run(){return {meta:{changes:query.run(...values).changes}};}};}};
 const grant=level=>({module:'Compliance, Claims & Recovery',tab:'recovery',level});
 const baseViewer={id:'signed-in-lead',person:'lead',name:'Import Reviewer',email:'reviewer@example.test',role:'Department Head',department:'Operations',owner:false,canManage:false,canRelease:false,access:[grant('Edit')]};
 const viewers={lead:baseViewer,employee:{...baseViewer,id:'employee-session',person:'employee',role:'Employee'},reader:{...baseViewer,id:'reader-session',person:'reader',access:[grant('View')]},blocked:{...baseViewer,id:'blocked-session',person:'blocked',access:[]},delegated:{...baseViewer,id:'delegated-session',delegatedReadOnly:true},onboarding:{...baseViewer,onboardingOnly:true}};
 const staff=Object.values(viewers).filter((v,i,list)=>list.findIndex(x=>x.person===v.person)===i).map(v=>({id:v.person,kind:'person',version:1,name:v.name,status:'Active',role:v.role,accessMode:'Custom',access:v.access}));
 const accounts=[{id:'account-1',kind:'account',name:'Example Property',status:'Active',address:'100 Example Road'},{id:'account-2',kind:'account',name:'Same Name Property',status:'Active'},{id:'account-3',kind:'account',name:'Same Name Property',status:'Former'}];
 globalThis.goDaddyImportFixture={db,staff,viewers,accounts,key:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 const fixtures=new Map([
  ['@/db/finance','export const financeDb=()=>globalThis.goDaddyImportFixture.db,financeFiles=()=>{throw Error("No evidence files should be written by this import")};'],
  ['@/lib/accounts/server','export const claimChoiceRows=async()=>globalThis.goDaddyImportFixture.accounts;'],
  ['cloudflare:workers','export const env={get HR_DATA_ENCRYPTION_KEY(){return globalThis.goDaddyImportFixture.key}};'],
  ['@/lib/finance/server','export const allRecords=async()=>globalThis.goDaddyImportFixture.staff,requestRoster=allRecords;export const identify=(_,headers)=>{const viewer=globalThis.goDaddyImportFixture.viewers[headers.get("x-test-viewer")];if(!viewer)throw Object.assign(new Error("Sign in"),{status:401});return viewer;};'],
  ['next/server','export const NextResponse={json:Response.json};'],
 ]);
 await build({entryPoints:{importer:'app/api/ccr/register/import-godaddy/route.ts',register:'app/api/ccr/register/route.ts',server:'lib/ccr/register-server.ts'},outdir:tmp,bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'godaddy-fixture',setup(builder){builder.onResolve({filter:/.*/},args=>fixtures.has(args.path)?{path:args.path,namespace:'fixture'}:undefined);builder.onLoad({namespace:'fixture',filter:/.*/},args=>({contents:fixtures.get(args.path)}));}}]});
 const [importer,register,server]=await Promise.all(['importer','register','server'].map(name=>import(pathToFileURL(join(tmp,name+'.mjs')).href)));
 const request=(actor,body,{origin='https://fixture.invalid',site='same-origin'}={})=>{
  const url=new URL('https://fixture.invalid/api/ccr/register/import-godaddy');
  const req=new Request(url,{method:'POST',headers:{'content-type':'application/json','x-test-viewer':actor,'sec-fetch-site':site,...(origin?{origin}:{})},body:JSON.stringify(body)});
  Object.defineProperty(req,'nextUrl',{value:url});return req;
 };
 const call=(body,actor='lead',options)=>importer.POST(request(actor,body,options));
 const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 const csv=rows=>{const columns=[...new Set(rows.flatMap(Object.keys))];return columns.map(quote).join(',')+'\n'+rows.map(row=>columns.map(k=>quote(row[k])).join(',')).join('\n');};
 const original={transactionId:'ab1234cd',disputeId:'dc4321ba',transactionDay:'2026-02-04',transactionTime:'18:08',transactionZone:'',originalTransactionCents:'33111',disputedAmountCents:'33111',cardBrand:'Visa',cardLast4:'0923',rawStatus:'LOST',customerName:'Jamie Example',accountName:'Example Property',propertyAddress:'100 Example Road',stockNumber:'STOCK-1',towbookCallNumber:'CALL-1',customerCollectionStage:'Not Started',responseDeadlineDay:'2026-05-23',responseDeadlineTime:'19:00',responseDeadlineZone:'',sourceNotes:'Reviewed release record; signed language has a marked correction.'};
 const second={...original,transactionId:'tx-2',disputeId:'dispute-2',customerName:'',accountName:'Same Name Property',propertyAddress:'200 Source Address'};
 const text=csv([original,second]),base={csv:text,filename:'reviewed.csv'};

 for(const actor of ['employee','reader','blocked','delegated','onboarding'])assert.equal((await call({...base,action:'preview'},actor)).status,403);
 assert.equal((await call({...base,action:'preview'},'absent')).status,401);
 assert.equal((await call({...base,action:'preview'},'lead',{origin:'https://other.invalid'})).status,403);
 assert.equal((await call({...base,action:'preview'},'lead',{origin:''})).status,403);
 assert.equal((await call({...base,action:'preview'},'lead',{site:'cross-site'})).status,403);
 assert.equal(dbCalls,0,'access and origin checks happen before private case or directory reads');

 let response=await call({...base,action:'preview'});assert.equal(response.status,200,await response.clone().text());assert.match(response.headers.get('cache-control'),/private, no-store/);const preview=await response.json();
 assert.equal(preview.cases.length,2);assert.equal(preview.cases[0].accountName,'Example Property');assert.equal(preview.cases[1].accountName,'');assert.match(preview.cases[1].warnings.join(' '),/more than one directory account/);
 assert.equal(preview.cases[0].transactionTime,'18:08');assert.equal(preview.cases[0].transactionZone,'');assert.equal(preview.cases[0].deadlineTime,'19:00');assert.equal(preview.cases[0].deadlineZone,'');
 const apply={...base,action:'import',digest:preview.digest,keys:[preview.cases[0].key]};
 assert.equal((await call({...apply,digest:'stale'})).status,409);assert.equal((await call({...apply,filename:'different.csv'})).status,409);assert.equal((await call({...apply,keys:['not-reviewed']})).status,400);assert.equal((await call({...apply,keys:[preview.cases[0].key,preview.cases[0].key]})).status,400);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM ccr_register_versions').get().n,0);
 response=await call({...apply,ownerId:'forged',updatedBy:'forged',history:[{by:'forged'}]});assert.equal(response.status,200,await response.clone().text());const created=await response.json();assert.equal(created.created.length,1);
 let rows=(await server.getRegister(viewers.lead,'recovery',staff)).rows;let saved=rows.find(row=>row.id===created.created[0].id);
 assert.equal(saved.version,1);assert.equal(saved.ownerId,'lead');assert.equal(saved.createdBy,'Import Reviewer');assert.equal(saved.history[0].by,'Import Reviewer');assert.match(saved.history[0].note,/Reviewed CSV SHA-256: [a-f\d]{64}/);
 assert.equal(saved.chargeback.details.accountId,'account-1');assert.equal(saved.chargeback.details.accountName,'Example Property');assert.equal(saved.chargeback.details.towbookCallNumber,'CALL-1');assert.equal(saved.chargeback.deadlineTime,'19:00');assert.equal(saved.chargeback.zone,'');
 assert.equal(saved.chargeback.decision,'Cardholder Prevailed');assert.equal(saved.chargeback.mail,'Not Started');assert.equal(saved.chargeback.reply,'Not Yet Verified');assert.deepEqual(saved.chargeback.entries,[]);assert.deepEqual(saved.files,[]);assert.deepEqual(saved.steps,[]);
 assert.doesNotMatch(sql.prepare('SELECT payload FROM ccr_register_versions').get().payload,/Jamie Example|signed language|100 Example Road/);

 // A repeated source must preserve subsequent staff edits and versions.
 response=await register.POST(request('lead',{...saved,title:'Staff-reviewed title',note:'Reviewed case title'}));assert.equal(response.status,200,await response.clone().text());saved=await response.json();assert.equal(saved.version,2);
 response=await call(apply);assert.equal(response.status,200,await response.clone().text());let result=await response.json();assert.equal(result.created.length,0);assert.equal(result.skipped.length,1);assert.equal(result.skipped[0].title,'Staff-reviewed title');assert.equal(sql.prepare('SELECT COUNT(*) n FROM ccr_register_versions').get().n,2);

 // Review decisions about account linking are part of the digest.
 accounts[0].name='Renamed Property';assert.equal((await call({...apply,keys:[preview.cases[1].key]})).status,409);accounts[0].name='Example Property';
 response=await call({...apply,keys:[preview.cases[1].key]});assert.equal(response.status,200,await response.clone().text());result=await response.json();assert.equal(result.created.length,1);
 const unlinked=(await server.getRegister(viewers.lead,'recovery',staff)).rows.find(row=>row.id===result.created[0].id);assert.equal(unlinked.chargeback.details.accountId,'');assert.equal(unlinked.chargeback.details.accountName,'');assert.equal(unlinked.chargeback.details.propertyAddress,'200 Source Address');assert.match(unlinked.chargeback.sourceNotes,/Same Name Property/);

 // Contradictory card/name facts cannot silently pass as a duplicate.
 response=await call({action:'preview',csv:csv([{...original,cardLast4:'0001'}])});assert.equal(response.status,200);assert.match((await response.json()).cases[0].conflict,/different card ending/);
 response=await call({action:'preview',csv:csv([{...original,customerName:'Different Person'}])});assert.equal(response.status,200);assert.match((await response.json()).cases[0].conflict,/different customer name/);

 // A manually duplicated source identity blocks only that preview row. Selecting
 // it together with a clean row rejects the commit before any writes occur.
 const duplicate={...saved,id:undefined,version:0,title:'Manual duplicate',chargeback:{...saved.chargeback,details:{...saved.chargeback.details,disputeId:'different-dispute'}},note:'Manual duplicate fixture'};
 response=await register.POST(request('lead',duplicate));assert.equal(response.status,200,await response.clone().text());
 const third={...original,transactionId:'tx-3',disputeId:'dispute-3',customerName:'',accountName:''};
 const conflictCsv=csv([original,third]);response=await call({action:'preview',csv:conflictCsv});assert.equal(response.status,200);const conflictPreview=await response.json();assert.match(conflictPreview.cases[0].conflict,/More than one existing case/);assert.equal(conflictPreview.cases[1].conflict,'');
 const before=sql.prepare('SELECT COUNT(*) n FROM ccr_register_versions').get().n;
 const conflictApply={action:'import',csv:conflictCsv,digest:conflictPreview.digest,keys:conflictPreview.cases.map(c=>c.key)};
 assert.equal((await call(conflictApply)).status,409);assert.equal(sql.prepare('SELECT COUNT(*) n FROM ccr_register_versions').get().n,before);
 response=await call({...conflictApply,keys:[conflictPreview.cases[1].key]});assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).created.length,1);

 // Concurrent retries resolve through the versioned deterministic source ID.
 const fourth={...original,transactionId:'tx-4',disputeId:'dispute-4',customerName:'',accountName:''};const fourthCsv=csv([fourth]);response=await call({action:'preview',csv:fourthCsv});const fourthPreview=await response.json();
 const concurrent={action:'import',csv:fourthCsv,digest:fourthPreview.digest,keys:[fourthPreview.cases[0].key]};
 const responses=await Promise.all([call(concurrent),call(concurrent)]);for(const res of responses)assert.equal(res.status,200,await res.clone().text());const results=await Promise.all(responses.map(res=>res.json()));assert.equal(results.reduce((n,r)=>n+r.created.length,0),1);assert.equal(results.reduce((n,r)=>n+r.skipped.length,0),1);
});
