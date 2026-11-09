import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after} from 'node:test';
const temp=await mkdtemp(join(tmpdir(),'cmd-field-home-'));
after(()=>rm(temp,{recursive:true,force:true}));
await build({stdin:{contents:"export * from './lib/home/pulse-field';export {canAccess,grantsFor} from './lib/finance/access';",resolveDir:process.cwd()},outfile:join(temp,'field.cjs'),platform:'node',format:'cjs',bundle:true,external:['cloudflare:workers'],logLevel:'silent'});
const {fieldSignalsFromRows,fieldSignals,canAccess}=createRequire(import.meta.url)(join(temp,'field.cjs'));
const now=new Date('2026-11-02T05:30:00Z'); // 11:30 p.m. Nov 1 in Austin after DST.
const row=(kind,id,name,fields={})=>({kind,id,name,version:1,...fields});
const as=(department,access)=>({id:'auth1',name:'Test Worker',person:'me',department,role:'Employee',owner:false,...(access?{access,customAccess:true}:{})});
const active=[row('person','me','Test Worker',{status:'Active'})];
const grant=(module,tab)=>({module,tab,level:'View'});
const detail=rows=>JSON.stringify(rows);
const fixtures=[
 row('account','pending','In Setup',{status:'Onboarding',launchDate:'2026-11-03',gateCode:'SECRET_A'}),
 row('account','paused','Pause Lot',{status:'Paused',updatedAt:'2026-11-01T21:00:00Z'}),
 row('account','term','Ended Account',{status:'Terminated',updatedAt:'2026-11-01T21:00:00Z'}),
 row('account','active','Released Property',{status:'Active',service:'Full Patrol',onboardingCompletedAt:'2026-11-02T05:00:00Z'}),
 row('account','edited','Edited Account',{status:'Active',updatedAt:'2026-11-01T21:00:00Z',launchDate:'2026-11-01'}),
 row('decision','pw','Pause decision',{accountId:'paused',type:'Pause service',effectiveDate:'2026-10-30'}),
 row('trespass','ctw','Issued CTW Name',{warningStatus:'Issued',incidentDate:'2025-12-15',caseNumber:'SECRET_B',charges:'SECRET_C',vehiclesJson:'[]'}),
 row('safetyUpdate','filed','Case opened',{caseId:'ctw',updatedAt:'2026-10-30T18:22:00Z'}),
 row('trespass','no','Request Only',{warningStatus:'Requested but not issued',updatedAt:'2026-11-01T10:00:00Z',vehiclesJson:'[]'}),
 row('trespass','edited-case','Old Unchanged Warning',{warningStatus:'Issued',version:4,updatedAt:'2026-11-01T10:00:00Z',vehiclesJson:'[]'}),
 row('safetyEvent','arrived','Returned',{caseId:'ctw',encounterDate:'2026-11-01',staffGuidance:'Ask Dispatch for help',raiseAlert:true,details:'SECRET_D'}),
 row('safetyEvent','cleared','Past Encounter',{caseId:'ctw',encounterDate:'2026-10-22',staffGuidance:'Old alert',raiseAlert:true}),
 row('safetyReview','ack','Reviewed',{caseId:'ctw',alertId:'ctw::cleared'})
];
const get=v=>Object.fromEntries(fieldSignalsFromRows(v,active,fixtures,[],now).map(x=>[x.id,x]));
test('a standard driver gets the operational bulletin, never the underlying restricted directory or unissued warnings',()=>{
 const v=as('Drivers'),r=get(v);assert.equal(canAccess(v,'Accounts','overview'),false);assert.equal(canAccess(v,'Home','fieldBriefing'),true);
 assert.equal(r.field_onboarding,undefined);assert.equal(r.field_paused.count,1);assert.equal(r.field_terminated.count,1);assert.equal(r.field_started.count,1);
 assert.equal(r.field_started.items[0].title,'Released Property');assert.equal(r.field_terminated.items[0].at,undefined);
 assert.equal(r.safety_new.count,1);assert.equal(r.safety_new.items[0].title,'Issued CTW Name');assert.equal(r.safety_alerts.count,1);
 assert.deepEqual(r.field_paused.items[0].target,{module:'Home',section:'field_paused'});assert.doesNotMatch(detail(r),/SECRET_|Request Only|Old Unchanged Warning|Edited Account|In Setup|Old alert/);
});
test('custom or revoked field access is enforced prior to returning counts; deliberately shared active staff alerts remain visible',async()=>{
 const none=as('Drivers',[grant('Home','home')]);assert.equal(canAccess(none,'Home','fieldBriefing'),false);
 assert.deepEqual(Object.keys(get(none)),['safety_alerts']);
 const inactive=await fieldSignals(none,[],now,async()=>{throw Error('must not read')});assert.deepEqual(inactive,[]);
 assert.deepEqual(fieldSignalsFromRows({...none,onboardingOnly:true},active,fixtures,[],now),[]);
 await assert.rejects(fieldSignals(none,active,now,async()=>{throw Error('source down')}),/source down/);
});
test('dispatch distinguishes declined warnings from actual issues and can open property profiles',()=>{
 const d=get(as('Dispatch'));assert.equal(d.safety_new.count,2);assert.match(detail(d.safety_new),/Requested but not issued/);
 assert.equal(d.safety_alerts.target.tab,'safety');assert.equal(d.field_started.items[0].target.account,'active');assert.equal(d.field_onboarding,undefined);
 const m=get(as('Administration',[grant('Account Management','accounts')]));assert.equal(m.field_onboarding.count,1);
 assert.equal(m.field_onboarding.items[0].due,'2026-11-03');assert.equal(m.field_onboarding.items[0].target.tab,'accounts');
});
