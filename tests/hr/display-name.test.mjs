import test from 'node:test';
import assert from 'node:assert/strict';
import {displayPersonName,legalPersonName,publicPersonIdentity} from '../../lib/people/display-name.ts';
import {personView,validateProfile} from '../../lib/people/policy.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {payrollLine} from '../../lib/finance/model.ts';
import {prepareStaffName,staffNameData} from '../../lib/people/names.ts';

const worker={id:'worker',kind:'person',version:1,name:'Alexandra Example',preferredName:'Alex Example',pronouns:'she/her',email:'worker@example.test',companyEmail:'',title:'Dispatcher',role:'Employee',workerType:'Employee',employmentClass:'Full-Time',status:'Active',accountStatus:'Enabled',department:'Dispatch',departmentId:'dispatch',supervisor:'manager',startDate:'2026-01-01',payType:'Hourly',rate:20,gender:'Nonbinary'};
const manager={id:'manager',kind:'person',version:1,name:'Manager',department:'Dispatch',status:'Active'};
const department={id:'dispatch',kind:'department',version:1,name:'Dispatch',status:'Active'};
const records=[worker,manager,department];
const viewer={id:'manager-auth',person:'manager',name:'Manager',role:'Supervisor',department:'Dispatch',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:[]};
const owner={...viewer,id:'owner-auth',person:'jerson',role:'Owner',owner:true,canManage:true,canRelease:true};

test('preferred names display exactly as entered while legal identity stays canonical',()=>{
 assert.equal(displayPersonName(worker),'Alex Example');
 assert.equal(legalPersonName(worker),'Alexandra Example');
 assert.equal(displayPersonName({...worker,preferredName:'   '}),'Alexandra Example');
 assert.equal(displayPersonName({name:'No Preferred Name'}),'No Preferred Name');
 assert.deepEqual(publicPersonIdentity(worker),{name:'Alex Example',preferredName:'Alex Example',pronouns:'she/her'});
 assert.equal(worker.name,'Alexandra Example');
});

test('public roster hides legal name and gender while scoped personnel, self and payroll retain legal identity',()=>{
 const clock=personView(worker,owner,records,'timeclock');assert.equal(clock.name,'Alex Example');assert.equal(clock.legalName,undefined);assert.equal(clock.gender,undefined);
 const ordinary=personView(worker,viewer,records,'hr');assert.equal(ordinary.name,'Alex Example');assert.equal(ordinary.legalName,undefined);assert.equal(ordinary.gender,undefined);
 const scoped={...viewer,hrResponsibilities:[{action:'viewPersonnel',scope:'Team'}]};
 assert.equal(personView(worker,scoped,records,'hr').legalName,'Alexandra Example');
 assert.equal(personView(worker,{...viewer,person:'worker'},records,'hr').legalName,'Alexandra Example');
 const taxReviewer={...viewer,hrResponsibilities:[{action:'manageTaxBank',scope:'Team'}]};assert.equal(personView(worker,taxReviewer,records,'hr').legalName,'Alexandra Example');assert.equal(personView({...worker,supervisor:'other'},taxReviewer,[{...worker,supervisor:'other'},manager,department],'hr').legalName,undefined);
 const pay=personView(worker,owner,records,'finance');assert.equal(pay.name,'Alex Example');assert.equal(pay.legalName,'Alexandra Example');
 assert.equal(legalPersonName(pay),'Alexandra Example');
 assert.equal(payrollLine(pay,[],'2026-10-25','2026-10-31').name,'Alexandra Example');
 assert.equal(financeIdentity(new Headers({'oai-authenticated-user-id':'session-worker','oai-authenticated-user-email':'worker@example.test'}),records).name,'Alex Example');
});

test('personal sign-in works without a company mailbox and optional work email does not replace it',()=>{
 const personal={...worker};validateProfile(personal,worker,owner,records);assert.equal(personal.email,'worker@example.test');assert.equal(personal.companyEmail,'');assert.deepEqual(personal.emailAliases,[]);
 const work={...worker,companyEmail:'  worker@gtowingtransport.com  '};validateProfile(work,worker,owner,records);assert.equal(work.email,'worker@example.test');assert.equal(work.companyEmail,'worker@gtowingtransport.com');assert.deepEqual(work.emailAliases,[]);
 assert.throws(()=>validateProfile({...worker,preferredName:'x'.repeat(151)},worker,owner,records),/preferred name/);
 assert.throws(()=>validateProfile({...worker,pronouns:'x'.repeat(101)},worker,owner,records),/pronouns/);
});

test('editing a dropdown display name preserves the employee full name and identity',()=>{
 const before=staffNameData(records,owner).people.find(p=>p.id==='worker');assert.equal(before.name,'Alex Example');assert.equal(before.legalName,undefined);
 const updated=prepareStaffName({action:'edit',id:'worker',version:1,name:'A. Example',department:'Dispatch',title:'Lead Dispatcher'},records,owner).next;
 assert.equal(updated.name,'Alexandra Example');assert.equal(updated.preferredName,'A. Example');assert.equal(updated.email,worker.email);assert.equal(updated.id,worker.id);
});
