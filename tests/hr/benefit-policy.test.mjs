import test from 'node:test';
import assert from 'node:assert/strict';
import {ptoRate} from '../../lib/hr/leave.ts';
const person={id:'p',kind:'person',version:1,workerType:'Employee',employmentClass:'Full-Time',payType:'Hourly',startDate:'2026-01-01'};
test('custom PTO applies only after approval and effective date',()=>{
 const p={...person,benefitPolicyAssignments:[{status:'Pending Approval',effectiveDate:'2026-01-01',custom:{ptoHours:200}},{status:'Approved',effectiveDate:'2026-11-01',custom:{ptoHours:160}}]};
 assert.equal(ptoRate(p,'2026-10-01'),.0577);assert.equal(ptoRate(p,'2026-11-01'),160/2080);assert.equal(ptoRate(p,'2025-12-01'),0);
});
test('approved zero override is preserved and standard reset restores tenure rate',()=>{
 const p={...person,benefitPolicyAssignments:[{status:'Approved',effectiveDate:'2026-02-01',custom:{ptoHours:0}},{status:'Approved',effectiveDate:'2027-01-01',custom:{}}]};
 assert.equal(ptoRate(p,'2026-03-01'),0);assert.equal(ptoRate(p,'2027-02-01'),.0769);
});
import {canDecideBenefit} from '../../lib/hr/benefit-approval.ts';
test('only current assigned supervisor can approve; owners cannot bypass this or self-approve',()=>{
 const records=[{...person,id:'worker'},{...person,id:'manager',supervisor:'supervisor'},{...person,id:'supervisor'}];
 const data={status:'Pending Approval',reviewerId:'supervisor',requestedById:'manager'};
 const v={person:'supervisor',owner:true};
 assert.equal(canDecideBenefit(v,'worker',data,records),true);
 assert.equal(canDecideBenefit({...v,person:'another-owner'},'worker',data,records),false);
 assert.equal(canDecideBenefit(v,'supervisor',data,records),false);
 assert.equal(canDecideBenefit(v,'worker',data,records.map(p=>p.id==='manager'?{...p,supervisor:'new-supervisor'}:p)),false);
 assert.equal(canDecideBenefit(v,'worker',{...data,status:'Approved'},records),false);
});
