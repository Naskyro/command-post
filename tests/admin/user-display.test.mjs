import test from 'node:test';
import assert from 'node:assert/strict';
import {userLifecycleState} from '../../lib/admin/user-display.ts';
const person={id:'example',kind:'person',version:1,status:'Active',accountStatus:'Enabled'};
test('deactivated access remains separate from active employment',()=>assert.equal(userLifecycleState({...person,accountStatus:'Disabled'}),'Deactivated'));
test('former employees never appear as enabled even with a legacy account flag',()=>assert.equal(userLifecycleState({...person,status:'Former'}),'Deactivated'));
test('new hires with pending clearance appear in onboarding; existing workers with pending paperwork remain active',()=>{assert.equal(userLifecycleState({...person,status:'Onboarding',onboardingRequired:true}),'Onboarding');assert.equal(userLifecycleState({...person,setupPath:'Existing Worker',onboardingRequired:false,onboardingStatus:'Historical Records Pending'}),'Active');});
test('completed clearance ends onboarding and deactivation takes precedence over it',()=>{assert.equal(userLifecycleState({...person,onboardingRequired:true,onboardingClearedAt:'2026-11-01T12:00:00Z'}),'Active');assert.equal(userLifecycleState({...person,status:'Onboarding',accountStatus:'Disabled'}),'Deactivated');});
