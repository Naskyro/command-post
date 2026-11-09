import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityTemplate,applyAuthorityLevel} from '../../lib/people/authority.ts';
import {emptyInitialAuthorityChoices,rememberInitialAccessChoices,rememberInitialHrChoices,previewInitialAuthorityChange} from '../../lib/people/authority-preview.ts';

const find=(grants,module,tab)=>grants.find(g=>g.module===module&&g.tab===tab);
const owner={id:'owner-auth',person:'jerson',name:'Owner',owner:true,role:'Owner',canManage:true,canRelease:true};

test('new-hire preview shows exact selected tier defaults in the checkbox editor',()=>{
 const baseline=authorityTemplate('Coordinator');
 const manager=previewInitialAuthorityChange('Coordinator','Manager',baseline.access,baseline.hrResponsibilities,emptyInitialAuthorityChoices());
 assert.deepEqual(manager.access,authorityTemplate('Manager').access);
 assert.deepEqual(manager.hrResponsibilities,authorityTemplate('Manager').hrResponsibilities);
 const lead=previewInitialAuthorityChange('Manager','Department Lead / Director',manager.access,manager.hrResponsibilities,emptyInitialAuthorityChoices());
 assert.equal(find(lead.access,'Finance','My spending').level,'Edit');
 assert.equal(find(lead.access,'Finance','Payroll'),undefined);
 const coordinator=previewInitialAuthorityChange('Department Lead / Director','Coordinator',lead.access,lead.hrResponsibilities,emptyInitialAuthorityChoices());
 assert.deepEqual(coordinator.access,baseline.access);
 assert.deepEqual(coordinator.hrResponsibilities,[]);
});

test('explicit new-hire unchecks survive later tier selections and the server save',()=>{
 const baseline=authorityTemplate('Coordinator');
 const edited=baseline.access.filter(g=>!(g.module==='Timeclock'&&g.tab==='Today'));
 let choices=rememberInitialAccessChoices(baseline.access,edited,emptyInitialAuthorityChoices());
 let manager=previewInitialAuthorityChange('Coordinator','Manager',edited,[],choices);
 assert.equal(find(manager.access,'Timeclock','Today'),undefined);
 const reviewedHr=manager.hrResponsibilities.filter(g=>g.action!=='recordPerformance');
 choices=rememberInitialHrChoices(manager.hrResponsibilities,reviewedHr,choices);
 const lead=previewInitialAuthorityChange('Manager','Department Lead / Director',manager.access,reviewedHr,choices);
 assert.equal(find(lead.access,'Timeclock','Today'),undefined);
 assert.equal(lead.hrResponsibilities.some(g=>g.action==='recordPerformance'),false);
 const saved=applyAuthorityLevel(undefined,{id:'newhire',kind:'person',version:0,role:'Employee',authorityLevel:'Department Lead / Director',accessMode:'Custom',...lead},owner,[]);
 assert.deepEqual(saved.access,lead.access);
 assert.deepEqual(saved.hrResponsibilities,lead.hrResponsibilities);
});

test('explicit scope and module choices remain after promotion and demotion',()=>{
 const baseline=authorityTemplate('Manager');
 const editedAccess=[...baseline.access.filter(g=>!(g.module==='People & HR'&&g.tab==='people')),{module:'People & HR',tab:'people',level:'View'},{module:'Accounts',tab:'overview',level:'Edit'}];
 let choices=rememberInitialAccessChoices(baseline.access,editedAccess,emptyInitialAuthorityChoices());
 const editedHr=[{action:'viewPersonnel',scope:'Company'}];
 choices=rememberInitialHrChoices(baseline.hrResponsibilities,editedHr,choices);
 const promoted=previewInitialAuthorityChange('Manager','Executive',editedAccess,editedHr,choices);
 assert.equal(find(promoted.access,'People & HR','people').level,'View');
 assert.equal(find(promoted.access,'Accounts','overview').level,'Edit');
 assert.deepEqual(promoted.hrResponsibilities,[{action:'viewPersonnel',scope:'Company'}]);
 const demoted=previewInitialAuthorityChange('Executive','Coordinator',promoted.access,promoted.hrResponsibilities,choices);
 assert.equal(find(demoted.access,'Accounts','overview').level,'Edit');
 assert.equal(find(demoted.access,'Finance','My spending'),undefined);
 assert.deepEqual(demoted.hrResponsibilities,[{action:'viewPersonnel',scope:'Company'}]);
});
