import test from 'node:test';
import assert from 'node:assert/strict';
import { availableWidgets, defaultLayout, validateLayout, restoreLayout } from '../../lib/home/widgets.ts';
import { homeContent } from '../../lib/home/content.ts';
const rec=(id,kind,fields={})=>({id,kind,version:1,...fields});
const employee={id:'auth-one',person:'worker',name:'Worker One',email:'worker@gtowingtransport.com',role:'Employee',department:'Dispatch',owner:false,canManage:false,canRelease:false};
const people=[rec('worker','person',{name:'Worker One',department:'Dispatch',status:'Active',workerType:'Employee',payType:'Hourly',rate:20,email:employee.email}),rec('other','person',{name:'Private Other Person',department:'Drivers',status:'Active',workerType:'Employee',payType:'Hourly',rate:999})];
const clockNow=Date.parse('2026-09-06T15:00:00Z');

test('approvals show one empty message or the pending count and actionable requests',()=>{
 const owner={...employee,owner:true,canManage:true,role:'Owner'};
 const empty=homeContent(owner,people,availableWidgets(owner,people),clockNow).approvals;
 assert.deepEqual(empty,{items:[],empty:'No approvals pending'});
 const records=[...people,rec('request','leaveRequest',{person:'other',status:'Requested',date:'2026-09-07'})];
 const populated=homeContent(owner,records,availableWidgets(owner,records),clockNow).approvals;
 assert.equal(populated.metric,'1');assert.equal(populated.detail,undefined);assert.equal(populated.empty,undefined);
 assert.deepEqual(populated.items.map(item=>item.id),['request']);
 assert.equal(populated.items[0].target.tab,'Requests');
});

test('widget catalog follows exact tab access and role defaults remain selectable',()=>{
 const restricted={...employee,customAccess:true,access:[{module:'Timeclock',tab:'Schedule',level:'View'}]};
 const catalog=availableWidgets(restricted,people),ids=catalog.map(w=>w.id);
 assert.ok(ids.includes('shifts'));assert.ok(!ids.includes('hours'));assert.ok(!ids.includes('time_off'));assert.ok(!ids.includes('payroll'));assert.ok(!ids.includes('bills'));
 assert.deepEqual(validateLayout(defaultLayout(restricted,catalog),catalog),defaultLayout(restricted,catalog));
});
test('saved order, sizes and an intentionally empty Home are preserved; invalid or unauthorized widgets are rejected',()=>{
 const catalog=availableWidgets(employee,people);
 const layout=[{id:'shifts',size:'Wide'},{id:'inbox',size:'Standard'}];
 assert.deepEqual(validateLayout(layout,catalog),layout);assert.deepEqual(validateLayout([],catalog),[]);
 assert.throws(()=>validateLayout([{id:'bills',size:'Standard'}],catalog),/access/);
 assert.throws(()=>validateLayout([layout[0],layout[0]],catalog),/once/);
 assert.throws(()=>validateLayout([{id:'inbox',size:'Gigantic'}],catalog),/valid/);
 assert.throws(()=>validateLayout([{id:'inbox',size:'Standard',person:'other'}],catalog),/valid/);
 assert.throws(()=>validateLayout(Array(25).fill(layout[0]),catalog),/24/);
});
test('revoked widgets disappear when restoring a saved layout',()=>{
 const restricted={...employee,customAccess:true,access:[]};
 assert.deepEqual(restoreLayout([{id:'pay',size:'Wide'},{id:'inbox',size:'Standard'}],availableWidgets(restricted,people)),[{id:'inbox',size:'Standard'}]);
});
test('employee Home returns only their released paystubs, expenses and shifts',()=>{
 const records=[...people,
  rec('mine','shift',{person:'worker',department:'Dispatch',start:'2026-09-06T20:00',end:'2026-09-07T08:00',status:'Published'}),
  rec('theirs','shift',{person:'other',department:'Drivers',start:'2026-09-06T20:00',end:'2026-09-07T08:00',status:'Published'}),
  rec('run','payrun',{status:'Released',period:'2026-08-23',periodEnd:'2026-08-29',lines:[{person:'worker',payment:640},{person:'other',payment:99999}]}),
  rec('draft','payrun',{status:'Draft',period:'2026-08-30',periodEnd:'2026-09-05',lines:[{person:'worker',payment:77777}]}),
  rec('purchase','expense',{person:'worker',date:'2026-09-06',amount:25}),rec('private','expense',{person:'other',date:'2026-09-06',amount:55555}),
 ];
 const content=homeContent(employee,records,availableWidgets(employee,records),clockNow),json=JSON.stringify(content);
 assert.equal(content.pay.items.length,1);assert.equal(content.pay.items[0].value,'$640.00');assert.equal(content.spending.metric,'$25.00');
 assert.deepEqual(content.shifts.items.map(r=>r.id),['mine']);assert.ok(!json.includes('Private Other'));assert.ok(!json.includes('99,999'));assert.ok(!json.includes('77,777'));assert.ok(!json.includes('55,555'));
 assert.equal(content.payroll,undefined);assert.equal(content.team_time,undefined);
});
test('supervisor team widget excludes peers and former employees, and exposes no pay rates',()=>{
 const manager={...employee,person:'manager',role:'Supervisor',customAccess:true,access:[{module:'Timeclock',tab:'Timesheets',level:'View'}]};
 const records=[...people.map(p=>p.id==='worker'?{...p,supervisor:'manager'}:p),rec('former','person',{name:'Former worker',supervisor:'manager',status:'Former',department:'Dispatch'}),rec('time','time',{person:'worker',date:'2026-09-06',hours:42,status:'Approved'})];
 const content=homeContent(manager,records,availableWidgets(manager,records),clockNow);
 assert.deepEqual(content.team_time.items.map(r=>r.id),['worker']);assert.equal(content.team_time.metric,'1');assert.ok(!JSON.stringify(content).includes('rate'));
});
test('email and Slack never pretend to be connected or show seeded messages',()=>{
 const records=[...people,rec('company','settings',{slackUrl:'javascript:alert(1)'})],content=homeContent(employee,records,availableWidgets(employee,records),clockNow);
 assert.equal(content.inbox.status,'Not connected');assert.deepEqual(content.inbox.items,[]);assert.equal(content.slack.status,'Not connected');assert.equal(content.slack.href,undefined);
 assert.ok(content.inbox.href.includes('worker%40gtowingtransport.com'));
});
test('available shifts stay within the employee department and include existing draft openings',()=>{
 const records=[...people,...['Dispatch','Drivers'].map((department,i)=>rec('open-'+i,'shift',{person:'',department,status:'Draft',start:'2026-09-07T20:00',end:'2026-09-08T08:00'}))];
 const content=homeContent(employee,records,availableWidgets(employee,records),clockNow);
 assert.deepEqual(content.open_shifts.items.map(r=>r.id),['open-0']);
});

test('mixed widget sizes validate and older saved widths remain compatible',async()=>{
 const {widgetSpan,validateGrid}=await import('../../lib/home/layout.ts');
 const catalog=availableWidgets(employee,people),mixed=[{id:'inbox',size:'Standard',span:2,height:'Tall'},{id:'pay',size:'Standard',span:1,height:'Short'}];
 assert.deepEqual(validateLayout(mixed,catalog),mixed);
 assert.equal(widgetSpan({id:'inbox',size:'Wide'},3),3);
 assert.equal(widgetSpan({id:'inbox',size:'Standard',span:4},2),2);
 assert.equal(widgetSpan({id:'inbox',size:'Standard',span:0},4),4);
 assert.throws(()=>validateLayout([{id:'inbox',size:'Standard',span:1.5}],catalog),/width/);
 assert.throws(()=>validateLayout([{id:'inbox',size:'Standard',height:'Huge'}],catalog),/height/);
 assert.deepEqual(validateGrid({columns:4,spacing:'Compact'}),{columns:4,spacing:'Compact'});
 assert.throws(()=>validateGrid({columns:1000,spacing:'Compact'}),/columns/);
 assert.throws(()=>validateGrid({columns:'3',spacing:'Comfortable'}),/columns/);
});
test('greeting changes at company-local morning, noon and evening, including daylight saving',async()=>{
 const {greeting}=await import('../../lib/home/layout.ts');
 assert.equal(greeting(' Jerson Arauz ',Date.parse('2026-09-06T10:00:00Z')),'Good Morning, Jerson');
 assert.equal(greeting('Jerson',Date.parse('2026-09-06T17:00:00Z')),'Good Afternoon, Jerson');
 assert.equal(greeting('Jerson',Date.parse('2026-09-06T22:00:00Z')),'Good Evening, Jerson');
 assert.equal(greeting('Jerson',Date.parse('2026-01-06T18:00:00Z')),'Good Afternoon, Jerson');
 assert.equal(greeting('Jerson',Date.parse('2026-09-06T17:00:00Z'),'invalid-zone'),'Good Afternoon, Jerson');
});
