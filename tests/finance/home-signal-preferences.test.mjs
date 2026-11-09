import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {readPulsePreferences,savePulsePreferences,validatePulsePreferences} from '../../lib/home/pulse-preferences.ts';

const viewer={person:'employee',id:'login'}, coworker={person:'other',id:'other-login'};
const ids=['budget','safety','court'];
function setup(t){const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(readFileSync(new URL('../../drizzle/0017_home_signal_preferences.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../../drizzle/0002_salty_juggernaut.sql',import.meta.url),'utf8'));
 const db={prepare(q){const s=sql.prepare(q);return {bind(...b){return {first:async()=>s.get(...b)??null,run:async()=>({meta:{changes:s.run(...b).changes}})}}}}};
 return {sql,db};}
test('pins and schedules persist on only the signed-in profile without disturbing personal widgets',async t=>{
 const {sql,db}=setup(t);
 sql.prepare('INSERT INTO home_layouts (person_id, widgets, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)').run(viewer.person,'[]',7,viewer.id,new Date().toISOString());
 const wanted={budget:{mode:'pinned'},safety:{mode:'scheduled',days:[6,0]},court:{mode:'auto'}};
 const saved=await savePulsePreferences(viewer,ids,wanted,0,db);
 assert.deepEqual(saved,{preferences:{budget:{mode:'pinned'},safety:{mode:'scheduled',days:[0,6]}},version:1});
 assert.deepEqual(await readPulsePreferences(viewer,ids,db),saved);
 assert.deepEqual(await readPulsePreferences(coworker,ids,db),{preferences:{},version:0});
 assert.equal(sql.prepare('SELECT version FROM home_layouts WHERE person_id=?').get(viewer.person).version,7);
 assert.equal(sql.prepare('SELECT updated_by FROM home_signal_preferences WHERE person_id=?').get(viewer.person).updated_by,viewer.id);
});
test('losing access hides stored choices and blocks guessed IDs; an unavailable source retains its schedule',async t=>{
 const {db}=setup(t);
 await savePulsePreferences(viewer,ids,{budget:{mode:'pinned'},safety:{mode:'scheduled',days:[2,4]}},0,db);
 assert.deepEqual((await readPulsePreferences(viewer,['safety'],db)).preferences,{safety:{mode:'scheduled',days:[2,4]}});
 await assert.rejects(savePulsePreferences(viewer,['safety'],{budget:{mode:'pinned'}},1,db),e=>e.status===403);
 const saved=await savePulsePreferences(viewer,['budget'],{budget:{mode:'hidden'}},1,db);
 assert.deepEqual(saved.preferences,{budget:{mode:'hidden'}});
 assert.deepEqual((await readPulsePreferences(viewer,ids,db)).preferences,{safety:{mode:'scheduled',days:[2,4]},budget:{mode:'hidden'}});
 await assert.rejects(savePulsePreferences(viewer,ids,{},1,db),e=>e.status===409);
 await assert.rejects(readPulsePreferences({person:'',id:'attacker'},ids,db),e=>e.status===403);
});
test('only one concurrent settings update wins, even for the initial insert',async t=>{
 const {db}=setup(t); const write=(mode,ver)=>savePulsePreferences(viewer,ids,{safety:{mode}},ver,db);
 for(const ver of [0,1]) {const results=await Promise.allSettled([write('pinned',ver),write('hidden',ver)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);}
});
test('rejects out-of-range or empty schedules, foreign options, and malicious keys',()=>{
 for(const input of [[null],[],[7],[2,2],['0']])assert.throws(()=>validatePulsePreferences({court:{mode:'scheduled',days:input}},ids),/weekday/);
 for(const input of [{court:{mode:'pinned',days:[1]}},{court:{mode:'scheduled',days:[1],user:'other'}},{court:{mode:'later'}}])assert.throws(()=>validatePulsePreferences(input,ids));
 assert.throws(()=>validatePulsePreferences(JSON.parse('{"__proto__":{"mode":"hidden"}}'),['__proto__']),e=>e.status===403);
});
