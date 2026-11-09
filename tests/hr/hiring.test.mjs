import test from 'node:test';
import assert from 'node:assert/strict';
import {canUseHiring,canReadVacancy,canReadCandidate,canCreateVacancyInDepartment,prepareHiring,candidateStage,hiringRecordView} from '../../lib/hr/hiring.ts';
import {canReadRecord,validateSave} from '../../lib/hr/workflow.ts';

const at='2026-10-27T12:00:00.000Z';
const person=(id,department='Dispatch',supervisor='')=>({id,kind:'person',version:1,name:id,department,supervisor,status:'Active',onboardingRequired:false});
const departments=[{id:'dispatch',kind:'department',name:'Dispatch',status:'Active',version:1},{id:'fleet',kind:'department',name:'Fleet',status:'Active',version:1}];
const people=[...departments,person('manager'),person('recruiter','Dispatch','manager'),person('other','Fleet'),{...person('newhire','Dispatch','manager'),status:'Onboarding',onboardingRequired:true},person('outside','Fleet','other')];
const viewer=(id='manager',scope='Team')=>({id,person:id,name:id,email:id+'@example.test',department:people.find(row=>row.id===id)?.department,role:'Supervisor',owner:false,canManage:false,canRelease:false,access:[{module:'People & HR',tab:'hiring',level:'Edit'}],hrResponsibilities:scope?[{action:'manageOnboarding',scope}]:[]});
const openingData={title:'Dispatch Coordinator',departmentId:'dispatch',jobDescription:'Coordinate vehicle releases and dispatch calls.',payType:'Hourly',rate:21,targetCloseDate:'2026-11-15',status:'Open'};
const saveVacancy=(id,data=openingData,who=viewer(),hr=[])=>prepareHiring({action:'saveVacancy',id,version:0,data},who,people,hr,at).record;
const opening=saveVacancy('vacancy-one');
const applicant=prepareHiring({action:'saveCandidate',id:'candidate-one',version:0,data:{vacancyId:opening.id,fullName:'New Hire',email:'newhire@example.test',stage:'Applied'}},viewer(),people,[opening],at).record;

test('hiring visibility follows explicit responsibility scope and assigned department, not manager title',()=>{
 assert.equal(canUseHiring(viewer('manager',null)),false);
 assert.equal(canUseHiring({...viewer(),onboardingOnly:true}),false);
 assert.equal(canCreateVacancyInDepartment(viewer(),departments[0]),true);
 assert.equal(canCreateVacancyInDepartment(viewer(),departments[1]),false);
 assert.equal(canCreateVacancyInDepartment(viewer('manager','Company'),departments[1]),true);
 const delegated={...opening,data:{...opening.data,ownerId:'recruiter'}};
 assert.equal(canReadVacancy(viewer(),delegated,people),true);
 assert.equal(canReadVacancy(viewer('other'),delegated,people),false);
 assert.equal(canReadVacancy(viewer('manager','Department'),opening,people),true);
 assert.equal(canReadVacancy(viewer('other','Department'),opening,people),false);
 assert.equal(canReadCandidate(viewer(),applicant,people,[opening,applicant]),true);
 assert.equal(canReadCandidate(viewer('other'),applicant,people,[opening,applicant]),false);
 assert.throws(()=>saveVacancy('other-opening',{...openingData,departmentId:'fleet'}),/department/);
});

test('Open requires usable description, compensation and target date while Draft can retain unfinished terms',()=>{
 const draft=saveVacancy('draft',{title:'Driver',departmentId:'dispatch',status:'Draft'});assert.equal(draft.data.status,'Draft');
 for(const key of ['jobDescription','payType','targetCloseDate'])assert.throws(()=>saveVacancy('incomplete',{...openingData,[key]:''}),/before opening/);
 assert.throws(()=>saveVacancy('no-pay',{...openingData,rate:'',payDetails:''}),/offered pay/);
 assert.equal(saveVacancy('piece-rate',{...openingData,payType:'Per tow',rate:'',payDetails:'40% of qualifying tow value'}).data.payDetails,'40% of qualifying tow value');
 assert.throws(()=>saveVacancy('bad-date',{...openingData,targetCloseDate:'2026-02-30'}),/valid target close/);
 assert.throws(()=>saveVacancy('bad-rate',{...openingData,rate:-1}),/valid offered pay/);
 assert.throws(()=>saveVacancy('spoofed',{...openingData,ownerId:'other'}),/cannot change ownerId/);
});

test('manual applicants do not create employees and may begin without an email; duplicate applications are rejected',()=>{
 const noEmail=prepareHiring({action:'saveCandidate',id:'candidate-two',version:0,data:{vacancyId:opening.id,fullName:'Walk-In Applicant',stage:'Interviewing'}},viewer(),people,[opening,applicant],at);
 assert.equal(noEmail.record.data.email,'');assert.equal(noEmail.record.personId,undefined);assert.equal(noEmail.onboarding,undefined);
 assert.throws(()=>prepareHiring({action:'saveCandidate',id:'duplicate',version:0,data:{vacancyId:opening.id,fullName:'Duplicate',email:'NEWHIRE@example.test'}},viewer(),people,[opening,applicant],at),/already has an applicant/);
 for(const stage of ['Onboarding','Hired'])assert.throws(()=>prepareHiring({action:'saveCandidate',id:'bad-stage',version:0,data:{vacancyId:opening.id,fullName:'Applicant',stage}},viewer(),people,[opening],at),/linked employee/);
});

test('linking requires an authorized actual employee and preserves job/pay terms as an unverified onboarding draft',()=>{
 const plan=prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'newhire'}},viewer(),people,[opening,applicant],at);
 assert.equal(plan.record.personId,'newhire');assert.equal(plan.record.data.employeeId,'newhire');assert.equal(plan.record.data.stage,'Onboarding');
 assert.equal(plan.record.data.vacancySnapshot.title,openingData.title);assert.equal(plan.onboarding.data.jobDescription.summary,openingData.jobDescription);assert.equal(plan.onboarding.data.offer.regularRate,'21');
 assert.ok(plan.onboarding.data.tasks.every(task=>task.status==='Pending'));
 assert.equal(people.find(row=>row.id==='newhire').payType,undefined);
 assert.throws(()=>prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'outside'}},viewer(),people,[opening,applicant],at),/onboarding responsibility/);
 assert.throws(()=>prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'missing'}},viewer(),people,[opening,applicant],at),/onboarding responsibility/);
 const competing={...applicant,id:'competitor',personId:'newhire',data:{...applicant.data,employeeId:'newhire'}};
 assert.throws(()=>prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'newhire'}},viewer(),people,[opening,applicant,competing],at),/already linked/);
});

test('linking preserves existing onboarding and rejects stale versions or closed/declined applicants',()=>{
 const setup={id:'setup-existing',kind:'onboarding',personId:'newhire',version:2,data:{status:'In Progress',offer:{title:'Previously Agreed Terms'}},createdAt:at,createdBy:'manager',updatedAt:at,updatedBy:'manager'};
 const plan=prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'newhire'}},viewer(),people,[opening,applicant,setup],at);
 assert.equal(plan.onboarding,undefined);assert.equal(setup.data.offer.title,'Previously Agreed Terms');
 assert.throws(()=>prepareHiring({action:'linkEmployee',id:applicant.id,version:0,data:{employeeId:'newhire'}},viewer(),people,[opening,applicant],at),/changed/);
 for(const status of ['Closed','Filled'])assert.throws(()=>prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'newhire'}},viewer(),people,[{...opening,data:{...opening.data,status}},applicant],at),/Reopen/);
 for(const stage of ['Declined','Withdrawn'])assert.throws(()=>prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'newhire'}},viewer(),people,[opening,{...applicant,data:{...applicant.data,stage}}],at),/Reopen/);
});

test('opening pay arrangements map to document-specific units without losing compound compensation terms',()=>{
 for(const [payType,offerBasis,descriptionBasis] of [['Hourly','Hour','Hourly'],['Hourly + commission','Hour','Hourly'],['Salary + commission','Week','Salaried'],['Salary exempt','Week','Salaried'],['Net salary','Week','Salaried'],['Per tow','Tow','Commission'],['Owner payment','','']]){
  const vacancy={...opening,data:{...opening.data,payType,rate:1250,payDetails:'An additional 4% of approved collections.'}};
  const plan=prepareHiring({action:'linkEmployee',id:applicant.id,version:1,data:{employeeId:'newhire'}},viewer(),people,[vacancy,applicant],at);
  assert.equal(plan.onboarding.data.offer.payBasis,offerBasis,payType);
  assert.equal(plan.onboarding.data.jobDescription.payBasis,descriptionBasis,payType);
  assert.equal(plan.onboarding.data.offer.regularRate,'1250');
  assert.match(plan.onboarding.data.offer.commissionTerms,/additional 4% of approved collections/);
  if(payType!=='Hourly')assert.ok(plan.onboarding.data.offer.commissionTerms.includes(payType));
 }
});

test('Onboarding and Hired stages and completion percentages come from linked employee readiness',()=>{
 const linked={...applicant,personId:'newhire',data:{...applicant.data,employeeId:'newhire',stage:'Hired'}};
 assert.equal(candidateStage(linked,people,[]),'Onboarding');
 const pending=hiringRecordView(linked,viewer(),people,[opening,linked]);assert.deepEqual(pending.data.onboardingProgress,{completed:0,total:9,percent:0,status:'Onboarding'});
 const cleared=people.map(row=>row.id==='newhire'?{...row,status:'Active',onboardingClearedAt:at}:row);
 assert.equal(candidateStage(linked,cleared,[]),'Hired');assert.equal(hiringRecordView(linked,viewer(),cleared,[opening,linked]).data.onboardingProgress.percent,100);
});

test('generic HR endpoints cannot read or write hiring records, including for owners',()=>{
 for(const record of [opening,applicant])for(const who of [viewer(),{...viewer(),owner:true}]){
  assert.equal(canReadRecord(record,who,people,[opening,applicant]),false);
  assert.throws(()=>validateSave(undefined,record,who,people,[opening,applicant]),/Use Hiring/);
 }
});
