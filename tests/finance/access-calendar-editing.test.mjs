import test from 'node:test';
import assert from 'node:assert/strict';
import {personView,safePersonHistory,boundedGrants,validateRole,validateProfile,normalizePerson,canEditAccess,sanitizeFields} from '../../lib/people/policy.ts';
import {visible} from '../../lib/finance/visibility.ts';
import {recordAccess,canAccess} from '../../lib/finance/access.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {daySegments,overlapGroups} from '../../lib/finance/calendar.ts';
import {configuredWeek,validatePayrollPolicy} from '../../lib/finance/payroll-calendar.ts';
import {quickPatch,quickField,needsCashReview,validateCategory,validateTransaction,expenseGroups} from '../../lib/finance/quick-edit.ts';
import {readPayload,safeFailure,ForbiddenError} from '../../lib/shared/errors.ts';
const rec=(id,kind,fields={})=>({id,kind,version:1,...fields});
const person=rec('braden','person',{name:'Braden Martinelli',title:'Operations Coordinator',role:'Employee',department:'Operations',supervisor:'austin',workerType:'Employee',status:'Active',email:'braden@gtowingtransport.com',payType:'Hourly',rate:25,netTarget:0,notes:'Private pay notes',accessMode:'Custom',access:[],userId:'braden-auth'});
const austin=rec('austin','person',{name:'Austin',title:'Director of Operations',role:'Department Head',department:'Operations',status:'Active',email:'austin@gtowingtransport.com',netTarget:1500});
const company=rec('company','settings',{payrollBaseline:15000,payrollPolicies:[],taxTreatment:'Private tax information'});
const department=rec('dept','department',{name:'Operations',head:'austin'});
const owner={id:'owner',person:'jerson',name:'Jerson',role:'Owner',department:'Operations',owner:true,canManage:true,canRelease:true};
const admin={...owner,id:'it',person:'it',name:'IT',role:'Supervisor',owner:false,canManage:false,canRelease:false,customAccess:true,access:[{module:'Admin',tab:'users',level:'Edit'}]};
const manager={...admin,id:'austin',person:'austin',name:'Austin',role:'Department Head',canRelease:true,access:[{module:'People & HR',tab:'hiring',level:'Edit'},{module:'People & HR',tab:'people',level:'Edit'},{module:'Admin',tab:'users',level:'Edit'},{module:'Finance',tab:'Payroll',level:'View'},{module:'Timeclock',tab:'Schedule',level:'Edit'}]};
const records=[person,austin,company,department];
test('Admin and HR profile payloads contain no pay amounts, bank access, or private pay notes even for owners',()=>{
 for(const surface of ['admin','hr','timeclock']){const projected=personView(person,owner,records,surface);for(const k of ['rate','netTarget','payType','notes'])assert.equal(projected[k],undefined,surface+' leaked '+k);}
 assert.equal(personView(person,manager,records).rate,25);
 assert.equal(personView(person,admin,records).rate,undefined);
 assert.equal(personView(person,owner,records,'hr').access,undefined);
});
test('Admin audit does not disclose salary-only edits, previous salary, or financial reasons',()=>{
 const after={...person,rate:30,version:2,updatedAt:'2026-09-05'};const salary={id:'a',reason:'Raised hourly pay to 30',before:JSON.stringify(person),after:JSON.stringify(after)};
 assert.deepEqual(safePersonHistory([salary],admin,records,'admin'),[]);
 const mixed={...salary,after:JSON.stringify({...after,role:'Supervisor'})};const text=JSON.stringify(safePersonHistory([mixed],admin,records,'admin'));assert.ok(!text.includes('Raised hourly'));assert.ok(!text.includes('Private pay notes'));assert.ok(!text.includes('"rate"'));
});
test('delegated access cannot exceed actor tab, edit, or role ceiling; self-escalation is rejected',()=>{
 assert.throws(()=>boundedGrants([{module:'Finance',tab:'Payroll',level:'Edit'}],manager),/above/);
 assert.throws(()=>boundedGrants([{module:'Finance',tab:'Settings',level:'View'}],manager),/above/);
 assert.throws(()=>boundedGrants([{module:'Finance',tab:'nonsense',level:'View'}],owner),/Invalid/);
 assert.throws(()=>validateRole('Department Head',admin,'new'),/above/);
 assert.throws(()=>validateRole('Owner',owner,'random'),/reserved/);
 assert.equal(canEditAccess(manager,austin,records),false);assert.equal(canEditAccess(manager,person,records),true);
 assert.equal(canEditAccess(admin,person,records),false);
 assert.throws(()=>sanitizeFields({rate:500},['role','access']),/cannot change/);
});
test('new hire mailboxes share both company aliases and reporting chain cannot loop or escape',()=>{
 const next={...person,id:'new',name:'New hire',email:'new@parkingtowingenforcement.com'};validateProfile(next,undefined,manager,records);assert.deepEqual(next.emailAliases,['new@gtowingtransport.com']);
 assert.throws(()=>validateProfile({...next,email:'braden@parkingtowingenforcement.com'},undefined,manager,records),/belongs/);
 assert.throws(()=>validateProfile({...next,supervisor:'outside'},undefined,manager,records),/team/);
 assert.throws(()=>validateProfile({...person,supervisor:'braden'},person,owner,records),/loop/);
 assert.throws(()=>validateProfile({...next,name:['not a name']},undefined,manager,records),/Invalid name/);
});
test('Operations payroll release follows the assigned head, not a title or arbitrary module grant',()=>{
 const headers=new Headers({'oai-authenticated-user-email':austin.email});assert.equal(financeIdentity(headers,records).canRelease,true);
 assert.equal(financeIdentity(headers,[person,austin,{...department,head:'braden'}]).canRelease,false);
 assert.equal(normalizePerson({...austin,role:'Director of Operations'}).role,'Department Head');
 assert.throws(()=>financeIdentity(headers,[{...austin,status:'Onboarding'}]),e=>e.status===403);
 assert.throws(()=>financeIdentity(headers,[{...austin,accountStatus:'Disabled'}]),e=>e.status===403);
});
test('Timeclock responses omit all pay inputs and private attachments but include effective calendar',()=>{
 const v={...manager,access:[{module:'Timeclock',tab:'Schedule',level:'Edit'}]};const all=[...records,rec('tax','taxInput',{person:'braden',federal:50}),rec('f','file',{parent:'braden',name:'Private salary agreement.pdf'})];
 const text=JSON.stringify(visible(v,all,'timeclock'));assert.ok(!text.includes('netTarget'));assert.ok(!text.includes('Private salary'));assert.ok(!text.includes('federal'));assert.ok(!text.includes('taxTreatment'));assert.ok(text.includes('payrollPolicies'));
});
test('self-service permissions do not grant all workers pay, category changes, or tax document drafts',()=>{
 const v={...admin,person:'braden',role:'Employee',access:undefined,customAccess:false};const all=[...records,rec('run','payrun',{status:'Released',lines:[{person:'braden',payment:100},{person:'austin',payment:1500}]}),rec('draft','yearDocument',{person:'braden',status:'Draft'}),rec('released','yearDocument',{person:'braden',status:'Released'})];const view=visible(v,all);assert.equal(view.find(r=>r.id==='run').lines.length,1);assert.equal(view.some(r=>r.id==='draft'),false);assert.equal(view.some(r=>r.id==='released'),true);assert.equal(recordAccess(v,rec('c','category'),true),false);assert.equal(canAccess(v,'Finance','Payroll'),false);
});
test('overnight calendar clips midnight portions once and adjacent shifts do not overlap lanes',()=>{
 const shifts=[rec('night','shift',{start:'2026-09-06T20:00',end:'2026-09-07T08:00'}),rec('day','shift',{start:'2026-09-07T08:00',end:'2026-09-07T16:00'})];
 assert.deepEqual(daySegments(shifts,'2026-09-06').map(s=>[s.start,s.end,s.continues]),[[1200,1440,true]]);
 assert.deepEqual(daySegments(shifts,'2026-09-07').map(s=>[s.start,s.end,s.lane,s.lanes]),[[0,480,0,1],[480,960,0,1]]);
 const overlap=daySegments([...shifts,rec('extra','shift',{start:'2026-09-07T09:00',end:'2026-09-07T12:00'})],'2026-09-07');assert.equal(overlap[1].lanes,2);assert.equal(overlap[2].lane,1);
});
test('crowded weeks keep all seven shifts in one group and day lanes remain individually addressable',()=>{
 const shifts=Array.from({length:7},(_,i)=>rec('worker-'+i,'shift',{start:'2026-09-07T09:00',end:'2026-09-07T17:00'}));
 const segments=daySegments(shifts,'2026-09-07'),groups=overlapGroups(segments);
 assert.equal(groups.length,1);assert.equal(groups[0].segments.length,7);
 assert.deepEqual([groups[0].start,groups[0].end],[540,1020]);
 assert.equal(new Set(segments.map(s=>s.lane)).size,7);
 assert.ok(segments.every(s=>s.lanes===7));
 assert.deepEqual(groups[0].segments.map(s=>s.record.id),shifts.map(s=>s.id));
});
test('week groups merge connected overlaps but keep adjoining, cancelled and overnight shifts distinct',()=>{
 const shifts=[
  rec('night','shift',{start:'2026-09-06T20:00',end:'2026-09-07T08:00'}),
  rec('day','shift',{start:'2026-09-07T08:00',end:'2026-09-07T16:00'}),
  rec('overlap','shift',{start:'2026-09-07T15:00',end:'2026-09-07T18:00'}),
  rec('late','shift',{start:'2026-09-07T17:00',end:'2026-09-07T19:00'}),
  rec('cancelled','shift',{start:'2026-09-07T00:00',end:'2026-09-08T00:00',status:'Cancelled'}),
 ];
 const segments=daySegments(shifts,'2026-09-07'),original=segments.map(s=>s.record.id);
 const groups=overlapGroups([...segments].reverse());
 assert.deepEqual(groups.map(g=>[g.start,g.end,g.segments.length]),[[0,480,1],[480,1140,3]]);
 assert.equal(groups[0].segments[0].continued,true);
 assert.deepEqual(segments.map(s=>s.record.id),original);
 assert.deepEqual(overlapGroups([]),[]);
});
test('future payroll calendar preserves history, creates an explicit bridge, and rejects impossible or released dates',()=>{
 const policy={effective:'2026-09-14',startDay:1,payDelayDays:5};validatePayrollPolicy(policy,company,[],'2026-09-05');const c={...company,payrollPolicies:[policy]};
 assert.equal(configuredWeek('2026-09-05',c).start,'2026-08-30');assert.deepEqual(configuredWeek('2026-09-13',c),{start:'2026-09-13',end:'2026-09-13',payday:'2026-09-19',transition:true});assert.deepEqual(configuredWeek('2026-09-15',c),{start:'2026-09-14',end:'2026-09-20',payday:'2026-09-25',transition:false});
 assert.throws(()=>validatePayrollPolicy({...policy,effective:'2026-02-31'},company,[],'2026-01-01'),/future/);
 assert.throws(()=>validatePayrollPolicy(policy,company,[rec('run','payrun',{status:'Released',periodEnd:'2026-09-20'})],'2026-09-05'),/reviewed payroll/);
 assert.throws(()=>configuredWeek('2026-02-31'),/valid/);
});
test('quick edits accept established categories and nonnegative plans, while finalized records remain locked',()=>{
 const cats=[rec('fuel','category',{name:'Fuel',status:'Active',accountType:'Expense',accountCode:'C-FUEL'})],tx=rec('t','transaction',{description:'Fuel',amount:-50,category:'Fuel'});
 assert.equal(quickPatch(tx,'category','Fuel',cats).accountCode,'C-FUEL');assert.throws(()=>quickPatch(tx,'category','Made up',cats),/option/);
 assert.throws(()=>quickPatch(rec('d','debt',{payment:10}),'payment',-1,[]),/zero/);
 assert.equal(quickPatch(rec('d','debt',{payment:10}),'payment',500,[]).payment,500);assert.equal(quickField(rec('d','debt',{status:'Paid'}),'payment',[]),undefined);
});
test('cash review requires attribution and purpose and transfers are not treated as expenses',()=>{
 const tx=rec('t','transaction',{description:'ATM Withdrawal 09/04',amount:-500,category:'Bank Withdrawal'}),cats=[rec('c','category',{name:'Bank Withdrawal',accountType:'Transfer'}),rec('f','category',{name:'Fuel',accountType:'Expense'})];
 assert.equal(needsCashReview(tx),true);assert.throws(()=>validateTransaction({...tx,cashReviewed:true},undefined,cats),/responsible person/);
 const done={...tx,person:'braden',cashPurpose:'Fund repairs',cashDestination:'Bag 25',cashReviewed:true};validateTransaction(done,tx,[...cats,person]);assert.equal(needsCashReview(done),false);
 assert.deepEqual(expenseGroups([tx,rec('f','transaction',{amount:-70,category:'Fuel'})],cats,'Category'),[{name:'Fuel',amount:70}]);
});
test('No budget and a zero budget are distinct; duplicate categories and invalid amounts fail',()=>{
 const c=rec('c','category',{name:'Fuel',accountType:'Expense',budgetMode:'No budget set'});validateCategory(c,[]);validateCategory({...c,budgetMode:'Monthly budget',budgetAmount:0},[]);
 assert.throws(()=>validateCategory({...c,budgetMode:'Monthly budget',budgetAmount:''},[]),/monthly budget/);assert.throws(()=>validateCategory(c,[{...c,id:'other',name:'fuel'}]),/already exists/);
});
test('request parsing rejects cross-site, malformed and oversized inputs; errors hide storage internals',async()=>{
 const req=(body,headers={})=>new Request('https://example.com/api',{method:'POST',headers:{'content-type':'application/json',...headers},body});
 await assert.rejects(readPayload(req('{}',{'sec-fetch-site':'cross-site'})),/Cross-site/);await assert.rejects(readPayload(req('{bad')),/valid JSON/);await assert.rejects(readPayload(req('[]')),/record object/);await assert.rejects(readPayload(req('x'.repeat(400001))),/too large/);
 assert.equal(safeFailure(new ForbiddenError(),'test').status,403);const error=safeFailure(new Error('D1_ERROR private SQL details'),'test');assert.equal(error.status,503);assert.ok(!error.body.error.includes('private SQL'));
});
