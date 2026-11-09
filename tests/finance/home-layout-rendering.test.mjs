import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {selectDashboardSignals} from '../../lib/home/pulse-types.ts';

const now=new Date('2026-11-04T16:00Z'),day='2026-11-04';
const signal=(id,tone='info',score=1)=>({id,title:id,description:'Summary',module:'Work Orders',count:1,unit:'records',target:{module:'Work Orders',tab:'orders'},items:[],tone,score});
const alerts=[signal('critical_alert','critical',60),signal('ordinary')];
const sections=['calendar','priority','signals','glance','chart-workload'];
const active={signals:alerts,asOf:now.toISOString(),today:day,unavailable:[]};
const data={viewer:{id:'session',person:'employee',name:'Employee',department:'Dispatch',access:[]},timeZone:'America/Chicago',title:'Dispatcher'};
let render,dir;
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'cmd-layout-render-'));const outfile=join(dir,'render.cjs');
 await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import CommandDashboard from './components/home/CommandDashboard';export const render=(data,pulse,layout,availableSections,preferences)=>renderToStaticMarkup(<CommandDashboard data={data} pulse={pulse} preferences={preferences} layout={layout} availableSections={availableSections} now={Date.parse(pulse.asOf)} onRefresh={()=>{}} onChange={async()=>{}} onCustomize={()=>{}} onOpen={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'cjs',loader:{'.css':'empty'},logLevel:'silent'});({render}=createRequire(import.meta.url)(outfile));
});
after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
const keys=html=>Array.from(html.matchAll(/data-home-section="([^"]+)"/g),m=>m[1]);
test('the saved DOM reading order moves and removes charts, groups only adjacent panels, and omits unauthorized charts',()=>{
 const order=['calendar','priority','chart-workload','signals','glance','chart-finance'];
 const first=render(data,active,{order,hidden:['signals'],signalOrder:[]},sections,{});
 assert.deepEqual(keys(first),['calendar','priority','chart-workload','glance']);assert.match(first,/data-home-section="calendar" class="cmd-pulse-half"/);assert.match(first,/Dashboard Analytics: Scheduled Workload/);assert.doesNotMatch(first,/Financial Performance/);
 const second=render(data,active,{order:['calendar','glance','priority','signals','chart-workload'],hidden:['chart-workload'],signalOrder:[]},sections,{});
 assert.deepEqual(keys(second),['calendar','glance','priority','signals']);assert.doesNotMatch(second,/cmd-pulse-half|Dashboard Analytics:/);
});
test('a cleared layout still offers Customize and a critical alert entry independent of the removed queue',()=>{
 const html=render(data,active,{order:sections,hidden:[...sections],signalOrder:[]},sections,{critical_alert:{mode:'hidden'}});
 assert.deepEqual(keys(html),[]);assert.match(html,/Your Home Is Clear/);assert.match(html,/Choose Sections/);assert.match(html,/Customize Dashboard/);assert.match(html,/aria-haspopup="dialog" aria-label="Review Critical Alerts: critical_alert"/);assert.doesNotMatch(html,/href="#cmd-priority-head"|id="cmd-priority-head"/);
});
test('moving a tile above the fold honors its personal placement without moving, hiding, or rescheduling alerts',()=>{
 const signals=[...alerts,...Array.from({length:10},(_,i)=>signal('card_'+i,'info',20-i))],prefs={critical_alert:{mode:'hidden'},card_8:{mode:'scheduled',days:[2]}};
 const layout={order:sections,hidden:[],signalOrder:['card_9','card_8','critical_alert','card_7']},selection=selectDashboardSignals(signals,prefs,day,layout.signalOrder);
 assert.deepEqual(selection.visible.slice(0,2).map(s=>s.id),['card_9','card_7']);assert.equal(selection.priorities[0].id,'critical_alert');assert.equal(selection.visible.some(s=>s.id==='card_8'||s.id==='critical_alert'),false);
 const html=render(data,{...active,signals},layout,sections,prefs);const glance=html.split('data-home-section="glance"')[1].split('data-home-section="')[0];assert.ok(glance.indexOf('card_9')>=0&&glance.indexOf('card_9')<glance.indexOf('card_7'));assert.doesNotMatch(glance,/card_8|critical_alert/);
});
