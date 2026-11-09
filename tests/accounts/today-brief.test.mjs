import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const tmp=await mkdtemp(join(tmpdir(),'command-am-today-')),out=join(tmp,'brief.mjs');
await build({stdin:{contents:"export * from './lib/accounts/today-brief';export * from './lib/ccr/docket-model';export * from './lib/ccr/docket-server';",loader:'ts',resolveDir:process.cwd()},platform:'node',format:'esm',bundle:true,outfile:out,logLevel:'silent',plugins:[{name:'isolated-court-fixture',setup(b){b.onResolve({filter:/^(@\/db\/finance|@\/lib\/hr\/server|@\/lib\/accounts\/server)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='@/db/finance'?`export const financeDb=()=>({prepare:(sql)=>({all:async()=>{globalThis.fx.reads++;return {results:globalThis.fx.matters.map(m=>({payload:JSON.stringify(m)}))}},bind:(...params)=>({first:async()=>null,run:async()=>{globalThis.fx.writes++;return{meta:{changes:1}}}})})})`:a.path==='@/lib/hr/server'?'export const decode=JSON.parse,encode=JSON.stringify':'export const yearCaseRows=async()=>globalThis.fx.accounts'}))}}]});
after(()=>rm(tmp,{recursive:true,force:true}));
const api=await import(pathToFileURL(out)),row=(kind,id,extra={})=>({kind,id,name:id,version:1,...extra}), prop=(id,a='me',s='Active',extra={})=>row('account',id,{assignee:a,status:s,...extra});
const day='2026-12-22',viewer=(tabs)=>({id:'actor',person:'me',name:'Manager',owner:false,department:'Account Managers',role:'Employee',access:tabs.map(([module,tab,level='View'])=>({module,tab,level}))});
const am=viewer(['accounts','work','claims'].map(t=>['Account Management',t])),ccr=viewer([['Compliance, Claims & Recovery','hearings','Edit'],['Account Management','accounts','View']]);
const matter=(id,accountId,more={})=>({id,accountId,type:'Lawsuit',title:'PRIVATE-LITIGATION-TITLE',number:'PRIVATE-DOCKET-NUMBER',dueOn:'2027-01-05',dueFor:'PRIVATE-DEADLINE-TASK',status:'Open',statements:[{text:'PRIVATE-NARRATIVE'}],appearances:[{id:'h',label:'PRIVATE-HEARING-LABEL',date:'2026-12-24',time:'13:45',status:'Scheduled'},{id:'c',label:'PRIVATE-CANCEL',date:'2026-12-25',status:'Cancelled'}],...more});
test('linked open court projection enforces current assignment, backup expiry and area grant before any docket read; records never carry legal narrative',async()=>{
 const rows=[prop('mine'),prop('backup','person','Active',{backup:'me',backupUntil:day}),prop('expired','person','Active',{backup:'me',backupUntil:'2026-12-21'}),prop('terminated','me','Terminated'),prop('example','me','Active',{example:true})];
 globalThis.fx={accounts:rows,reads:0,matters:[matter('mineCase','mine'),matter('backupCase','backup'),matter('otherCase','expired'),matter('pastProperty','terminated'),matter('closed','mine',{status:'Closed'}),matter('stray',undefined,{title:'mine'}),matter('demo','example')]};
 for(const [v,s] of [[am,''],[am,'another'],[viewer([['Account Management','work']]),'me'],[{...am,onboardingOnly:true},'me']])await assert.rejects(api.accountCourtBrief(v,rows,[],s,day));
 assert.equal(globalThis.fx.reads,0);
 const limited=await api.accountCourtBrief(am,rows,[],'me',day);assert.equal(limited.canOpenDocket,false);assert.deepEqual(limited.cases.map(c=>c.id),['mineCase','backupCase','pastProperty']);assert.doesNotMatch(JSON.stringify(limited),/PRIVATE-|stray|expired|closed|demo/);assert.deepEqual(limited.cases[0].appearances,[{id:'h',date:'2026-12-24',time:'13:45'}]);
 const team=await api.accountCourtBrief({...am,owner:true},rows,[],'',day);assert.equal(team.canOpenDocket,true);assert(team.cases.some(r=>r.id==='otherCase'));
});
test('choosing a real property requires docket edit and account access; legacy matters stay unlinked and the chosen property survives subsequent edits',async()=>{
 globalThis.fx={accounts:[prop('mine')],reads:0,writes:0,matters:[]};
 const base={type:'Tow Hearing',version:0,title:'Private',status:'Open',appearances:[]};
 const opts=await api.propertyOptions(ccr);assert.deepEqual(opts,[{id:'mine',name:'mine'}]);
 assert.deepEqual(await api.propertyOptions(am),[]);
 const newRecord=await api.updateMatter(ccr,{...base,accountId:'mine'});assert.equal(newRecord.accountId,'mine');
 await assert.rejects(api.updateMatter(ccr,{...base,accountId:'guessed'}),/existing property/);
 await assert.rejects(api.updateMatter(viewer([['Compliance, Claims & Recovery','hearings','Edit']]),{...base,accountId:'mine'}));
 assert.equal(globalThis.fx.writes,1);
 const existing=api.prepareMatter(base,undefined,ccr,new Date());assert.equal(existing.accountId,undefined);
 const revised=api.prepareMatter({...base,id:newRecord.id,version:1},newRecord,ccr,new Date());assert.equal(revised.accountId,'mine');
});
test('birthdays use current property managers only; one contact across two properties gets one upcoming birthday, no birth year or age',()=>{
 const c=(id,date)=>row('contact',id,{dateOfBirth:date}),f=(id,contactId,accountId,extra={})=>row('affiliation',id,{contactId,accountId,role:'Property Manager',...extra});
 const rows=[prop('first'),prop('second'),prop('ended','me','Terminated'),prop('sample','me','Active',{isSample:true}),prop('other','else'),c('newyear','1975-01-02'),c('ex','1952-12-25'),c('unknown',''),c('invalid','2001-02-29'),f('r1','newyear','first'),f('r2','newyear','second'),f('r3','newyear','other'),f('r4','ex','first',{endDate:day}),f('r5','ex','ended'),f('r6','ex','first',{role:'Assistant Manager'}),f('r7','ex','sample'),f('r8','unknown','first'),f('r9','invalid','first')];
 const result=api.accountBrief(rows,'me',day,[]);assert.deepEqual(result.birthdays,[{id:'newyear',name:'newyear',date:'2027-01-02',properties:['first','second']}]);assert.doesNotMatch(JSON.stringify(result.birthdays),/1975|1952/);
});
test('active claims can survive service termination, only real follow-up dates are used, launches exclude activated/dropped accounts, cancelled hearings are omitted',()=>{
 const rows=[prop('first'),prop('launch','me','Onboarding',{launchDate:'2026-12-27'}),prop('terminated','me','Terminated'),prop('other','another'),row('claim','open',{accountId:'terminated',status:'Pending review',nextFollowUp:'2026-12-24'}),row('claim','undated',{accountId:'first',status:'Investigating',incidentDate:day}),row('claim','paid',{accountId:'first',status:'Paid'}),row('claim','sample',{accountId:'first',example:true}),row('claim','hidden',{accountId:'other',status:'Investigating'})];
 const brief=api.accountBrief(rows,'me',day,api.publicCourtBrief([matter('court','terminated'),matter('past','first',{dueOn:'',appearances:[{id:'x',date:'2026-12-12',status:'Scheduled'}]})],new Set(['terminated','first'])));
 assert.deepEqual(brief.claims.map(c=>c.id),['open','undated']);assert.equal(brief.claims[1].nextFollowUp,undefined);assert.deepEqual(brief.pending.map(a=>a.id),['launch']);assert.equal(brief.cases[0].nextDate,'2026-12-24');assert.equal(brief.cases[1].nextDate,'');assert.equal(brief.cases[1].unconfirmed.id,'x');
});
test('rendered Today exposes operational destinations and individual records; ordinary managers have no department-wide portfolio picker',async()=>{
 const ui=join(tmp,'render.cjs');
 await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {TodayDashboard} from './components/accounts/TodayDashboard';export function render(rows,can,head){return renderToStaticMarkup(React.createElement(TodayDashboard,{all:rows,staff:[],viewer:'me',head,canView:k=>can.includes(k),canRevenue:false,revision:'fixture',onPending:()=>{},onContact:()=>{},onHandoffs:undefined,onAccount:()=>{},onAccounts:()=>{},onAction:()=>{},onWork:()=>{},onClaims:()=>{}}))}`,loader:'tsx',resolveDir:process.cwd()},platform:'node',format:'cjs',bundle:true,external:['react','react-dom/server','react/jsx-runtime','react-dom','react-is'],loader:{'.css':'empty'},outfile:ui,logLevel:'silent'});
 // Bundled CJS lives outside the repo; resolve its React peer dependencies there.
 const {symlink}=await import('node:fs/promises');await symlink(join(process.cwd(),'node_modules'),join(tmp,'node_modules'),'dir');
 const {createRequire}=await import('node:module');const render=createRequire(import.meta.url)(ui).render;
 const rows=[prop('mine'),prop('launch','me','Onboarding'),prop('Other Manager Property','someone'),row('claim','Brake Lamp Damage',{accountId:'mine',nextFollowUp:day,status:'Pending review'}),row('claim','Hidden Claim',{accountId:'Other Manager Property',status:'Investigating'})];
 const html=render(rows,['accounts','work','claims','relationships','workOrders'],false);
 assert.match(html,/Today’s Portfolio/);assert.match(html,/My Assigned Properties/);assert.match(html,/id="am-today-claims"/);assert.match(html,/Brake Lamp Damage/);assert.match(html,/id="am-today-pending"/);assert.match(html,/Property Manager Birthdays/);assert.match(html,/Court Calendar/);assert.doesNotMatch(html,/Hidden Claim|Dashboard portfolio|Revenue Trend/);
 const minimal=render(rows,['work'],false);assert.doesNotMatch(minimal,/Court Calendar|Property Manager Birthdays|Vehicle Damage Claims|Brake Lamp Damage/);
 const head=render(rows,['accounts','work'],true);assert.match(head,/Dashboard portfolio/);
});
test('first priority responds to recorded dates and permissions without promoting a cancelled hearing or an unauthorized claim',()=>{
 const d=api.accountBrief([prop('first'),row('claim','major',{accountId:'first',name:'Concern',status:'Investigating',claimPriority:'Major'})],'me',day,api.publicCourtBrief([matter('court','first',{dueOn:day})],new Set(['first'])));
 const tasks=[row('task','urgent',{priority:'Urgent',dueDate:day,status:'Open',accountId:'first'})];
 assert.equal(api.nextAccountPriority(d,tasks,day,{cases:true,claims:true,tasks:true,pending:true}).id,'court');
 assert.equal(api.nextAccountPriority(d,tasks,day,{cases:false,claims:false,tasks:true,pending:true}).id,'urgent');
 assert.equal(api.nextAccountPriority(d,tasks,day,{cases:false,claims:false,tasks:false,pending:false}),undefined);
});
