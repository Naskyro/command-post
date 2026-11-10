import test from 'node:test';
import assert from 'node:assert/strict';
import {canAssistPassword} from '../../lib/admin/password-reset-policy.ts';
import {stampDirectDelegation,blockDelegationTemplate} from '../../lib/admin/delegated-grants.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {resetConfig,issuePasswordReset} from '../../lib/admin/password-reset-service.ts';
const make=(id,more={})=>({kind:'person',id,status:'Active',accountStatus:'Enabled',role:'Employee',workerType:'Employee',authorityLevel:'Coordinator',name:id,userId:'fixture-'+id,version:1,accessMode:'Custom',access:[],...more});
const actor=make('jerson',{role:'Owner',workerType:'Owner'}),employee=make('clerk',{supervisor:'admin'}),pair=['users','password-resets'].map(tab=>({module:'Admin',tab,level:'Edit'})),overseer=make('admin',{role:'Supervisor',authorityLevel:'Manager',access:pair});
const verify=(p,rows)=>financeIdentity(new Headers({'oai-authenticated-user-id':p.userId}),rows);
test('password assistance uses its own owner-issued grant; self, former, owners, out-of-branch and privileged targets are protected',()=>{
 const rows=[actor,overseer,employee],owner=verify(actor,rows);
 assert.ok(canAssistPassword(owner,employee,rows));
 assert.equal(canAssistPassword(owner,actor,rows),false);
 assert.equal(canAssistPassword(owner,{...employee,accountStatus:'Disabled'},rows),false);
 assert.equal(canAssistPassword(verify(overseer,rows),employee,rows),false);
 const ok=stampDirectDelegation(overseer,owner,true),records=[actor,ok,employee],v=verify(ok,records);
 assert.ok(canAssistPassword(v,employee,records));
 for(const changes of [{authorityLevel:'Manager'},{supervisor:'elsewhere'},{role:'Owner'},{status:'Former'},{access:[pair[0]]}]){
  const target={...employee,...changes};assert.equal(canAssistPassword(v,target,[actor,ok,target]),false);
 }
 assert.equal(canAssistPassword(v,employee,[actor,{...ok,userId:'rebound'},employee]),false);
 assert.throws(()=>blockDelegationTemplate(pair));
 assert.throws(()=>stampDirectDelegation(overseer,v,true));
});
test('adapter only accepts an expiring link from the configured employee sign-in origin; never transmits emails or forwards client credentials',async()=>{
 const e={COMMAND_AUTH_INTERNAL_URL:'https://access.internal.test',COMMAND_AUTH_PUBLIC_ORIGIN:'https://command.example.test',COMMAND_AUTH_INTERNAL_SECRET:'k'.repeat(43)},config=resetConfig(e),expiresAt=new Date(Date.now()+15*60000).toISOString(),result={resetUrl:'https://command.example.test/auth/reset?token=fixture',username:'clerk',expiresAt};
 assert.ok(config);assert.equal(resetConfig({...e,COMMAND_AUTH_INTERNAL_SECRET:'abc'}),null);
 assert.equal(resetConfig({...e,COMMAND_AUTH_INTERNAL_URL:'http://external.test'}),null);
 const data={personId:'clerk',actorId:'admin',reason:'Employee requested help'};
 const fake=async(url,init)=>{assert.equal(url,'https://access.internal.test/internal/command/reset');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+e.COMMAND_AUTH_INTERNAL_SECRET);assert.deepEqual(JSON.parse(init.body),data);return Response.json(result);};
 assert.deepEqual(await issuePasswordReset(config,data,fake),result);
 for(const change of [{resetUrl:'https://other.example.test/auth/reset?token=leak'},{resetUrl:'https://command.example.test/auth/login'},{expiresAt:new Date(0).toISOString()}])await assert.rejects(issuePasswordReset(config,data,async()=>Response.json({...result,...change})));
});
