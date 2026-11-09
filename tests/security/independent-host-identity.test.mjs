import assert from 'node:assert/strict';
import test from 'node:test';
import {trustedApplicationRequest,verifiedRosterHeader,standaloneActorKey,authDestination,managedSitesOrigin} from '../../lib/auth/edge-identity.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';

const base='https://command.example.invalid', user='p-test-worker', admin='jerson';
const env={COMMAND_AUTH_MODE:'standalone',COMMAND_AUTH_GATEWAY_SECRET:'upstream-sole-gateway-test-token-8f23ab924d',COMMAND_AUTH_INTERNAL_SECRET:'internal-reset-test-key-a83f71b5cd44765de19c'};
const roster=[{id:user,kind:'person',status:'Active',role:'Employee',workerType:'Employee',name:'Synthetic Worker',department:'Drivers',accessMode:'Custom',access:[]},
 {id:admin,kind:'person',status:'Active',role:'Owner',userId:'hosted-test-owner',email:'owner@example.invalid',name:'Synthetic Administrator'}];
const headers={'x-command-gateway-key':env.COMMAND_AUTH_GATEWAY_SECRET,'x-command-person-id':user,
 [verifiedRosterHeader]:admin,'x-command-internal-reset-check':'1','oai-authenticated-user-id':'hosted-test-owner','oai-authenticated-user-email':'owner@example.invalid','x-invoke-path':'/api/hr/bank','x-middleware-rewrite':'/api/hr/bank','x-forwarded-user':admin};
const request=(h,path='/api/session',method='GET',origin=base)=>new Request(origin+path,{method,headers:h});

test('standalone session is tied only to gateway-verified roster ID, without an email lookup, even if hostile identity headers are supplied',async()=>{
 const safe=await trustedApplicationRequest(request(headers),env);
 assert.ok(safe instanceof Request);for(const k of Object.keys(headers).filter(k=>k!==verifiedRosterHeader))assert.equal(safe.headers.get(k),null,k);
 assert.equal(safe.headers.get(verifiedRosterHeader),user);
 const v=financeIdentity(safe.headers,roster);assert.equal(v.person,user);assert.equal(v.id,standaloneActorKey(user));assert.equal(v.email,'');assert.equal(v.owner,false);
 assert.equal(authDestination(safe.headers),'/auth/login');assert.equal(authDestination(safe.headers,true),'/auth/logout');
 assert.throws(()=>financeIdentity(safe.headers,[roster[1]]),e=>e.status===403);
 // A valid gateway credential cannot restore access for a deactivated employee.
 assert.throws(()=>financeIdentity(safe.headers,[{...roster[0],accountStatus:'Disabled'},roster[1]]),e=>e.status===403);
 assert.throws(()=>financeIdentity(safe.headers,[{...roster[0],status:'Former'},roster[1]]),e=>e.status===403);
});
test('no worker secret, malformed settings, and untrusted origins cannot downgrade to hosted identity',async()=>{
 for(const options of [{},{COMMAND_AUTH_MODE:'stand-alone'},{COMMAND_AUTH_MODE:'standalone'},{...env,COMMAND_AUTH_GATEWAY_SECRET:'short'}]){
  assert.equal((await trustedApplicationRequest(request({...headers,Host:new URL(managedSitesOrigin).host,'x-forwarded-host':new URL(managedSitesOrigin).host}),options)).status,503);
 }
 for(const change of [{'x-command-gateway-key':'wrong'},{'x-command-person-id':''},{'x-command-person-id':'name@example.invalid'},{'x-command-gateway-key':''}]){
  assert.equal((await trustedApplicationRequest(request({...headers,...change}),env)).status,401);
 }
});
test('managed Sites ignores external identity, preserves its real signed-in account and authenticates no roster-only spoof',async()=>{
 const managed=await trustedApplicationRequest(request(headers,'/api/session','GET',managedSitesOrigin),{});
 assert.equal(managed.headers.get(verifiedRosterHeader),null);assert.equal(managed.headers.get('x-command-gateway-key'),null);assert.equal(managed.headers.get('x-command-internal-reset-check'),null);
 assert.equal(financeIdentity(managed.headers,roster).person,admin);assert.match(authDestination(managed.headers),/^\/signin-with-chatgpt/);
 const spoof=await trustedApplicationRequest(request({[verifiedRosterHeader]:admin,'x-command-person-id':admin}),{COMMAND_AUTH_MODE:'sites'});
 assert.throws(()=>financeIdentity(spoof.headers,roster),e=>e.status===401);
});
test('private reset check alone accepts service-to-service key plus separate bearer and never forwards a user identity',async()=>{
 const h={'x-command-gateway-key':env.COMMAND_AUTH_GATEWAY_SECRET,authorization:'Bearer '+env.COMMAND_AUTH_INTERNAL_SECRET,[verifiedRosterHeader]:admin,cookie:'sensitive=not_a_real_cookie'};
 const path='/api/internal/command/check-reset';
 const safe=await trustedApplicationRequest(request(h,path,'POST'),env);
 assert.ok(safe instanceof Request);assert.equal(safe.headers.get(verifiedRosterHeader),null);assert.equal(safe.headers.get('x-command-internal-reset-check'),'1');assert.equal(safe.headers.get('cookie'),null);assert.ok(safe.headers.has('authorization'));
 for(const [key,value] of [['authorization',''],['authorization','Bearer wrong'],['x-command-gateway-key','wrong'],['x-command-person-id',user]]){
  assert.equal((await trustedApplicationRequest(request({...h,[key]:value},path,'POST'),env)).status,401);
 }
 for(const [p,m] of [[path,'GET'],[path+'?user=1','POST'],['/api/internal/command/other','POST']])assert.equal((await trustedApplicationRequest(request(h,p,m),env)).status,401);
 assert.equal((await trustedApplicationRequest(request(h,path,'POST'),{COMMAND_AUTH_MODE:'sites'})).status,401);
});
