import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {homeWorkAnalytics} from '../../lib/home/work-analytics.ts';
import {axisBounds,lineSegments} from '../../lib/home/chart-math.ts';

const viewer=tabs=>({id:'session-me',person:'me',role:'Employee',department:'Dispatch',owner:false,access:tabs.map(tab=>({module:'Timeclock',tab,level:'View'}))});
const now=new Date('2026-11-04T16:00Z'),person={kind:'person',id:'me',status:'Active'},shift={kind:'shift',id:'s',person:'me',status:'Published',start:'2026-10-31T23:00',end:'2026-11-01T03:00'},time={kind:'time',person:'me',date:'2026-11-02',hours:4.75,status:'Approved'};
test('own weekly summary honors tab access, ignores future/other-person/sample time, and splits shifts at Austin week boundaries even at the DST change',()=>{
 const records=[person,shift,time,{...shift,person:'else'},{...time,person:'else'},{...time,date:'2026-11-06'},{...time,isSample:true},{...time,date:'2026-11-03',status:'Draft',hours:'2.25'}];
 assert.equal(homeWorkAnalytics(viewer([]),records,now),null);
 assert.equal(homeWorkAnalytics({...viewer(['Today']),onboardingOnly:true},records,now),null);
 assert.equal(homeWorkAnalytics(viewer(['Today']),[{...person,status:'Terminated'},time],now),null);
 const sched=homeWorkAnalytics(viewer(['Schedule']),records,now);
 assert.equal(sched.historyTab,'Schedule');assert.deepEqual(sched.weeks.slice(-2),[{week:'2026-10-25',recorded:null,approved:null,scheduled:1},{week:'2026-11-01',recorded:null,approved:null,scheduled:4}]);
 const own=homeWorkAnalytics(viewer(['Timesheets']),records,now);assert.equal(own.weeks.length,12);assert.deepEqual(own.weeks.at(-1),{week:'2026-11-01',recorded:7,approved:4.75,scheduled:null});assert.equal(own.weeks.at(-2).recorded,null);
});
test('plot paths break across unobserved months; axes include negative cash amounts and still render recorded zero',()=>{
 assert.deepEqual(lineSegments([0,3,null,0,null],(v,i)=>v===null?null:{x:i,y:v}),[[{x:0,y:0},{x:1,y:3}],[{x:3,y:0}]]);
 const mixed=axisBounds([-900,null,1400]);assert.ok(mixed.min<=-900&&mixed.max>=1400&&mixed.ticks.includes(0));
 const flat=axisBounds([0,0]);assert.equal(flat.min,0);assert.ok(flat.max>flat.min);
});
test('Home renders only authorized analytics tabs and contextual comparison colors, and omits inaccessible report links',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-home-trends-'));t.after(()=>rm(dir,{recursive:true,force:true}));const bundle=join(dir,'test.cjs');
 await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup as html} from 'react-dom/server';import Panel from './components/home/HomeAnalytics';export const render=(pulse,finance,work)=>html(<Panel pulse={pulse} preferences={{}} finance={finance} work={work} onOpen={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},outfile:bundle,platform:'node',format:'cjs',bundle:true,loader:{'.css':'empty'},logLevel:'silent'});
 const {render}=createRequire(import.meta.url)(bundle),pulse={asOf:now.toISOString(),today:'2026-11-04',signals:[],unavailable:[]};
 const personal=render(pulse,null,homeWorkAnalytics(viewer(['Schedule']),[person,shift],now));assert.match(personal,/My Time Trends/);assert.match(personal,/Published Hours/);assert.doesNotMatch(personal,/Operating Receipts|Open Finance Report|Scatter View/);
 const none=render(pulse,null,null);assert.match(none,/Scheduled Workload/);assert.doesNotMatch(none,/Monthly Operating Receipts|My Time Trends|My Shifts/);
 const f={asOf:'2026-11-04',through:'2026-10-31',reportable:false,definitions:{},months:[{month:'2026-09',revenue:100,spending:70,netCash:30,transactionCount:5,complete:true},{month:'2026-10',revenue:80,spending:50,netCash:30,transactionCount:5,complete:true},{month:'2026-11',revenue:null,spending:null,netCash:null,transactionCount:null,complete:false}],comparisons:['revenue','spending','netCash'].map((key,i)=>({key,current:i?50:80,previous:i?70:100,change:-20,percent:-20,direction:'down',assessment:i===1?'favorable':i===0?'unfavorable':'neutral',currentMonth:'2026-10',previousMonth:'2026-09'})),reportIds:{revenue:'monthly-revenue'}};
 const fin=render(pulse,f,null);assert.match(fin,/Financial Performance/);assert.match(fin,/data-state="favorable"[^>]*aria-label="Spending: down, favorable"/);assert.match(fin,/data-state="unfavorable"[^>]*aria-label="Operating Receipts: down, unfavorable"/);assert.match(fin,/Scatter View/);assert.doesNotMatch(fin,/Open Finance Report/);assert.match(render(pulse,{...f,reportable:true},null),/Open Finance Report/);
});

test('Home renders the new analytics, signals and calendar without mounting or bundling the retired widget workspace',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-home-shell-'));t.after(()=>rm(dir,{recursive:true,force:true}));const bundle=join(dir,'test.cjs');
 const result=await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup as html} from 'react-dom/server';import Dashboard from './components/home/CommandDashboard';export const render=(data,pulse,now)=>html(<Dashboard data={data} pulse={pulse} preferences={{}} onChange={async()=>{}} onRefresh={()=>{}} onCustomize={()=>{}} onOpen={()=>{}} refreshing={false} now={now}/>);`,loader:'tsx',resolveDir:process.cwd()},outfile:bundle,platform:'node',format:'cjs',bundle:true,metafile:true,logLevel:'silent'});
 const html=createRequire(import.meta.url)(bundle).render({viewer:{...viewer([]),name:'Employee'},title:'Dispatcher',timeZone:'America/Chicago'},{asOf:now.toISOString(),today:'2026-11-04',signals:[],unavailable:[]},now.getTime());
 assert.match(html,/My Work Calendar/);assert.match(html,/Dashboard Analytics/);assert.match(html,/Customize Dashboard/);assert.doesNotMatch(html,/My Workspace Tools|Manage Widgets|Add Widgets|h-widget/);
 const css=Object.keys(result.metafile.inputs).filter(k=>k.endsWith('.css'));assert.ok(css.includes('components/home/command-dashboard.css'));assert.ok(css.includes('components/home/home-analytics.css'));assert.ok(!css.includes('components/home/home.css'));
});
