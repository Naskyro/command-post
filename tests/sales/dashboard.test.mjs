import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {dashboardData,queueLeads} from '../../lib/sales/dashboard.ts';

const day='2026-01-02';
const stages=[{id:'warm',label:'Planning a Visit',type:'open'},{id:'wonX',label:'Signed',type:'won'},{id:'Lost',label:'Lost',type:'lost'}];
const make=(id,extras={})=>({id,name:id,kind:'opportunity',version:1,stage:'warm',...extras});
const portfolio=[make('A',{assignee:'rep',estimatedAnnualRevenue:15000,nextAction:'Visit on site',dueDate:'2026-01-01',targetCloseDate:'2026-02-01',service:'Basic Patrol'}),make('B',{assignee:'peer',estimatedAnnualRevenue:2000,dueDate:'2026-01-02'}),make('C',{assignee:'rep',dueDate:'2026-01-07',nextAction:'Call',targetCloseDate:'2026-01-31'}),make('D',{stage:'wonX',assignee:'rep',dueDate:'2025-12-01',estimatedAnnualRevenue:40000}),make('E',{stage:'Lost'}),make('sales-example:cedar',{name:'Sample · Cedar Gate Apartments',estimatedAnnualRevenue:800000}),make('sample-v2',{isSample:true}),make('removed',{deletedAt:day})];
const event=(id,lead,channel,date,extras={})=>({id,kind:'salesActivity',version:1,name:channel,channel,opportunityId:lead,date,...extras});
const log=[event('call','A','Phone call','2026-01-01T02:00:00Z'),event('note','A','Note',day),event('email','C','Email',day),event('outside','Unknown','Email',day),event('gone','B','Onsite visit',day,{deletedAt:day}),event('practice-log','B','Onsite visit',day,{trainingSample:true}),event('practice-lead-log','sales-example:cedar','Phone call',day),event('bad','C','Email','impossible')];

test('dashboard counts the visible live pipeline once and excludes personal samples and sample activities from every report',()=>{
 const d=dashboardData([...portfolio,portfolio[0]],log,stages,day);
 assert.equal(d.live.length,5);assert.equal(d.examples.length,2);assert.equal(d.open.length,3);assert.equal(d.due,2);assert.equal(d.valued,2);assert.equal(d.annual,17000);assert.equal(d.winRate,50);assert.equal(d.won.length,1);assert.equal(d.lost.length,1);
 assert.deepEqual(d.stageMix.map(x=>[x.label,x.rows.length]),[['Planning a Visit',3],['Signed',1],['Lost',1]]);
 assert.deepEqual(d.byChannel,{'Phone call':1,'Onsite visit':0,Email:2});assert.equal(d.activity.find(m=>m.key==='2025-12').total,1);assert.equal(d.activity.find(m=>m.key==='2026-01').total,1);assert.equal(d.activity.flatMap(x=>x.records).length,2);
 assert.equal(d.services.find(s=>s.name==='Unconfirmed').rows.length,4);
 assert.deepEqual(d.forecast.map(m=>[m.records.length,m.valued,m.total]),[[1,0,0],[1,1,15000],[0,0,0],[0,0,0],[0,0,0],[0,0,0]]);
});
test('action queues filter by real assignee and selected lead set, preserve true due order, never direct the rep to closed cases',()=>{
 const d=dashboardData(portfolio,log,stages,day),ids=x=>x.map(r=>r.id);
 assert.deepEqual(ids(queueLeads(d.open,'Due Now',day)),['A','B']);assert.deepEqual(ids(queueLeads(d.open,'Due Now',day,'rep')),['A']);
 assert.deepEqual(ids(queueLeads(d.open,'Upcoming',day,'rep')),['C']);assert.deepEqual(ids(queueLeads(d.open,'Needs a Next Step',day)),['B']);
 const search=dashboardData(portfolio.filter(r=>r.id==='C'),log,stages,day);assert.equal(search.won.length,0);assert.equal(search.winRate,null);assert.equal(search.byChannel['Phone call'],0);
 assert.deepEqual(ids(queueLeads(search.open,'Due Now',day)),[]);
});
test('sales dashboard renders personal practice leads separately from live amounts and never offers unauthorized drilldowns',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cp-dashboard-render-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const dest=join(dir,'render.cjs');
 await build({stdin:{contents:"export {default as Dashboard} from './components/sales/SalesDashboard'; export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';",resolveDir:process.cwd(),loader:'js'},outfile:dest,bundle:true,jsx:'automatic',platform:'node',format:'cjs',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
 const {Dashboard,createElement,renderToStaticMarkup}=createRequire(import.meta.url)(dest);
 const base={activities:log,stages,viewerId:'rep',ownerName:k=>k||'Unassigned',onLead:()=>{},onView:()=>{},allowedViews:['dashboard','all','followups','pipeline'],hasFilter:false};
 const show=p=>renderToStaticMarkup(createElement(Dashboard,{...base,...p}));
 const empty=show({leads:portfolio.filter(x=>x.id==='sales-example:cedar')});
 assert.match(empty,/No Live Leads Yet/);assert.match(empty,/Open practice lead: Cedar Gate Apartments/);assert.match(empty,/sample-properties\/cedar.webp/);assert.doesNotMatch(empty,/800,000|sdb-metrics/);
 const limited=show({leads:portfolio,allowedViews:['dashboard']});
 assert.doesNotMatch(limited,/Visit on site|sdb-queue-row|Show leads in/);assert.match(limited,/Follow-Up Queue/);assert.match(limited,/Sales Insights/);assert.doesNotMatch(limited,/Open practice lead:|title="Open Won Leads"|All Follow-Ups|title="Open Pipeline"/);
 assert.match(show({leads:[],hasFilter:true}),/No Live Leads Match These Filters/);assert.doesNotMatch(show({leads:[]}),/Training Examples/);
});
