import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {availableHomeSections,defaultHomeLayout,validateHomeLayout} from '../../lib/home/dashboard-layout.ts';
import {readPulsePreferences,savePulsePreferences} from '../../lib/home/pulse-preferences.ts';

const base={id:'id1',person:'p1',role:'Employee',department:'Dispatch',owner:false,access:[]}, exec={...base,owner:true};
const pulse={analytics:{},workAnalytics:{},orderAnalytics:{},businessTrends:{hires:{},tows:{}}},ids=['court','shift','private'];
const permitted=availableHomeSections(exec,pulse);
const layout=()=>({...defaultHomeLayout(permitted),order:['calendar','signals','chart-time','chart-tows','chart-hires','chart-finance','glance','chart-orders','priority','chart-workload'],hidden:['chart-finance','chart-tows'],signalOrder:['court','private','shift'],chartViews:{'chart-finance':{mode:'scatter',range:12},'chart-orders':{mode:'bar',range:12}}});
const now='2026-11-01T00:00:00Z',grant=(module,tab)=>({module,tab,level:'View'});
function fixture(t){
 const conn=new DatabaseSync(':memory:');t.after(()=>conn.close());conn.exec(readFileSync(new URL('../../drizzle/0017_home_signal_preferences.sql',import.meta.url),'utf8'));
 const db={prepare(sql){const stmt=conn.prepare(sql);return {bind(...vals){return {first:async()=>stmt.get(...vals)??null,run:async()=>({meta:{changes:stmt.run(...vals).changes}})}}}}};
 return {conn,db};
}
test('only eligible chart topics appear and one relevant chart is initially visible',()=>{
 const eligible=availableHomeSections(base,pulse);
 assert.deepEqual(eligible,['glance','chart-workload','priority','calendar','signals']);
 const employee={...base,access:[grant('Work Orders','orders'),grant('Timeclock','Today')]};
 const personal=availableHomeSections(employee,pulse);assert.ok(personal.includes('chart-orders'));assert.ok(!personal.includes('chart-finance'));
 const noHistory=availableHomeSections(exec,{...pulse,orderAnalytics:null,businessTrends:{hires:null,tows:null}});assert.ok(!noHistory.includes('chart-orders'));assert.ok(!noHistory.includes('chart-hires'));assert.ok(!noHistory.includes('chart-tows'));
 const countDefault=(all)=>{const p=defaultHomeLayout(all);return p.order.filter(id=>id.startsWith('chart-')&&!p.hidden.includes(id));};
 assert.deepEqual(countDefault(personal),['chart-time']);assert.deepEqual(countDefault(permitted),['chart-finance']);assert.deepEqual(countDefault(eligible),['chart-workload']);
 assert.deepEqual(availableHomeSections({...exec,onboardingOnly:true},pulse),[]);
});
test('adopts legacy pins without writes, persists layout per employee and leaves it intact for signal-only saves',async t=>{
 const {conn,db}=fixture(t),pins={court:{mode:'scheduled',days:[1,4]},shift:{mode:'pinned'}};
 conn.prepare('INSERT INTO home_signal_preferences(person_id,preferences,version,updated_by,updated_at) VALUES(?,?,?,?,?)').run(base.person,JSON.stringify(pins),7,'login',now);
 const start=await readPulsePreferences(exec,ids,db,permitted);assert.deepEqual(start,{preferences:pins,version:7,layout:defaultHomeLayout(permitted)});
 const draft=layout(),next=await savePulsePreferences(exec,ids,pins,7,db,draft,permitted);
 assert.deepEqual(await readPulsePreferences(exec,ids,db,permitted),next);assert.equal(next.version,8);assert.deepEqual(next.preferences,pins);
 assert.deepEqual(next.layout.order,draft.order);assert.deepEqual(next.layout.chartViews,draft.chartViews);
 const other=await readPulsePreferences({...exec,person:'other',id:'other-id'},ids,db,permitted);assert.deepEqual(other.layout,defaultHomeLayout(permitted));assert.deepEqual(other.preferences,{});
 await savePulsePreferences(exec,ids,{...pins,private:{mode:'hidden'}},8,db);
 const reread=await readPulsePreferences(exec,ids,db,permitted);assert.deepEqual(reread.layout,next.layout);assert.deepEqual(reread.preferences.private,{mode:'hidden'});
 await assert.rejects(savePulsePreferences(exec,ids,pins,8,db,draft,permitted),e=>e.status===409);
 const noGraphs={...reread.layout,hidden:permitted.filter(x=>x.startsWith('chart-'))};
 const saved=await savePulsePreferences(exec,ids,pins,9,db,noGraphs,permitted);assert.deepEqual(saved.layout.order.filter(x=>x.startsWith('chart-')&&!saved.layout.hidden.includes(x)),[]);
 const reset=await savePulsePreferences(exec,ids,pins,10,db,defaultHomeLayout(permitted),permitted);
 assert.deepEqual(reset.layout,defaultHomeLayout(permitted));assert.deepEqual(reset.preferences,pins);
});
test('revoked charts, signal IDs and graph settings are never disclosed, and return after access is restored',async t=>{
 const {db}=fixture(t);await savePulsePreferences(exec,ids,{private:{mode:'pinned'}},0,db,layout(),permitted);
 const reduced=availableHomeSections({...base,access:[grant('Work Orders','orders')]},pulse),allowed=['court','shift'];
 const snapshot=await readPulsePreferences(base,allowed,db,reduced);
 assert.deepEqual(snapshot.preferences,{});assert.deepEqual(snapshot.layout.signalOrder,['court','shift']);
 assert.ok(!JSON.stringify(snapshot).includes('chart-finance'));assert.ok(!JSON.stringify(snapshot).includes('private'));
 const edited={...snapshot.layout,order:[...snapshot.layout.order].reverse(),signalOrder:['shift','court'],hidden:[]};
 const fresh=await savePulsePreferences(base,allowed,{},1,db,edited,reduced);assert.deepEqual(fresh.layout.order,edited.order);
 const restored=await readPulsePreferences(exec,ids,db,permitted);
 assert.deepEqual(restored.layout.signalOrder,['shift','private','court']);assert.deepEqual(restored.preferences.private,{mode:'pinned'});
 assert.ok(restored.layout.hidden.includes('chart-finance'));assert.deepEqual(restored.layout.chartViews['chart-finance'],{mode:'scatter',range:12});
 assert.deepEqual(restored.layout.order.filter(k=>reduced.includes(k)),edited.order);
});
test('rejects forged and duplicate sections, unscoped signals and bogus chart styles',()=>{
 const a=defaultHomeLayout(permitted),small=permitted.filter(k=>k!=='chart-finance');
 assert.throws(()=>validateHomeLayout(a,small,ids),e=>e.status===403);
 assert.throws(()=>validateHomeLayout({...a,order:a.order.slice(1)},permitted,ids),e=>e.status===409);
 for(const invalid of [{order:[...a.order,'signals']},{hidden:['chart-fake']},{hidden:[null]},{signalOrder:['secret']},{signalOrder:['__proto__']},{chartViews:{signals:{mode:'bar',range:6}}},{chartViews:{'chart-orders':{mode:'scatter',range:12}}},{chartViews:{'chart-time':{mode:'line',range:8}}},{userId:'forged'}])assert.throws(()=>validateHomeLayout({...a,...invalid},permitted,ids));
});
