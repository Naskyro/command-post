import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {visible} from '../../lib/finance/visibility.ts';
import {authorityTemplate} from '../../lib/people/authority.ts';

const tmp=await mkdtemp(join(tmpdir(),'finance-self-service-')),bundle=join(tmp,'logic.mjs');
await build({stdin:{contents:"export {validate} from './lib/finance/server';",resolveDir:process.cwd(),loader:'ts'},outfile:bundle,bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'test-bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const env={};',loader:'js'}));}}]});
const {validate}=await import(pathToFileURL(bundle));
after(()=>rm(tmp,{recursive:true,force:true}));
const rec=(id,kind,fields={})=>({id,kind,version:1,...fields});
const people=[rec('lead','person',{name:'Lead',role:'Department Head',department:'Operations'}),rec('worker','person',{name:'Worker',supervisor:'lead',department:'Operations'}),rec('outside','person',{name:'Outside',department:'Dispatch'})];
const base={id:'auth-lead',person:'lead',name:'Lead',email:'lead@example.test',role:'Department Head',department:'Operations',owner:false,canManage:false,canRelease:false};
const grant=(tab,level='View')=>({module:'Finance',tab,level});
const self={...base,access:[grant('My pay'),grant('My spending','Edit')]};
const kinds=['payment','expense','expenseReport','reimbursement','payIssue','yearDocument','taxInput','deduction','earning'];
const financial=people.flatMap(p=>kinds.map(kind=>rec(kind+':'+p.id,kind,{person:p.id,status:kind==='yearDocument'?'Released':'Draft',amount:100})));
const run=rec('run','payrun',{status:'Released',people:people.map(p=>p.id),lines:people.map(p=>({person:p.id,payment:100,name:p.name}))});
const records=[...people,...financial,run,rec('draft-run','payrun',{...run,id:'draft-run',status:'Approved'}),rec('run-file','file',{parent:'run',name:'Company Payroll.pdf'}),rec('expense-worker-file','file',{parent:'expense:worker',name:'Worker Receipt.pdf'}),rec('expense-lead-file','file',{parent:'expense:lead',name:'Own Receipt.pdf'})];

test('authority presets never expose subordinate finances through self-service, even for the Operations head',()=>{
 for(const level of ['Manager','Department Lead / Director','Executive']){
  const template=authorityTemplate(level),v={...base,role:template.role,access:template.access,canRelease:true};
  const view=visible(v,records),ids=new Set(view.map(r=>r.id));
  for(const kind of kinds){assert.equal(ids.has(kind+':worker'),false,level+' '+kind);assert.equal(ids.has(kind+':outside'),false,level+' '+kind);}
  const shown=view.find(r=>r.id==='run');assert.deepEqual(shown.lines.map(l=>l.person),['lead']);assert.deepEqual(shown.people,['lead']);
  assert.equal(ids.has('draft-run'),false);assert.equal(ids.has('run-file'),false);assert.equal(ids.has('expense-worker-file'),false);
  assert.equal(ids.has('payment:lead'),true);assert.equal(ids.has('yearDocument:lead'),true);
 }
});
test('My Spending shows personal expenses, reports, reimbursements and attachments only',()=>{
 const view=visible(self,records),ids=new Set(view.map(r=>r.id));
 for(const kind of ['expense','expenseReport','reimbursement']){assert.equal(ids.has(kind+':lead'),true);assert.equal(ids.has(kind+':worker'),false);}
 assert.equal(ids.has('expense-lead-file'),true);assert.equal(ids.has('expense-worker-file'),false);
});
test('explicit Payroll read permits only existing reporting scope; full release authority also requires Payroll access',()=>{
 const v={...self,access:[...self.access,grant('Payroll')]},view=visible(v,records),ids=new Set(view.map(r=>r.id));
 assert.deepEqual(view.find(r=>r.id==='run').lines.map(l=>l.person),['lead','worker']);
 assert.deepEqual(view.find(r=>r.id==='run').people,['lead','worker']);
 for(const kind of ['payment','earning','taxInput','deduction','reimbursement','payIssue','yearDocument']){assert.equal(ids.has(kind+':worker'),true);assert.equal(ids.has(kind+':outside'),false);}
 assert.equal(ids.has('expense:worker'),false);assert.equal(ids.has('run-file'),false);
 const full=visible({...v,canRelease:true},records);assert.equal(full.find(r=>r.id==='run').lines.length,3);assert.equal(full.some(r=>r.id==='draft-run'),true);assert.equal(full.some(r=>r.id==='run-file'),true);
});
test('explicit Outflows preserves spending visibility without adding payroll access',()=>{
 const view=visible({...self,access:[...self.access,grant('Outflows')]},records),ids=new Set(view.map(r=>r.id));
 assert.equal(ids.has('expense:worker'),true);assert.equal(ids.has('expenseReport:worker'),true);assert.equal(ids.has('payment:worker'),true);assert.equal(ids.has('expense-worker-file'),true);
 assert.equal(ids.has('reimbursement:worker'),true);assert.equal(ids.has('reimbursement:outside'),false);
 assert.equal(ids.has('taxInput:worker'),false);assert.deepEqual(view.find(r=>r.id==='run').lines.map(l=>l.person),['lead']);
});
test('self-service can save personal spending but cannot edit or approve subordinate spending',()=>{
 for(const kind of ['expense','expenseReport']){
  const own=rec('new-'+kind,kind,{person:'lead',status:'In review',cashConfirmed:true,period:'2026-10-25',amount:20});
  assert.doesNotThrow(()=>validate(own,undefined,self,people));
  for(const status of ['Draft','In review','Approved']){
   const other={...own,person:'worker',status};assert.throws(()=>validate(other,undefined,self,people),/Outflows edit access/);
   assert.throws(()=>validate(other,undefined,{...self,access:[...self.access,grant('Outflows')]},people),/Outflows edit access/);
  }
 }
});
test('approval needs explicit Outflows Edit plus existing reviewer scope and never allows self-approval',()=>{
 const reviewer={...self,access:[...self.access,grant('Outflows','Edit')]};
 for(const kind of ['expense','expenseReport']){
  const approved=rec('new-'+kind,kind,{person:'worker',status:'Approved',period:'2026-10-25',amount:20});
  assert.doesNotThrow(()=>validate(approved,undefined,reviewer,people));
  assert.throws(()=>validate({...approved,person:'outside'},undefined,reviewer,people),/requires your reviewer/);
  for(const actor of [self,reviewer,{...reviewer,owner:true,canManage:true,canRelease:true}])assert.throws(()=>validate({...approved,person:'lead'},undefined,actor,people),/cannot approve your own/);
  assert.throws(()=>validate(approved,undefined,{...reviewer,role:'Employee'},people),/requires your reviewer/);
 }
});
