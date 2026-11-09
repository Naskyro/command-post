import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDashboardSignals} from '../../lib/home/pulse-types.ts';
const signal=(id,count=1,tone='info',score=60)=>({id,title:id,module:'Field',description:'',count,unit:'events',target:{module:'Home'},items:[],tone,score});
test('weekday schedules follow the Austin date and a quiet pinned card stays visible',()=>{
 const data=[signal('monday'),signal('zero',0),signal('auto')],prefs={monday:{mode:'scheduled',days:[1]},zero:{mode:'pinned'}};
 const sunday=selectDashboardSignals(data,prefs,'2026-11-01'),monday=selectDashboardSignals(data,prefs,'2026-11-02');
 assert.deepEqual(sunday.scheduled,[]);assert.ok(!sunday.visible.some(s=>s.id==='monday'));
 assert.equal(sunday.visible[0].id,'zero');assert.deepEqual(monday.scheduled.map(s=>s.id),['monday']);
});
test('urgent live alerts survive hidden/off-schedule preferences, archived alerts and unavailable signals cannot create a priority',()=>{
 const data=[signal('safety',1,'critical',100),signal('cleared',0,'critical',100),signal('bill',1,'warning',85),signal('new',1,'info',70)];
 const prefs={safety:{mode:'scheduled',days:[2]},bill:{mode:'hidden'},cleared:{mode:'pinned'},private:{mode:'pinned'}};
 const d=selectDashboardSignals(data,prefs,'2026-11-02');
 assert.deepEqual(d.priorities.map(s=>s.id),['safety','new']);assert.ok(d.pinned.every(s=>s.id==='cleared'));assert.ok(!d.visible.some(s=>s.id==='private'));
 assert.deepEqual(selectDashboardSignals([data[0]],{safety:{mode:'hidden'}},'2026-11-02').priorities.map(s=>s.id),['safety']);
});
test('an escalating operational exception outranks routine volume and ties are stable',()=>{
 const signals=[signal('review',150,'info',60),signal('risk',1,'critical',95),signal('urgent order',1,'warning',80),signal('major claim',1,'warning',97)];
 assert.deepEqual(selectDashboardSignals(signals,{},'2026-11-02').visible.map(x=>x.id),['risk','major claim','urgent order','review']);
 assert.deepEqual(signals.map(x=>x.id),['review','risk','urgent order','major claim']);
});
