import test from 'node:test';
import assert from 'node:assert/strict';
import {overtimeHours,overtimeSummary,visibleOvertime,canReviewOvertime} from '../../lib/finance/overtime.ts';
import {validateTime} from '../../lib/finance/time-validation.ts';
import {deriveTime} from '../../lib/finance/timeclock.ts';
const row=(id,kind,extra={})=>({id,kind,version:0,...extra});
const worker=row('p','person',{name:'Worker',department:'Dispatch',status:'Active',supervisor:'super',workerType:'Employee',payType:'Hourly',rate:20,exempt:false});
const employee={id:'p',person:'p',name:'Worker',role:'Employee',department:'Dispatch',owner:false,canManage:false,canRelease:false};
const supervisor={...employee,id:'super',person:'super',role:'Supervisor'};
const now=Date.parse('2026-09-04T22:00:00Z');
const time=hours=>row('time','time',{person:'p',date:'2026-09-03',hours,status:'Draft'});
const request=(extra={})=>row('request','overtime',{person:'p',date:'2026-09-04',hours:3,decision:'Pending',status:'Pending',requestType:'Extra earning opportunity',explanation:'',...extra});
test('exactly 40 hours does not trigger overtime; running time is included with wage estimate',()=>{
 assert.equal(overtimeHours(40.000000000004),0);
 assert.equal(overtimeSummary(worker,[time(40)],now).hours,0);
 const c=row('clock','clock',{person:'p',status:'Running',startedAt:'2026-09-04T20:00:00Z'});
 const result=overtimeSummary(worker,[time(40),c],now);
 assert.equal(result.hours,2);assert.equal(result.cost,60);assert.equal(result.running,true);assert.equal(result.start,'2026-08-30');
 assert.equal(overtimeSummary(worker,[time(39)],now).hours,0);
});
test('overtime clock respects meals, Central workweek boundary and time corrections',()=>{
 const clock=row('clock','clock',{person:'p',status:'Running',startedAt:'2026-09-04T19:30:00Z',breaks:[{start:'2026-09-04T20:00:00Z',end:'2026-09-04T20:30:00Z',unpaid:true,dutyFree:true}]});
 assert.equal(overtimeSummary(worker,[time(40),clock],now).hours,2);
 const midnight=Date.parse('2026-09-06T06:00:00Z'),overnight={...clock,breaks:[],startedAt:'2026-09-06T03:00:00Z'};
 assert.equal(overtimeSummary(worker,[time(40),overnight],midnight).hours,0);
 const corrected=deriveTime([time(40),row('fix','timeCorrection',{person:'p',date:'2026-09-03',timeId:'time',hours:37,status:'Approved'})]);
 assert.equal(overtimeSummary(worker,[...corrected,clock],now).hours,0);
});
test('approved additional earnings affect estimates; nonexempt salaries require a verified overtime rate',()=>{
 const earnings=row('bonus','earning',{person:'p',date:'2026-09-03',status:'Approved',amount:420});
 assert.equal(overtimeSummary(worker,[time(42),earnings],now).cost,90);
 const salary={...worker,payType:'Salary + commission',rate:1000};
 assert.equal(overtimeSummary(salary,[time(42)],now).cost,null);
 assert.equal(overtimeSummary({...salary,overtimeEstimateRate:37.5},[time(42)],now).cost,75);
 assert.equal(overtimeSummary({...worker,date:'2026-09-02'},[time(42)],now).cost,null);
});
test('alerts only contain eligible employees visible to the employee or supervisor',()=>{
 const records=[worker,time(42),{...worker,id:'outsider',supervisor:'other'},{...worker,id:'exempt',exempt:true,payType:'Salary exempt'},{...worker,id:'contractor',workerType:'Contractor'}];
 assert.deepEqual(visibleOvertime(supervisor,records,now).map(r=>r.person),['p']);
 assert.deepEqual(visibleOvertime(employee,records,now).map(r=>r.person),['p']);
 assert.equal(visibleOvertime({...supervisor,access:[{module:'Timeclock',tab:'Schedule',level:'View'}]},records,now).length,0);
 assert(!JSON.stringify(visibleOvertime(supervisor,records,now)).includes('payType'));
});
test('employee may request extra earning hours without disclosing personal financial details',()=>{
 const r=request();validateTime(r,undefined,employee,[worker]);assert.equal(r.status,'Pending');assert.equal(r.supervisor,'super');assert.equal(r.submittedBy,'p');
 for(const hours of [0,-1,NaN,129])assert.throws(()=>validateTime(request({hours}),undefined,employee,[worker]));
 assert.throws(()=>validateTime(request({date:'2026-02-30'}),undefined,employee,[worker]));
 assert.throws(()=>validateTime(request(),undefined,employee,[{...worker,exempt:true,payType:'Salary exempt'}]),/nonexempt/);
});
test('review requires another supervisor and cannot change the requested facts or a saved decision',()=>{
 const pending=request({version:1});
 const approved={...pending,decision:'Approved',reviewNote:'Coverage available.'};
 validateTime(approved,pending,supervisor,[worker]);assert.equal(approved.status,'Reviewed');assert.equal(approved.reviewedBy,supervisor.name);
 assert.equal(canReviewOvertime({...supervisor,person:'p',owner:true,canManage:true},'p',[worker]),false);
 assert.throws(()=>validateTime({...pending,decision:'Approved'},pending,{...employee,owner:true,canManage:true},[worker]),/own overtime/);
 assert.throws(()=>validateTime({...pending,decision:'Approved',hours:5,reviewNote:'Ok'},pending,supervisor,[worker]),/as submitted/);
 assert.throws(()=>validateTime({...approved,hours:4},approved,supervisor,[worker]),/saved/);
 assert.throws(()=>validateTime({...pending,decision:'Approved'},pending,{...supervisor,access:[{module:'Timeclock',tab:'Requests',level:'View'}]},[worker]),/supervisor/);
});
