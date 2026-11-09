import test from 'node:test';import assert from 'node:assert/strict';
import {lawReferences} from '../../lib/ccr/law-references.ts';
import {prepareRegister,summaryItem} from '../../lib/ccr/register-model.ts';
const owner={id:'person',person:'person',name:'Investigator',owner:true,department:'Operations',role:'Department Head'};
const section='tdlr',at='2026-11-01T12:00:00Z',base={title:'Example',category:'Agency Complaint',status:'Open',section,version:0,steps:[],reference:'Agency file A-1'},ref={agency:' Example PD ',officer:'Officer Example',badge:'07',reportNumber:'PD-R-1'};
test('multiple police references stay separate from agency case number, survive omitted values and never enter ledger summaries',()=>{
 const item=prepareRegister(owner,section,{...base,lawEnforcement:[ref,{reportNumber:'PD-R-2'}]},undefined,[],true,at);
 assert.equal(item.reference,base.reference);assert.equal(item.lawEnforcement[0].agency,'Example PD');assert.equal(item.lawEnforcement[1].officer,'');assert.equal(JSON.stringify(summaryItem(item)).includes('PD-R-'),false);
 const next=prepareRegister(owner,section,{...base,id:item.id,version:item.version,note:'Agency acknowledged'},item,[],true,at);assert.deepEqual(next.lawEnforcement,item.lawEnforcement);
 const remove=prepareRegister(owner,section,{...base,id:item.id,version:next.version,lawEnforcement:[]},next,[],true,at);assert.equal(remove.lawEnforcement,undefined);assert.ok(remove.history.at(-1).changes.includes('Law Enforcement References'));
});
test('police references do not grant case closure or allow unbounded/untyped data',()=>{
 assert.throws(()=>lawReferences(Array(13).fill(ref)),/12/);assert.throws(()=>lawReferences([{reportNumber:{}}]),/plain text/);assert.throws(()=>lawReferences([{badge:'x'.repeat(51)}]),/limits/);
 const item=prepareRegister(owner,section,base,undefined,[],true,at);
 assert.throws(()=>prepareRegister(owner,section,{...base,id:item.id,version:item.version,lawEnforcement:[ref],status:'Closed',note:'Close'},item,[],true,at),/workflow step|agency decision/);
 const readOnly={...owner,owner:false,role:'Employee',access:[{module:'Compliance, Claims & Recovery',tab:'tdlr',level:'View'}]};assert.throws(()=>prepareRegister(readOnly,section,{...base,id:item.id,version:item.version,lawEnforcement:[ref]},item,[],false,at));
});
