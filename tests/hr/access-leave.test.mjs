import test from 'node:test';
import assert from 'node:assert/strict';
import {hrCan,boundedHrResponsibilities} from '../../lib/hr/permissions.ts';
import {benefitEligibility,ptoAccrual,ptoRate,approvedHoursLimit} from '../../lib/hr/leave.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {canAccess,grantsFor} from '../../lib/finance/access.ts';
import {prepareStaffName} from '../../lib/people/names.ts';
import {personView,canReadPay,validateProfile} from '../../lib/people/policy.ts';
import {resolveDepartmentLabels,departmentFor,activeDepartments,canManageDepartments} from '../../lib/people/departments.ts';
import {clockSegments,departmentGaps} from '../../lib/finance/timeclock.ts';
import {validateTime} from '../../lib/finance/time-validation.ts';
import {payrollLine} from '../../lib/finance/model.ts';
const r=(id,kind,data={})=>({id,kind,version:0,...data});
const person=r('employee','person',{name:'Employee',email:'employee@example.com',workerType:'Employee',employmentClass:'Full-Time',status:'Active',department:'Dispatch',departmentId:'department-1',role:'Employee',supervisor:'supervisor',startDate:'2026-01-01',payType:'Hourly',rate:20,exempt:false});
const supervisor=r('supervisor','person',{name:'Supervisor',department:'Dispatch',supervisor:'owner'});
const outsider={...person,id:'outsider',name:'Other Worker',supervisor:'other',department:'Drivers'};
const records=[person,supervisor,outsider,r('owner','person',{name:'Owner'}),r('department-1','department',{name:'Dispatch'}),r('department-2','department',{name:'Drivers'})];
const viewer={id:'supervisor-session',person:'supervisor',name:'Supervisor',role:'Supervisor',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'Edit'},{module:'People & HR',tab:'pay',level:'Edit'},{module:'Timeclock',tab:'Requests',level:'Edit'},{module:'Timeclock',tab:'Time off',level:'Edit'}],hrResponsibilities:[]};
const owner={...viewer,id:'owner-session',person:'jerson',owner:true,canManage:true,role:'Owner'};
const staff={...viewer,id:'employee-session',person:'employee',role:'Employee',access:grantsFor(person)};
const grant=(action,scope)=>({...viewer,hrResponsibilities:[{action,scope}]});
const time=(id,date,hours,status='Approved')=>r(id,'time',{person:'employee',date,hours,status});

test('explicit responsibility and reporting scope both apply without relying on manager title',()=>{
 assert.equal(hrCan(viewer,'managePersonnel','employee',records),false);
 const assigned={...grant('managePersonnel','Team'),role:'Employee'};
 assert.equal(hrCan(assigned,'managePersonnel','employee',records),true);
 assert.equal(hrCan(assigned,'managePersonnel','outsider',records),false);
 assert.equal(hrCan({...assigned,access:[]},'managePersonnel','employee',records),false);
 assert.equal(hrCan(grant('managePersonnel','Company'),'managePersonnel','outsider',records),true);
 assert.equal(hrCan(grant('managePersonnel','Department'),'managePersonnel','outsider',records),false);
});
test('self decisions and owner self I-9 verification are blocked',()=>{
 assert.equal(hrCan({...staff,hrResponsibilities:[{action:'approveStart',scope:'Company'}]},'approveStart','employee',records),false);
 assert.equal(hrCan(owner,'verifyI9','jerson',records),false);
 assert.equal(hrCan(owner,'managePersonnel','employee',records),true);
});
test('delegation cannot broaden scope or escape the grantor reporting chain',()=>{
 const delegated=boundedHrResponsibilities([{action:'managePersonnel',scope:'Team'}],grant('managePersonnel','Team'),person,records);
 assert.equal(delegated[0].scope,'Team');
 assert.throws(()=>boundedHrResponsibilities([{action:'managePersonnel',scope:'Company'}],grant('managePersonnel','Team'),person,records));
 assert.throws(()=>boundedHrResponsibilities([{action:'managePersonnel',scope:'Team'}],grant('managePersonnel','Team'),outsider,records));
 assert.throws(()=>boundedHrResponsibilities([{action:'managePersonnel',scope:'Team'}],grant('managePersonnel','Department'),person,records));
 assert.throws(()=>boundedHrResponsibilities([{action:'constructor',scope:'Company'}],owner,person,records));
});
test('company compensation assignees can read outside their team without receiving personnel notes',()=>{
 const v=grant('manageCompensation','Company');
 assert.equal(canReadPay(v,outsider,records),true);
 const notes={...outsider,profileNotes:'Confidential supervisor note'};
 assert.equal(personView(notes,v,records,'hr').profileNotes,undefined);
 assert.equal(personView({...person,profileNotes:'Internal'},staff,records,'hr').profileNotes,undefined);
});
test('onboarding identities are restricted even if a stale profile says Active or grants Finance',()=>{
 const p={...person,status:'Active',onboardingRequired:true,accountStatus:'Onboarding',accessMode:'Custom',access:[{module:'Finance',tab:'Payroll',level:'Edit'}],hrResponsibilities:[{action:'approveStart',scope:'Company'}]};
 const headers=new Headers({'oai-authenticated-user-email':person.email});
 assert.throws(()=>financeIdentity(headers,[p]),e=>e.status===403);
 const v=financeIdentity(headers,[p],{allowOnboarding:true});
 assert.equal(v.onboardingOnly,true);assert.deepEqual(v.hrResponsibilities,[]);
 assert.equal(canAccess(v,'Finance','Payroll'),false);assert.equal(canAccess(v,'People & HR','hiring'),true);
 assert.equal(hrCan(v,'approveStart','employee',[p]),false);
 assert.equal(financeIdentity(headers,[{...p,onboardingClearedAt:'2026-10-25T12:00:00Z',accountStatus:'Enabled'}]).onboardingOnly,false);
 assert.equal(financeIdentity(headers,[{...person,onboardingStatus:'Historical Records Pending'}]).onboardingOnly,false);
});
test('personal email is accepted while arbitrary company aliases and invalid dates are not',()=>{
 const draft={...person,id:'new',email:'newhire@gmail.com',companyEmail:'newhire@gtowingtransport.com'};
 validateProfile(draft,undefined,owner,records);assert.equal(draft.email,'newhire@gmail.com');assert.deepEqual(draft.emailAliases,[]);
 assert.throws(()=>validateProfile({...draft,companyEmail:'other@gmail.com'},undefined,owner,records),/company mailbox/);
 assert.throws(()=>validateProfile({...draft,startDate:'2026-02-30'},undefined,owner,records),/valid/);
});
test('department renaming preserves stable identity, aliases, module rights and payroll authority',()=>{
 const dept=r('department-1','department',{name:'Dispatch Services',aliases:['Dispatch'],status:'Active'});
 const ops=r('department-0','department',{name:'Operations Support',aliases:['Operations'],head:'opshead'});
 const employee={...person,departmentId:undefined};
 const opshead={...person,id:'opshead',email:'ops@example.com',role:'Department Head',department:'Operations',departmentId:undefined};
 const normalized=resolveDepartmentLabels([dept,ops,employee,opshead]);
 const p=normalized.find(x=>x.id==='employee');assert.equal(p.department,'Dispatch Services');assert.equal(p.departmentId,'department-1');
 assert.ok(grantsFor(p).some(g=>g.module==='Accounts'));
 const v=financeIdentity(new Headers({'oai-authenticated-user-email':'ops@example.com'}),normalized);assert.equal(v.canRelease,true);assert.ok(canAccess(v,'Finance','Payroll',true));
 assert.equal(departmentFor(normalized,'Dispatch').id,'department-1');assert.equal(activeDepartments([...normalized,r('retired','department',{name:'Retired',status:'Retired'})]).length,2);
 assert.equal(canManageDepartments({...grant('manageSettings','Company'),access:[{module:'Admin',tab:'departments',level:'Edit'}]},normalized),true);
 assert.equal(departmentGaps([dept],'2026-09-01','2026-09-02','Dispatch Services').length,1);
});
test('PTO uses approved work capped at 40 hours and never paid leave',()=>{
 const entries=[time('a','2026-09-01',24),time('b','2026-09-02',20),time('draft','2026-09-03',8,'Draft'),r('pto','leaveRequest',{person:person.id,type:'PTO',hours:8,date:'2026-09-04',status:'Approved'}),r('sick','leaveRequest',{person:person.id,type:'Sick',hours:8,date:'2026-09-05',status:'Approved'})];
 const result=ptoAccrual(person,entries,'2026-08-30','2026-09-05');assert.equal(result.eligibleWorkedHours,40);assert.equal(result.earnedHours,2.308);
 assert.equal(ptoAccrual(person,entries,'2026-09-02','2026-09-05').eligibleWorkedHours,16);
 assert.equal(ptoAccrual({...person,payType:'Salary exempt',exempt:true},entries,'2026-08-30','2026-09-05').earnedHours,2.768);
});
test('paid break time accrues PTO and anniversary rate changes follow the hire date',()=>{
 const clock=r('clock','clock',{person:person.id,startedAt:'2026-09-01T13:00:00Z',stoppedAt:'2026-09-01T21:00:00Z',breaks:[{start:'2026-09-01T17:00:00Z',end:'2026-09-01T18:00:00Z',paid:true}]});
 const worked=clockSegments(clock)[0].hours;assert.ok(Math.abs(worked-8)<1e-8);
 assert.equal(ptoAccrual(person,[time('paidbreak','2026-09-01',worked)],'2026-08-30','2026-09-05').earnedHours,.4616);
 assert.equal(ptoRate({...person,startDate:'2025-09-03'},'2026-09-02'),.0577);assert.equal(ptoRate({...person,startDate:'2025-09-03'},'2026-09-03'),.0769);
});
test('part-time, temporary and seasonal do not earn company benefits; unknown classifications remain pending',()=>{
 for(const employmentClass of ['Part-Time','Temporary','Seasonal']){assert.equal(benefitEligibility({...person,employmentClass}).eligible,false);assert.equal(ptoAccrual({...person,employmentClass},[time('t','2026-09-01',40)],'2026-08-30','2026-09-05').earnedHours,0);}
 assert.equal(benefitEligibility({...person,employmentClass:undefined}).pending,true);
});
test('reaching an approved hours limit never changes the running clock and partial authorizations extend it',()=>{
 const now=Date.parse('2026-09-04T22:00:00Z'),clock=r('clock','clock',{person:person.id,status:'Running',startedAt:'2026-09-04T20:00:00Z'}),entries=[time('t','2026-09-03',40),clock];
 const snapshot=JSON.stringify(entries);const status=approvedHoursLimit({...person,exempt:true},entries,now);
 assert.equal(status.worked,42);assert.equal(status.reached,true);assert.equal(status.unauthorizedHours,2);assert.equal(JSON.stringify(entries),snapshot);
 const partial=r('approval','overtime',{person:person.id,date:'2026-09-04',hours:8,approvedHours:3,decision:'Approved'});
 const updated=approvedHoursLimit(person,[...entries,partial],now);assert.equal(updated.limit,43);assert.equal(updated.reached,false);
});
test('supervisor can partially approve exempt additional work without granting overtime wages or automatic leave credits',()=>{
 const exempt={...person,exempt:true,payType:'Salary exempt'};
 const pending=r('request','overtime',{person:person.id,date:'2026-09-04',hours:8,decision:'Pending',status:'Pending',requestType:'Coverage needed'});
 validateTime({...pending},undefined,staff,[exempt]);
 const approved={...pending,decision:'Approved',approvedHours:3,reviewNote:'Three coverage hours authorized'};validateTime(approved,pending,viewer,[exempt]);assert.equal(approved.approvedHours,3);assert.equal(approved.kind,'overtime');
 assert.throws(()=>validateTime({...approved,approvedHours:9},pending,viewer,[exempt]),/no more than/);
 assert.throws(()=>validateTime({...approved},pending,{...owner,person:person.id},[exempt]),/own additional hours/);
});
test('unpaid time off requires approved coverage for benefit-ineligible employees',()=>{
 const part={...person,employmentClass:'Part-Time'},replacement={...person,id:'replacement'};
 const request=r('leave','leaveRequest',{person:person.id,date:'2026-09-04',type:'Unpaid',hours:8,status:'Requested'});
 validateTime({...request},undefined,staff,[part]);
 assert.throws(()=>validateTime({...request,status:'Approved'},request,viewer,[part,replacement]),/coverage/);
 const approved={...request,status:'Approved',coveragePerson:'replacement',coverageConfirmed:true};validateTime(approved,request,viewer,[part,replacement]);assert.equal(approved.reviewedBy,'Supervisor');
 assert.throws(()=>validateTime({...request,type:'PTO'},undefined,staff,[part]),/unpaid time off/);
});
test('protected leave receives individual review without the ordinary coverage gate or automatic paid classification',()=>{
 const part={...person,employmentClass:'Part-Time'},request=r('leave','leaveRequest',{person:person.id,date:'2026-09-04',type:'Protected Leave Review',hours:8,status:'Requested'});
 validateTime(request,undefined,staff,[part]);assert.equal(request.protectedReviewRequired,true);
 assert.throws(()=>validateTime({...request,status:'Approved'},request,viewer,[part]),/personnel reviewer/);
 const approved={...request,status:'Approved',protectedReviewCompleted:true};validateTime(approved,request,grant('managePersonnel','Team'),[part]);
 const line=payrollLine(part,[approved,time('t','2026-09-03',8)],'2026-08-30','2026-09-05');assert.equal(line.leaveHours,0);assert.ok(line.issues.some(x=>x.includes('protected leave')));
});

test('directory-only additions cannot bypass first-clock clearance while existing names remain unchanged',()=>{
 const added=prepareStaffName({action:'add',name:'New Directory Worker',department:'Dispatch',title:'Dispatcher'},records,owner).next;
 assert.equal(added.onboardingRequired,true);assert.equal(added.directoryOnly,true);assert.equal(added.accountStatus,'Disabled');
 const headers=new Headers({'oai-authenticated-user-email':'directory@example.com'});
 assert.throws(()=>financeIdentity(headers,[{...added,email:'directory@example.com',accountStatus:'Enabled'}]),e=>e.status===403);
 const edited=prepareStaffName({action:'edit',id:person.id,version:person.version,name:person.name,department:'Dispatch',title:'Lead Dispatcher'},records,owner).next;
 assert.equal(edited.onboardingRequired,undefined);assert.equal(edited.status,'Active');
});
