import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccess,grantsFor} from '../../lib/finance/access.ts';
const mod='SOP Library';
function viewer(role,access){return {person:'staff',role,department:'Operations',owner:false,access};}
test('default library access never includes requests or editorial authority, including department heads',()=>{
 for(const role of ['Employee','Supervisor','Department Head']){
  const v=viewer(role,grantsFor({id:'staff',kind:'person',version:1,role,department:'Operations'}));
  assert.equal(canAccess(v,mod,'library'),true);assert.equal(canAccess(v,mod,'inbox'),false);assert.equal(canAccess(v,mod,'workflow',true),false);
 }
});
test('request inbox can be delegated independently from publication and employee reading',()=>{
 const v=viewer('Employee',[{module:mod,tab:'inbox',level:'View'}]);
 assert(canAccess(v,mod));assert(canAccess(v,mod,'inbox'));assert(!canAccess(v,mod,'inbox',true));assert(!canAccess(v,mod,'workflow',true));assert(!canAccess(v,mod,'library'));
 const editor=viewer('Supervisor',[{module:mod,tab:'workflow',level:'Edit'}]);assert(canAccess(editor,mod,'workflow',true));assert(!canAccess(editor,mod,'inbox'));
});
