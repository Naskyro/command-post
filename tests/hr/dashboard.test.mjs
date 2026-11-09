import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHrDashboard} from '../../lib/hr/dashboard.ts';
import {personView} from '../../lib/people/policy.ts';
const r=(id,kind,data={})=>({id,kind,version:1,...data});
const owner={id:'owner-session',person:'owner',name:'Owner',role:'Owner',department:'Operations',owner:true,canManage:true,canRelease:true};
const staff={...owner,id:'staff-session',person:'staff',role:'Employee',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'View'},{module:'Timeclock',tab:'Time off',level:'View'},{module:'Timeclock',tab:'Timesheets',level:'View'}],hrResponsibilities:[]};
const people=[r('staff','person',{name:'Employee',gender:'Female',workerType:'Employee',status:'Active',department:'Dispatch',payType:'Hourly',startDate:'2026-03-01'}),r('other','person',{name:'Other Employee',gender:'Male',workerType:'Employee',status:'Active',department:'Drivers',payType:'Hourly',startDate:'2026-03-01'}),r('former','person',{name:'Former Employee',workerType:'Employee',status:'Former',department:'Drivers',endDate:'2026-09-01'})];
const now=Date.parse('2026-10-27T18:00:00Z');
test('dashboard does not infer gender and scopes people and leave to authorized records',()=>{
 const rows=[...people,r('leave1','leaveRequest',{person:'staff',type:'PTO',date:'2026-10-20',hours:8,status:'Approved',notes:'Private narrative'}),r('leave2','leaveRequest',{person:'other',type:'Sick',date:'2026-10-21',hours:8,status:'Approved'})];
 const mine=buildHrDashboard(staff,rows,now);assert.deepEqual(mine.dashboard.people.map(p=>p.id),['staff']);assert.equal(mine.leaveRequests.length,1);assert.equal(mine.leaveRequests[0].notes,undefined);
 const all=buildHrDashboard(owner,rows,now);assert.equal(all.dashboard.people.find(p=>p.id==='former').gender,undefined);assert.equal(all.dashboard.leaveTrend.at(-1).hours,16);assert.deepEqual(all.dashboard.attrition,[{department:'Drivers',count:1}]);
});
test('overtime chart counts approved worked hours after the weekly threshold, not leave or requests',()=>{
 const rows=[...people,r('time1','time',{person:'staff',date:'2026-10-19',hours:40,status:'Approved'}),r('time2','time',{person:'staff',date:'2026-10-20',hours:5,status:'Approved'}),r('draft','time',{person:'staff',date:'2026-10-21',hours:10,status:'Draft'}),r('leave','leaveRequest',{person:'staff',date:'2026-10-22',hours:8,status:'Approved'}),r('request','overtime',{person:'staff',date:'2026-10-20',hours:12,decision:'Approved'})];
 assert.equal(buildHrDashboard(owner,rows,now).dashboard.overtimeTrend.at(-1).hours,5);
 assert.equal(buildHrDashboard(owner,people,now).dashboard.timeDataAvailable,false);
});
test('catalog and compensation access cannot reveal another employee gender',()=>{
 const delegated={...staff,hrResponsibilities:[{action:'managePositions',scope:'Company'},{action:'manageCompensation',scope:'Company'}]};
 assert.equal(personView(people[1],delegated,people,'hr').gender,undefined);assert.equal(personView(people[0],staff,people,'hr').gender,'Female');assert.equal(personView(people[1],owner,people,'finance').gender,undefined);
 assert.deepEqual(buildHrDashboard(delegated,people,now).dashboard.people.map(p=>p.id),['staff']);
});
