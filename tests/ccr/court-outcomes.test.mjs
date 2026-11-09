import test from 'node:test';
import assert from 'node:assert/strict';
import {courtResultGroup,courtOutcomeCounts,validOutcomeFilter,sectionOutcome} from '../../lib/ccr/court-outcomes.ts';
import {directoryPath} from '../../lib/ccr/navigation.ts';
const row=(status,...results)=>({status,statements:results.map(r=>typeof r==='string'?{outcome:{result:r}}:r)});
test('case groups reflect the current disposition from the PTE perspective, never an inference from prose, file name, or the prevailing party',()=>{
 const closed=result=>row('Closed',result);
 const sample=[closed('PTE Won'),closed('PTE Lost'),closed('Settled'),closed('Mixed Ruling'),closed('Dismissed'),closed('Withdrawn'),closed('Other Disposition'),row('Outcome Unverified'),row('Open','PTE Won'),row('Closed',{text:'The plaintiff won; the respondent settled.'}),row('Closed',{outcome:{result:'Other Disposition',prevailingParty:'Parking & Towing Enforcement'}})];
 const counts=courtOutcomeCounts(sample);assert.deepEqual(counts,{all:11,won:1,lost:1,settled:1,mixed:1,dismissed:1,withdrawn:1,other:2,active:1,unverified:2});
 assert.equal(courtResultGroup(row('Closed','PTE Won','PTE Lost',{text:'Filed an exhibit'})),'lost');
 assert.equal(courtResultGroup(row('Outcome Unverified','PTE Lost')),'unverified');
 assert.equal(courtResultGroup({status:'Closed',statements:[],files:[{name:'won.pdf'}]}),'unverified');
});
test('outcome bookmarks round-trip; invalid facets and non-court desks cannot inject a result link',()=>{
 for(const v of ['won','lost','settled','mixed','dismissed','withdrawn','other','active','unverified']){
  const u=new URL(directoryPath('hearings',v),'https://example.test');assert.equal(u.searchParams.get('tab'),'hearings');assert.equal(validOutcomeFilter(u.searchParams.get('outcome')),v);
  assert.equal(sectionOutcome('outcome:'+v),v);
 }
 for(const x of ['__proto__','Constructor','toString','../lost','open',''])assert.equal(validOutcomeFilter(x),'all');
 assert.equal(sectionOutcome('matter:won'),'all');assert.ok(!directoryPath('damage','won').includes('outcome='));
});
