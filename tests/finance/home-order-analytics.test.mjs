import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {orderFactsSql,projectOrderWeeks,homeOrderAnalytics} from '../../lib/home/order-analytics.ts';
const now=new Date('2026-11-02T18:00:00Z');
const fixture=()=>{const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE account_records(id TEXT PRIMARY KEY, kind TEXT, payload TEXT);CREATE TABLE account_audit(id TEXT, record_id TEXT, at TEXT, before TEXT, after TEXT);');
 let next=0;return {put(id,data,kind='workOrder'){db.prepare('INSERT INTO account_records VALUES (?,?,?)').run(id,kind,JSON.stringify(data));},log(id,at,before,after){db.prepare('INSERT INTO account_audit VALUES (?,?,?,?,?)').run(String(++next),id,at,before?JSON.stringify(before):null,JSON.stringify(after));},read(){return db.prepare(orderFactsSql).all();},db};};
test('Work Orders counts a creation and first completion only once across reopens, updates, and Austin week boundaries',()=>{
 const f=fixture();f.put('order',{status:'Completed',completedAt:'2026-11-02T12:00:00Z'});
 f.log('order','2026-10-25T04:59:00Z',null,{status:'Requested'}); // Sat night in Austin
 f.log('order','2026-11-01T04:50:00Z',{status:'Requested'},{status:'Completed',completedAt:'2026-11-01T04:50:00Z'}); // Sat, Oct 31
 f.log('order','2026-11-02T06:15:00Z',{status:'Completed'},{status:'Completed'});
 f.log('order','2026-11-02T08:00:00Z',{status:'Completed'},{status:'Requested'});
 f.log('order','2026-11-02T12:00:00Z',{status:'Requested'},{status:'Completed'});
 f.put('asset-order',{status:'Completed',requestedAt:'2026-10-26',completedDate:'2026-10-31'});
 f.log('asset-order','2026-11-02T14:00:00Z',{status:'Requested'},{status:'Completed',completedDate:'2026-10-31'}); // actual event beats write time
 const r=projectOrderWeeks(f.read(),now);f.db.close();
 assert.deepEqual(r.weeks.slice(-3),[
 {week:'2026-10-18',opened:1,completed:0,partial:true},
 {week:'2026-10-25',opened:1,completed:2,partial:false},
 {week:'2026-11-01',opened:0,completed:0,partial:true}]);
 assert.equal(r.coverageFrom,'2026-10-24');assert.equal(r.weeks.at(-4).opened,null);
});
test('missing dates are counted separately without substituting due dates; samples, deleted rows, orphaned audits and account tasks are excluded',()=>{
 const f=fixture();f.put('historic',{status:'Completed',requestedAt:'2026-02-30',completedDate:'2026-11-43',dueDate:'2026-10-25',updatedAt:'2026-10-25',scheduledDate:'2026-10-25'});
 f.put('cancel',{status:'Cancelled',requestedAt:'2026-10-25'});f.put('demo-a',{requestedAt:'2026-10-21'});f.put('d',{deletedAt:'2026-10-31',requestedAt:'2026-10-20'});f.put('k',{requestedAt:'2026-10-17'},'task');f.put('test',{trainingSample:true,requestedAt:'2026-10-10'});f.log('orphan','2026-10-12T12:00:00Z',null,{status:'Completed'});
 const out=projectOrderWeeks(f.read(),now);f.db.close();assert.equal(out.coverageFrom,'2026-10-25');assert.equal(out.undatedOpened,1);assert.equal(out.undatedCompleted,1);assert.equal(out.weeks.at(-2).opened,1);assert.equal(out.weeks.at(-2).partial,false);assert.equal(out.weeks.at(-2).completed,0);assert.equal(out.weeks.at(-3).opened,null);
 assert(projectOrderWeeks([],now).weeks.every(w=>w.opened===null&&w.completed===null));
});
test('Work Orders trend returns no data and does not open a storage binding without active employment and the specific order-list grant',async()=>{
 const v={id:'u',person:'p',department:'Dispatch',owner:false,access:[]},p={id:'p',kind:'person',status:'Active'},granted={...v,access:[{module:'Work Orders',tab:'orders',level:'View'}]};
 for(const [viewer,staff] of [[v,[p]],[{...v,access:[{module:'Work Orders',tab:'dashboard',level:'View'}]},[p]],[{...granted,onboardingOnly:true},[p]],[granted,[{...p,status:'Former'}]],[granted,[{...p,accountStatus:'Disabled'}]]])assert.equal(await homeOrderAnalytics(viewer,staff,now),null);
});
