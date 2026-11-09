import test from 'node:test';import assert from 'node:assert/strict';
import {workPeriodSummary,priorClosedWork,buildWorkEntry,isWorkItem} from '../../lib/year-history/work-periods.ts';
import {filterYear} from '../../lib/year-history/model.ts';
const row=(changes={})=>({id:'work-1',kind:'workOrder',name:'Repair gate',version:1,status:'Requested',...changes});
const ev=(version,at,prior,status)=>({record_id:'work-1',at,version,prior,status,initial:prior===null?1:0});
const year='2027-01-03';
test('only terminal work with a trustworthy prior business-year closure leaves the active queue',()=>{
 assert.equal(priorClosedWork(row({status:'Completed',completedAt:'2027-01-01T03:30:00Z'}),year),true);
 assert.equal(priorClosedWork(row({status:'Completed',completedAt:'2027-01-01T07:30:00Z'}),year),false);
 for(const status of ['Requested','Open','In progress','Waiting','Scheduled','Ready for review'])assert.equal(priorClosedWork(row({status,completedAt:'2026-06-01',dueDate:'2025-12-01'}),year),false);
 assert.equal(priorClosedWork(row({status:'Cancelled',completedAt:'2025-01-01',updatedAt:'2026-01-01',dueDate:'2024-01-01'}),year),false);
 assert.equal(priorClosedWork(row({status:'Cancelled',yearHistoryClosedDate:'2026-12-31'}),year),true);
});
test('a real open → cancelled transition sets closure; a later administrative edit is activity, not a new closure',()=>{
 const r=row({status:'Cancelled',version:4,updatedAt:'2028-02-03',actualCost:27.5,estimatedCost:300,details:'not a report field'});
 const events=[ev(1,'2025-10-01',null,'Requested'),ev(2,'2026-04-02','Requested','Scheduled'),ev(3,'2027-04-01','Scheduled','Cancelled'),ev(4,'2028-02-03','Cancelled','Cancelled')];
 const entry=buildWorkEntry(r,'Work Orders',events,'Example Property');
 assert.equal(entry.closedDate,'2027-04-01');assert.equal(entry.openedDate,'2025-10-01');assert.equal(entry.activityDate,'2028-02-03');assert.equal(entry.amountCents,2750);assert.equal(entry.property,'Example Property');
 assert.deepEqual(entry.openPeriods,[{start:'2025-10-01',end:'2027-04-01'}]);assert.equal(entry.details,undefined);assert(entry.activityDates.includes('2026-04-02'));
 assert.equal(filterYear([entry],{module:'Work Orders',year:2026,view:'activity'},'2028-12-31').total,1);
 assert.equal(filterYear([entry],{module:'Work Orders',year:2027,view:'archive'},'2028-12-31').total,1);
});
test('reopened work stays active and has disjoint historical open intervals',()=>{
 const r=row({version:3,status:'In progress',completedAt:'2025-02-02'});
 const events=[ev(1,'2024-05-10',null,'Requested'),ev(2,'2025-02-02','Requested','Completed'),ev(3,'2027-01-02','Completed','In progress')];
 const entry=buildWorkEntry(r,'Work Orders',events);
 assert.equal(entry.terminal,false);assert.equal(entry.closedDate,undefined);assert.equal(priorClosedWork(r,year),false);
 assert.deepEqual(entry.openPeriods,[{start:'2024-05-10',end:'2025-02-02'},{start:'2027-01-02'}]);
 for(const [y,want] of [[2024,1],[2025,0],[2026,0],[2027,1]])assert.equal(filterYear([entry],{module:'Work Orders',year:y,view:'open-at-close'},'2028-02-01').total,want);
});
test('imported terminal records without closure evidence stay visible; due dates and estimates are never actuals',()=>{
 const closed=row({status:'Completed',dueDate:'2020-02-01',scheduledDate:'2020-02-02',estimatedCost:300});
 const e=buildWorkEntry(closed,'Account Management',[]);assert.deepEqual([e.closedDate,e.openedDate,e.activityDate,e.amountCents],[undefined,undefined,'',undefined]);assert.equal(priorClosedWork(closed,year),false);
 const imported=workPeriodSummary(closed,[ev(1,'2026-01-01',null,'Completed')]);assert.equal(imported.closedDate,undefined);
 assert.equal(isWorkItem(row({derived:true})),false);assert.equal(isWorkItem(row({deletedAt:'2026-01-01'})),false);
});
test('a missing intermediate audit version never implies continuous open status across that gap',()=>{
 const events=[ev(1,'2024-05-05',null,'Open'),ev(4,'2027-06-06','Open','Open')];
 const result=workPeriodSummary(row({kind:'task',status:'Open',version:4}),events);
 assert.deepEqual(result.openPeriods,[{start:'2027-06-06'}]);assert.equal(result.closedDate,undefined);
});
test('history adapter does not access account storage for an unauthorized, disabled or onboarding roster user',async()=>{
 const {workHistory}=await import('../../lib/year-history/work.ts');
 const viewer={person:'synthetic',id:'auth-synthetic',name:'Employee',email:'',role:'Employee',department:'Test',access:[],customAccess:true,owner:false};
 const p={kind:'person',id:'synthetic',version:1,status:'Active'};
 assert.deepEqual(await workHistory(viewer,[p]),[]);
 assert.deepEqual(await workHistory({...viewer,owner:true,onboardingOnly:true},[p]),[]);
 assert.deepEqual(await workHistory({...viewer,owner:true},[{...p,accountStatus:'Disabled'}]),[]);
});
