import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {axisBounds} from '../../lib/home/chart-math.ts';

test('independent cards honor saved modes and ranges, distinguish missing periods, and cannot fall back to other modules',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'home-charts-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'render.cjs');
 await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Chart from './components/home/HomeAnalytics';
 export const render=(pulse,id,view)=>renderToStaticMarkup(<Chart pulse={pulse} preferences={{}} chartId={id} chartView={view} onChartViewChange={async()=>{}} onOpen={()=>{}} onArrange={()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},outfile:file,platform:'node',format:'cjs',bundle:true,loader:{'.css':'empty'},logLevel:'silent'});
 const {render}=createRequire(import.meta.url)(file),pulse={today:'2026-11-04',signals:[],unavailable:[],asOf:'2026-11-04T18:00Z'};
 const orders={coverageFrom:'2026-08-26',asOf:pulse.today,undatedOpened:2,undatedCompleted:1,weeks:Array.from({length:12},(_,i)=>{const date=new Date('2026-08-16T12:00Z');date.setUTCDate(date.getUTCDate()+7*i);return {week:date.toISOString().slice(0,10),opened:i<1?null:i-1,completed:i<1?null:i%2,partial:i===1||i===11};})};
 const out=render({...pulse,orderAnalytics:orders},'chart-orders',{mode:'table',range:12});
 assert.match(out,/Work Orders Over Time/);assert.match(out,/Scope|Chart Values/);assert.match(out,/Week of Aug 16/);assert.match(out,/Week to date/);assert.match(out,/No dated history/);assert.match(out,/Not plotted: 2 undated openings and 1 undated completion/);assert.match(out,/Period Totals/);assert.match(out,/Arrange Work Orders Over Time on Home/);assert.match(out,/Open Work Orders/);assert.doesNotMatch(out,/Scatter View|Operating Receipts|Analytics Source/);
 const shorter=render({...pulse,orderAnalytics:orders},'chart-orders',{mode:'line',range:6});
 assert.doesNotMatch(shorter,/Week of Aug 16/);assert.match(shorter,/Line chart by week/);assert.match(shorter,/aria-label="Line View" aria-pressed="true"/);
 assert.equal(render({...pulse,orderAnalytics:orders},'chart-finance'), '');assert.equal(render({...pulse,orderAnalytics:orders},'chart-hires'),'');assert.equal(render({...pulse,orderAnalytics:orders},'chart-tows'),'');
 const business={months:[{month:'2026-10',value:4,secondary:null},{month:'2026-11',value:null,secondary:9}],asOf:pulse.today,note:'Dates of tow and receipt are separate.',unit:'Confirmed Tows',secondaryUnit:'Received Date Only'};
 const tow=render({...pulse,businessTrends:{hires:null,tows:business}},'chart-tows',{mode:'table',range:12});assert.match(tow,/Property Tow Activity/);assert.match(tow,/Received Date Only/);assert.match(tow,/Confirmed Tows/);assert.match(tow,/Open Property Results/);assert.doesNotMatch(tow,/Scatter View|<td>13<\/td>/);
 const hires=render({...pulse,businessTrends:{hires:{...business,unit:'Employment Starts',secondaryUnit:undefined},tows:null}},'chart-hires',{mode:'line',range:6});assert.match(hires,/Hiring Over Time/);assert.match(hires,/Open Hiring Trend/);assert.doesNotMatch(hires,/Received Date Only|Confirmed Tows|Scatter View/);
 assert.deepEqual(axisBounds([0,1],true).ticks,[0,1]);
});
