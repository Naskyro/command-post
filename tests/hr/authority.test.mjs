import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityTemplate,authorityRank,authorityAssignmentCapabilities,canAssignAuthorityLevel,applyAuthorityLevel,captureAuthorityOverrides} from '../../lib/people/authority.ts';
import {canAccess,grantsFor} from '../../lib/finance/access.ts';
import {hrCan} from '../../lib/hr/permissions.ts';
import {personView} from '../../lib/people/policy.ts';

const employee={id:'staff',kind:'person',version:2,name:'Staff',role:'Employee',workerType:'Employee',status:'Active',department:'Dispatch',supervisor:'admin',authorityLevel:'Coordinator',accessMode:'Custom',access:[],hrResponsibilities:[]};
const admin={id:'admin',kind:'person',version:1,role:'Owner',status:'Active',department:'Operations'};
const owner={id:'auth-admin',person:'admin',name:'Admin',email:'admin@example.test',role:'Owner',department:'Operations',owner:true,canManage:true,canRelease:true};
const records=[employee,admin];
const access=(p,module,tab)=>grantsFor(p).find(g=>g.module===module&&g.tab===tab)?.level;
const role=(p,action)=>p.hrResponsibilities?.find(g=>g.action===action)?.scope;
const transition=(old,level,actor=owner,people=records)=>applyAuthorityLevel(old,{...old,authorityLevel:level},actor,people,'2026-10-27T18:00:00Z');

test('Coordinator baseline enables own HR, timeclock, paystubs and assigned SOP workflow without expense or management powers',()=>{
 const draft={...employee,version:0,authorityLevel:'Coordinator',access:authorityTemplate('Coordinator').access};delete draft.id;draft.id='newhire';
 const p=applyAuthorityLevel(undefined,draft,owner,[admin]);
 assert.equal(p.role,'Employee');assert.equal(p.accessMode,'Custom');assert.equal(access(p,'Timeclock','Today'),'Edit');assert.equal(access(p,'Finance','My pay'),'View');assert.equal(access(p,'SOP Library','assigned'),'Edit');
 assert.equal(access(p,'Finance','My spending'),undefined);assert.equal(p.hrResponsibilities.length,0);
});
test('Manager and Lead/Director templates map actual roles with explicitly scoped HR and self spending only',()=>{
 const manager=transition(employee,'Manager');assert.equal(manager.role,'Supervisor');assert.equal(access(manager,'People & HR','people'),'Edit');assert.equal(role(manager,'viewPersonnel'),'Team');assert.equal(role(manager,'recordPerformance'),'Team');assert.equal(access(manager,'Finance','My spending'),undefined);
 const lead=transition(manager,'Department Lead / Director');assert.equal(lead.role,'Department Head');assert.equal(access(lead,'Finance','My spending'),'Edit');
 for(const tab of ['Payroll','Outflows','Settings'])assert.equal(access(lead,'Finance',tab),undefined);
 assert.equal(access(lead,'Admin','users'),undefined);
 for(const action of ['manageOffboarding','manageTaxBank','manageCompensation','approveStart'])assert.equal(role(lead,action),undefined);
 const executive=transition(lead,'Executive');assert.equal(executive.role,'Department Head');assert.notEqual(executive.role,'Owner');
 const viewer={...owner,owner:false,canManage:false,person:executive.id,role:executive.role,access:executive.access,hrResponsibilities:executive.hrResponsibilities};
 assert.equal(canAccess(viewer,'Finance','Payroll',true),false);assert.equal(hrCan(viewer,'manageOffboarding','any',records),false);
});
test('authority changes require access administration, target scope and bounded rank; self and outside branch are rejected',()=>{
 const hrOnly={...owner,owner:false,canManage:false,role:'Supervisor',access:[{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:[{action:'managePersonnel',scope:'Team'}]};
 assert.throws(()=>transition(employee,'Manager',hrOnly),/user-access administration/);
 assert.throws(()=>transition(employee,'Manager',{...owner,person:'staff'}),/user-access administration/);
 const limited={...hrOnly,access:[...hrOnly.access,{module:'Admin',tab:'users',level:'Edit'}]};
 assert.throws(()=>transition(employee,'Executive',limited),/above your own/);
 const outside={...employee,supervisor:'elsewhere'};assert.equal(canAssignAuthorityLevel(limited,outside,[outside,admin]),false);
 assert.throws(()=>transition(employee,'Not a Tier'),/Choose an authority level/);
});
test('template delegation cannot create permissions or Team HR responsibility absent from the assigning administrator',()=>{
 const limited={...owner,owner:false,role:'Department Head',access:[{module:'Admin',tab:'users',level:'Edit'},{module:'People & HR',tab:'people',level:'Edit'}],hrResponsibilities:[]};
 assert.throws(()=>transition(employee,'Manager',limited),/not allowed to delegate/);
 const accessDelegate={...limited,access:[...authorityTemplate('Executive').access,{module:'Admin',tab:'users',level:'Edit'}]};
 assert.throws(()=>transition(employee,'Manager',accessDelegate),/beyond your own authority/);
 const delegate={...accessDelegate,hrResponsibilities:[{action:'viewPersonnel',scope:'Team'},{action:'recordPerformance',scope:'Team'}]};
 assert.equal(transition(employee,'Manager',delegate).role,'Supervisor');
});
test('demotion removes only template-owned effects and restores previous manual view access',()=>{
 const original={...employee,access:[{module:'People & HR',tab:'people',level:'View'},{module:'Accounts',tab:'notes',level:'Edit'}],hrResponsibilities:[{action:'manageTaxBank',scope:'Team'}]};
 const manager=transition(original,'Manager'),lowered=transition(manager,'Coordinator');
 assert.equal(access(lowered,'People & HR','people'),'View');assert.equal(access(lowered,'Accounts','notes'),'Edit');assert.equal(role(lowered,'recordPerformance'),undefined);assert.equal(role(lowered,'manageTaxBank'),'Team');assert.equal(lowered.role,'Employee');
 assert.equal(access(lowered,'Timeclock','Today'),'Edit');
});
test('Admin unchecks and read-only overrides persist through later promotions without being silently restored',()=>{
 const lead=transition(employee,'Department Lead / Director');
 const edited=captureAuthorityOverrides(lead,{...lead,access:lead.access.filter(g=>!(g.module==='Finance'&&g.tab==='My spending')).map(g=>g.module==='People & HR'&&g.tab==='people'?{...g,level:'View'}:g),hrResponsibilities:lead.hrResponsibilities.filter(g=>g.action!=='recordPerformance')});
 const lower=transition(edited,'Coordinator'),raised=transition(lower,'Executive');
 assert.equal(access(raised,'Finance','My spending'),undefined);assert.equal(access(raised,'People & HR','people'),'View');assert.equal(role(raised,'recordPerformance'),undefined);assert.equal(role(raised,'viewPersonnel'),'Team');
});
test('same-save Admin access changes plus authority level change preserve unchecked, view-only and new manual grants',()=>{
 const manager=transition(employee,'Manager');
 const draft={...manager,authorityLevel:'Department Lead / Director',access:[...manager.access.filter(g=>!(g.module==='People & HR'&&g.tab==='relations')).map(g=>g.module==='People & HR'&&g.tab==='people'?{...g,level:'View'}:g),{module:'Work Orders',tab:'orders',level:'Edit'}]};
 const result=applyAuthorityLevel(manager,captureAuthorityOverrides(manager,draft),owner,records);
 assert.equal(access(result,'People & HR','relations'),undefined);assert.equal(access(result,'People & HR','people'),'View');assert.equal(access(result,'Work Orders','orders'),'Edit');assert.equal(access(result,'Finance','My spending'),'Edit');
});
test('existing custom exceptions and legacy effective access are preserved without invoking promoted role fallback',()=>{
 const custom={...employee,access:[{module:'Finance',tab:'Payroll',level:'View'}],hrResponsibilities:[{action:'viewPersonnel',scope:'Company'}]};
 const promoted=transition(custom,'Manager');assert.equal(access(promoted,'Finance','Payroll'),'View');assert.equal(role(promoted,'viewPersonnel'),'Company');
 const legacy={...employee,accessMode:'Default',access:undefined,authorityLevel:undefined,department:'Dispatch'};
 const before=grantsFor(legacy),after=transition(legacy,'Manager');assert.equal(after.accessMode,'Custom');assert(before.every(g=>access(after,g.module,g.tab)===g.level||access(after,g.module,g.tab)==='Edit'));assert.equal(access(after,'Finance','Payroll'),undefined);
 const unchanged=applyAuthorityLevel(employee,{...employee,title:'Changed Title'},owner,records);assert.equal(unchanged.authorityTemplateAppliedAt,undefined);assert.equal(unchanged.access.length,0);
});
test('server capability metadata handles hidden own Executive tier without exposing internal level in self HR or finance payloads',()=>{
 const exec={...employee,id:'exec',role:'Department Head',authorityLevel:'Executive',accessMode:'Custom',access:[{module:'Admin',tab:'users',level:'Edit'}]},target={...employee,supervisor:'exec'};
 const viewer={...owner,owner:false,canManage:false,person:'exec',role:'Department Head',access:exec.access,hrResponsibilities:[]};
 assert.equal(authorityRank(viewer,[exec,target]),4);
 const capabilities=authorityAssignmentCapabilities(viewer,[exec,target]);assert(capabilities.levels.includes('Executive'));assert.deepEqual(capabilities.editablePersonIds,['staff']);
 assert.equal(personView(exec,viewer,[exec,target],'hr').authorityLevel,undefined);assert.equal(personView(target,owner,[exec,target],'finance').authorityLevel,undefined);
});


test('new-hire reviewed checkbox omissions remain disabled and cannot be reintroduced by later template changes',()=>{
 const template=authorityTemplate('Manager');
 const draft={...employee,id:'newhire',version:0,authorityLevel:'Manager',access:template.access.filter(g=>!(g.module==='Timeclock'&&g.tab==='Today')),hrResponsibilities:template.hrResponsibilities.filter(g=>g.action!=='recordPerformance')};
 const saved=applyAuthorityLevel(undefined,draft,owner,[admin]);
 assert.equal(access(saved,'Timeclock','Today'),undefined);assert.equal(role(saved,'recordPerformance'),undefined);
 assert(saved.authorityAccessOverrides.some(g=>g.module==='Timeclock'&&g.tab==='Today'&&g.level==='None'));
 const raised=transition(saved,'Executive',owner,[saved,admin]);
 assert.equal(access(raised,'Timeclock','Today'),undefined);assert.equal(role(raised,'recordPerformance'),undefined);assert.equal(access(raised,'Finance','My spending'),'Edit');
});
test('new-hire omitted arrays use the selected template and record exact provenance for later demotion',()=>{
 const draft={...employee,id:'newhire',version:0,authorityLevel:'Manager'};delete draft.access;delete draft.hrResponsibilities;
 const saved=applyAuthorityLevel(undefined,draft,owner,[admin]);assert.equal(role(saved,'recordPerformance'),'Team');assert.equal(access(saved,'People & HR','people'),'Edit');
 const lower=transition(saved,'Coordinator',owner,[saved,admin]);assert.equal(access(lower,'People & HR','people'),'View');assert.equal(role(lower,'recordPerformance'),undefined);
});
