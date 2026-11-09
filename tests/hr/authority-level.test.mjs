import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityLevels, authorityLevelOf, profileFields, accessFields, payFields, sanitizeFields, validateProfile, personView} from '../../lib/people/policy.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {hrCan} from '../../lib/hr/permissions.ts';

const department={id:'dispatch',kind:'department',version:1,name:'Dispatch',status:'Active'};
const person={id:'worker',kind:'person',version:1,name:'Test Dispatcher',email:'worker@example.test',title:'Dispatcher',role:'Employee',department:'Dispatch',departmentId:'dispatch',status:'Active',workerType:'Employee',employmentClass:'Full-Time',startDate:'2026-01-01',accountStatus:'Enabled',accessMode:'Custom',access:[],hrResponsibilities:[]};
const owner={id:'owner-auth',person:'jerson',name:'Owner',owner:true,role:'Owner',canManage:true,canRelease:true};
const records=[person,department];

test('internal authority accepts four ordered tiers on new and existing profiles',()=>{
  assert.deepEqual(authorityLevels,['Coordinator','Manager','Department Lead / Director','Executive']);
  for(const authorityLevel of authorityLevels){
    const existing={...person,...sanitizeFields({authorityLevel},profileFields)};
    validateProfile(existing,person,owner,records);
    assert.equal(existing.authorityLevel,authorityLevel);
    const hire={...existing,id:'new-worker',email:'new-worker@example.test',version:0,status:'Onboarding'};
    validateProfile(hire,undefined,owner,records);
    assert.equal(hire.authorityLevel,authorityLevel);
  }
});

test('previous lead/director choices normalize to the same tier without migrating records',()=>{
  for(const previous of ['Department Lead','Director']){
    const legacy={...person,organizationalLevel:previous};
    assert.equal(authorityLevelOf(legacy),'Department Lead / Director');
    assert.equal(legacy.authorityLevel,undefined);
    assert.equal(legacy.organizationalLevel,previous);
    assert.deepEqual(sanitizeFields({organizationalLevel:previous},profileFields),{authorityLevel:'Department Lead / Director'});
    assert.deepEqual(sanitizeFields({authorityLevel:previous},accessFields),{authorityLevel:'Department Lead / Director'});
  }
  assert.equal(authorityLevelOf({...person,organizationalLevel:'Director',authorityLevel:''}),'');
  assert.throws(()=>sanitizeFields({authorityLevel:'Manager',organizationalLevel:'Executive'},profileFields),/one authority level/);
});

test('unknown existing levels stay blank and unsupported values are rejected on profile and access saves',()=>{
  for(const authorityLevel of [undefined,'']){
    const draft={...person,authorityLevel};
    validateProfile(draft,person,owner,records);
    assert.equal(draft.authorityLevel,authorityLevel);
  }
  for(const authorityLevel of ['Owner','manager','Chief',17,['Executive'],null]){
    assert.throws(()=>validateProfile({...person,authorityLevel},person,owner,records));
    for(const allowed of [profileFields,accessFields])assert.throws(()=>sanitizeFields({authorityLevel},allowed));
  }
});

test('authority is internal to scoped HR or access administrators and hidden from employees/general surfaces',()=>{
  const employee={...person,authorityLevel:'Coordinator'};
  const self={...owner,id:'worker-auth',person:'worker',owner:false,role:'Employee',canManage:false,canRelease:false};
  const reader={...self,person:'reader',access:[{module:'People & HR',tab:'people',level:'View'}],hrResponsibilities:[{action:'viewPersonnel',scope:'Company'}]};
  const manager={...reader,hrResponsibilities:[{action:'managePersonnel',scope:'Company'}]};
  for(const surface of ['hr','admin']){
    assert.equal(personView(employee,owner,[employee,department],surface).authorityLevel,'Coordinator');
    assert.equal(personView(employee,manager,[employee,department],surface).authorityLevel,'Coordinator');
    for(const viewer of [self,reader])assert.equal(personView(employee,viewer,[employee,department],surface).authorityLevel,undefined);
  }
  for(const surface of ['finance','timeclock'])assert.equal(personView(employee,owner,[employee,department],surface).authorityLevel,undefined);
  assert.equal(personView({...employee,organizationalLevel:'Director',authorityLevel:undefined},owner,[employee,department],'hr').authorityLevel,'Department Lead / Director');
  assert.equal(personView(employee,owner,[employee,department],'hr').role,undefined);
});

test('the authority label alone never creates Owner or payroll-release authority',()=>{
  const employee={...person,authorityLevel:'Executive'};
  const viewer=financeIdentity(new Headers({'oai-authenticated-user-email':person.email}),[employee,department]);
  assert.equal(viewer.owner,false);
  assert.equal(viewer.role,'Employee');
  assert.equal(viewer.canRelease,false);
  assert.equal(hrCan(viewer,'manageOffboarding','other-worker',[employee,{...person,id:'other-worker'},department]),false);
  assert.deepEqual(viewer.hrResponsibilities,[]);
  assert.throws(()=>sanitizeFields({authorityLevel:'Executive'},payFields),/cannot change/);
});
