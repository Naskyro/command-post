import test from 'node:test';
import assert from 'node:assert/strict';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {boundedGrants,sanitizeFields,accessFields} from '../../lib/people/policy.ts';
import {canStartDelegation,eligibleTarget} from '../../lib/admin/delegated-policy.ts';
import {stampDirectDelegation} from '../../lib/admin/delegated-grants.ts';
import {cleanTemplate,accessTemplatePlan,templateAllowed} from '../../lib/admin/access-templates.ts';
const pair=['users','delegated-access'].map(tab=>({module:'Admin',tab,level:'Edit'}));
const worker=(id,values={})=>({id,name:id,email:id+'@example.test',version:1,kind:'person',role:'Employee',authorityLevel:'Coordinator',department:'Dispatch',workerType:'Employee',status:'Active',accountStatus:'Enabled',...values});
const pOwner=worker('jerson',{role:'Owner',workerType:'Owner'}),pManager=worker('manager',{role:'Supervisor',authorityLevel:'Manager',accessMode:'Custom',access:pair}),employee=worker('worker',{supervisor:'manager'});
const identity=(p,rows=[p])=>financeIdentity(new Headers({'oai-authenticated-user-email':p.email}),rows);
const owner=identity(pOwner),approved=stampDirectDelegation(pManager,owner,true),manager=identity(approved);
test('owner assignment is individual; both grants, provider linkage, and active employment matter',()=>{
 assert.ok(canStartDelegation(owner));assert.ok(canStartDelegation(manager));
 for(const p of [pManager,{...approved,emailAliases:['new@example.test']},{...approved,userId:'changed'},{...approved,id:'copy'},{...approved,access:[pair[0]]},{...approved,access:[pair[1]]},{...approved,accessMode:'Role'}]){
  const h=new Headers({'oai-authenticated-user-email':p.email,...(p.userId?{'oai-authenticated-user-id':p.userId}:{})});
  assert.equal(canStartDelegation(financeIdentity(h,[p])),false);
 }
 assert.equal(canStartDelegation({...manager,onboardingOnly:true}),false);
 assert.throws(()=>sanitizeFields({delegationIdentityStamp:'forgery'},accessFields));
 assert.throws(()=>boundedGrants(pair,manager));assert.throws(()=>boundedGrants([pair[1]],owner));
 assert.throws(()=>stampDirectDelegation(pManager,manager,true));
 const cleared=stampDirectDelegation({...approved,access:[]},owner,true);
 assert.equal(canStartDelegation(identity({...cleared,access:pair})),false);
});
test('no reusable template can confer this authority even when the issuer is an owner',()=>{
 const t={id:'custom',kind:'accessTemplate',version:0,status:'Active',name:'Branch Admin',description:'test',access:pair,hrResponsibilities:[]};
 assert.throws(()=>cleanTemplate(t,owner,[]));assert.equal(templateAllowed(t,owner),false);
 assert.throws(()=>accessTemplatePlan(t,employee,owner,[employee],'Merge'));
});
test('branch administrator cannot preview colleagues, other administrators, peers, higher levels, or a revoked account',()=>{
 const records=[pOwner,approved,employee];
 assert.ok(eligibleTarget(manager,employee,records));
 for(const p of [pOwner,approved,worker('elsewhere',{supervisor:'elsewhere-manager',department:'Other'}),{...employee,accessMode:'Custom',access:[pair[0]]},{...employee,authorityLevel:'Manager'},{...employee,authorityLevel:'Executive'},{...employee,status:'Former'},{...employee,accountStatus:'Disabled'}]){
  assert.equal(eligibleTarget(manager,p,[...records,p]),false,p.id);
 }
 assert.equal(eligibleTarget(manager,employee,[pOwner,employee]),false);
 assert.equal(eligibleTarget(owner,pOwner,records),false);
 assert.ok(eligibleTarget(owner,worker('other',{supervisor:'different'}),records));
});
