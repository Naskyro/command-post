import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {buildPortfolioReport} from '../../lib/accounts/portfolio-reports-engine.ts';
import {definitions} from '../../lib/accounts/portfolio-reports-catalog.ts';
const rec=(kind,id,extras={})=>({kind,id,name:id,version:1,...extras}),a=(id,extra={})=>rec('account',id,{status:'Active',service:'Full Patrol',propertyType:'Residential',units:100,assignee:'a',...extra}),sub=(kind,id,extra={})=>rec(kind,id,{accountId:'A',...extra});
const ac=[a('A',{companyId:'co',visitorSection:'Yes',sourceOpportunityId:'won'}),a('B',{companyId:'co',visitorSection:'No'}),a('C',{status:'Paused'}),a('training',{example:true})];
const records=[sub('financial','cost',{type:'Repair',status:'Recorded',amount:18.77,date:'2026-09-08'}),sub('financial','void',{type:'Repair',status:'Voided',amount:555,date:'2026-09-08'}),sub('activity','onsite',{channel:'Onsite visit',date:'2026-09-30'}),sub('activity','scheduled',{channel:'Onsite visit',response:'Scheduled',date:'2026-10-01'}),sub('activity','call',{channel:'Phone call',date:'2026-09-16'}),sub('workOrder','done',{type:'Restriping',status:'Completed',completedAt:'2026-10-01T02:00:00Z',actualCost:18.77}),sub('workOrder','uncertain',{status:'Completed',dueDate:'2026-09-30'}),sub('workOrder','next',{status:'New',dueDate:'2026-09-30'}),sub('trespass','CTW',{incidentDate:'2026-09-08',warningStatus:'Requested but not issued',name:'SECRET SUBJECT'}),sub('claim','claim',{date:'2026-09-16',incidentDate:'2026-08-29',paidDate:'2026-10-01',status:'Paid',paidAmount:18.77,claimant:'DO NOT DISCLOSE'}),sub('courtesy','rel',{date:'2026-09-16',status:'Released',releaseType:'Full courtesy',amountWaived:18.77}),sub('courtesy','unpriced',{date:'2026-09-16',status:'Imported',releaseType:'Reduced charge'}),sub('courtesy','declined',{date:'2026-09-16',status:'Declined',releaseType:'Full courtesy'}),rec('company','co',{name:'Group'}),rec('contact','p',{name:'Manager',businessTopics:['Monthly Reports'],preferences:'SECRET LIKING',interests:'PRIVATE INTEREST',preferredChannel:'Email'}),sub('affiliation','tenure',{role:'Property Manager',contactId:'p',startDate:'2024-01-01'}),sub('affiliation','past',{role:'Property Manager',contactId:'p',accountId:'B',endDate:'2026-05-01'}),rec('opportunity','won',{stage:'Won',currentProvider:'Other Towing',onboardingAccountId:'A',handoffDate:'2026-09-03'}),rec('opportunity','fake',{stage:'Won',currentProvider:'Wrong',onboardingAccountId:'A',handoffDate:'2026-09-03'})];
const payments=[{accountId:'A',cents:10000,paymentDate:'2026-09-05'},{accountId:'A',cents:-500,paymentDate:'2026-09-07'},{accountId:'A',cents:55555,void:true,paymentDate:'2026-09-08'},{accountId:'B',cents:1234,paymentDate:'2026-09-07'},{accountId:'OTHER',cents:123456,paymentDate:'2026-09-09'},{accountId:'B',cents:2222,paymentDate:'2025-09-05'}];
const veh=[...Array.from({length:10},(_,i)=>sub('vehicle','v'+i,{towDate:'2026-09-05',receivedDate:'2026-09-06'})),sub('vehicle','unknown',{receivedDate:'2026-09-06'}),sub('vehicle','outside',{towDate:'2025-09-06',receivedDate:'2026-09-16'}),sub('vehicle','date-missing',{}),sub('vehicle','other',{accountId:'OTHER',towDate:'2026-09-19'})];
const run=(id,more={})=>buildPortfolioReport({definition:definitions.find(d=>d.id===id),accounts:ac,records,vehicles:veh,payments,from:'2026-09-01',to:'2026-09-30',asOf:'2026-10-01',days:30,scope:'Mine',generatedAt:'now',profileEdits:{A:2},...more});
test('all catalog reports execute against real schema and disclose only displayed columns',()=>{
 for(const d of definitions){const out=run(d.id);assert(out.columns.length>=2,d.id);assert.equal(out.title,d.title);assert(!JSON.stringify(out).includes('DO NOT DISCLOSE'));assert(!JSON.stringify(out).includes('PRIVATE INTEREST'));for(const r of out.rows)assert.deepEqual(Object.keys(r.values),out.columns.map(c=>c.key));}
 const order=run('top-revenue').rows;assert.equal(order[0].accountId,'A');assert.equal(order[0].values.revenue,95);assert.equal(order[1].values.revenue,34.56);
 assert.equal(run('revenue-ranking',{from:'2026-10-01',to:'2026-10-01'}).rows[0].values.revenue,null);
});
test('confirmed tow dates, intakes, recorded touches, incurred expenses, and actual completion dates have distinct meanings',()=>{
 const v=run('vehicle-ranking').rows[0].values;assert.equal(v.vehicles,11);assert.equal(v.intake,1);assert.equal(v.tows,10);
 const wk=run('weekend').rows[0].values;assert.equal(wk.wRate,1.25);assert.equal(wk.dRate,0);assert.equal(wk.signal,'Higher Weekend Rate');assert.equal(wk.coverage,90.91);
 const eff=run('activity-return').rows[0].values;assert.equal(eff.activities,2);assert.equal(eff.visits,1);assert.equal(eff.profileEdits,2);assert.equal(eff.touches,4);assert.equal(eff.expense,18.77);assert.equal(eff.contribution,76.23);assert.equal(eff.perAction,19.06);
 const done=run('completed-service').rows;assert.equal(done.length,1);assert.equal(done[0].values.done,'2026-09-30');assert.equal(run('recent-visits').rows[0].values.last,'2026-09-30');
 assert(!run('last-service').rows.some(r=>r.accountId==='A'));assert.equal(run('last-service').rows.find(r=>r.accountId==='B').values.days,null);
 assert.equal(run('monthly-production').rows[0].values.tows,10);
});
test('outcome reports exclude uncompleted concessions; paid settlements follow incident cohort and cannot double-count booked expense',()=>{
 const c=run('courtesy-month').rows[0].values;assert.deepEqual([c.count,c.full,c.reduced,c.waived,c.unpriced],[2,1,1,18.77,1]);
 assert.equal(run('claim-month').rows[0].values.month,'2026-09');assert.equal(run('trespass-account').rows[0].values.declined,1);
 const rel=run('manager-topics',{term:'reports'}).rows;assert.equal(rel.length,1);assert.deepEqual([rel[0].values.group,rel[0].values.properties,rel[0].values.contribution],['Monthly Reports',1,76.23]);assert.equal(run('manager-topics',{term:'secret'}).rows.length,0);
 assert.equal(run('companies').rows.find(r=>r.values.group==='Group').values.contribution,null);assert.equal(run('companies').rows.find(r=>r.values.group==='Group').values.costCoverage,50);
 assert.equal(run('competitors').rows.length,1);assert.equal(run('competitors').rows[0].values.group,'Other Towing');assert.equal(run('visitor-section').rows.length,2);
});
test('the actual import preserves confirmed vs intake-only coverage and reports untimed vehicles explicitly',async()=>{
 const src=JSON.parse(await readFile('lib/accounts/history-data.json','utf8')),seed=JSON.parse(await readFile('lib/accounts/seed-data.json','utf8')),accounts=seed.filter(a=>a.kind==='account'),ids=new Set(accounts.map(a=>a.id));
 const expected=src.vehicles.filter(v=>ids.has(v.accountId)&&(!v.towDate||v.towDate<='2026-10-01')&&(v.towDate||!v.receivedDate||v.receivedDate<='2026-10-01'));
 const out=run('all-vehicles',{accounts,vehicles:src.vehicles,payments:src.payments});assert.equal(out.rows.reduce((s,r)=>s+r.values.vehicles,0),expected.length);assert(out.rows.reduce((s,r)=>s+r.values.intake,0)>1000);assert(out.rows.reduce((s,r)=>s+r.values.tows,0)<100);
});
const tmp=await mkdtemp(join(tmpdir(),'command-report-api-'));after(()=>rm(tmp,{recursive:true,force:true}));const api=join(tmp,'api.mjs');
await build({entryPoints:['app/api/accounts/portfolio-reports/route.ts'],outfile:api,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^next\/server$|^\.\/server$|^@\/db\/finance$|^\.\/history$|^\.\/vehicle-rows$/},a=>a.path==='./server'&&!a.importer.endsWith('portfolio-reports-server.ts')?undefined:{path:a.path,namespace:'mock'});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/server'?'export const NextResponse={json:(d,i)=>Response.json(d,i)}':a.path==='./history'?'export const importedPayments=globalThis.payments':a.path==='./vehicle-rows'?'export const vehicles=()=>globalThis.vehs':a.path==='./server'?'export const context=async()=>globalThis.ctx':'export const financeDb=()=>globalThis.reportDb' }));}}]});
globalThis.payments=payments;globalThis.vehs=veh;const {GET}=await import(pathToFileURL(api));const get=q=>{const url=new URL('https://local.test/?'+q);return GET(Object.assign(new Request(url),{nextUrl:url}));};
test('catalog and report route reject cross-portfolio and restricted sources; neither counts nor exports leak other portfolios',async()=>{
 const view=(tabs,owner=false)=>({person:'a',name:'A',role:'Employee',department:'Account Managers',owner,onboardingOnly:false,access:tabs.map(tab=>({module:'Account Management',tab,level:'View'}))});
 globalThis.ctx={all:[...ac.map(r=>r.id==='B'?{...r,assignee:'b'}:r),...records],staff:[{kind:'person',id:'a',name:'A',status:'Active'},{kind:'person',id:'b',name:'B',status:'Active'}],viewer:view(['accounts','performance'])};
 const meta=await (await get('')).json();assert.deepEqual(meta.scopes.map(s=>s.id),['a']);assert(!meta.properties.some(a=>a.id==='B'));assert(!meta.catalog.some(d=>d.id==='trespass-account'));assert(!meta.catalog.some(d=>d.id==='claim-account'));assert(!meta.catalog.some(d=>d.id==='manager-topics'));
 assert.equal((await get('id=claim-account')).status,403);assert.equal((await get('id=top-revenue&scope=')).status,403);assert.equal((await get('id=top-revenue&account=B')).status,403);
 assert.equal((await get('id=top-revenue')).status,200);const allowed=await (await get('id=top-revenue')).json();assert.deepEqual(allowed.rows.map(r=>r.accountId),['A']);assert.equal((await get('id=revenue-ranking&from=2025-02-31')).status,400);
 globalThis.ctx.viewer=view(['accounts']);assert.equal((await get('')).status,403);
});

test('effort audit counts only authorized property record changes in the selected Austin dates, never audit contents or unrelated tasks',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE account_audit (record_id TEXT,account_id TEXT,at TEXT,before TEXT)');const add=sqlite.prepare('INSERT INTO account_audit VALUES(?,?,?,?)');
 add.run('A','A','2026-09-01T05:00:00Z','SECRET');add.run('A','A','2026-10-01T04:59:59Z','SECRET');add.run('A','A','2026-10-01T05:00:00.000Z','SECRET');add.run('B','B','2026-09-13T03:00:00Z','SECRET');add.run('task','A','2026-09-12T20:00:00Z','SECRET');add.run('A','A','2026-09-12T20:00:00Z',null);
 globalThis.reportDb={prepare:sql=>({bind:(...args)=>({all:async()=>({results:sqlite.prepare(sql).all(...args)})})})};
 globalThis.ctx={all:[ac[0],...records],staff:[{kind:'person',id:'a',name:'A',status:'Active'}],viewer:{name:'A',person:'a',owner:false,role:'Employee',access:['accounts','activity','performance'].map(tab=>({module:'Account Management',tab,level:'View'}))}};
 try{const resp=await get('id=activity-return&from=2026-09-01&to=2026-09-30');assert.equal(resp.status,200);const out=await resp.json();assert.equal(out.rows[0].values.profileEdits,2);assert.equal(out.rows[0].values.touches,4);assert(!JSON.stringify(out).includes('SECRET'));}finally{sqlite.close();}
});
