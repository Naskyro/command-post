import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'work-queue-')),file=join(dir,'api.mjs');
await build({stdin:{contents:"export * from './lib/accounts/work'; export * from './lib/accounts/model'; export * from './lib/accounts/policy'; export * from './lib/shared/notifications';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:file,logLevel:'silent'});
const api=await import(pathToFileURL(file));after(()=>rm(dir,{recursive:true,force:true}));
const row=(kind,id,fields={})=>({kind,id,name:id,version:0,...fields});
const am={id:'am',person:'am',name:'AM',role:'Employee',department:'Account Managers',owner:false,canManage:false};
const account=row('account','account',{assignee:'am'}),base=row('task','task',{accountId:'account',assignee:'am',type:'Follow-up',status:'Waiting',waitingOn:'Regional manager',remindOn:'2026-09-10'});
test('undated items remain unscheduled; waiting reminders only become due at the selected date',()=>{
 assert.equal(api.workGroup({...base,status:'Open',dueDate:''},'2026-09-10'),'Needs scheduling');
 assert.equal(api.workGroup(base,'2026-09-09'),'Waiting');assert.equal(api.workGroup(base,'2026-09-10'),'Today');assert.equal(api.workGroup(base,'2026-09-11'),'Overdue');
 assert.equal(api.workGroup({...base,status:'Completed'},'2026-09-11'),'Completed');
 const at=date=>Date.parse(date+'T18:00Z');
 assert.equal(api.notifications(am,[],[account,base],at('2026-09-09')).length,0);
 assert.equal(api.notifications(am,[],[account,base],at('2026-09-10'))[0].title,'Check in with Regional manager');
 assert.equal(api.notifications(am,[],[account,{...base,status:'Completed'}],at('2026-09-10')).length,0);
});
test('checklist progress reflects completed steps and cannot be fabricated at closure',()=>{
 const task={...base,checklist:['step1|Inspect signs','step2|Confirm installation'],completedSteps:['step1']};
 assert.deepEqual(api.checklistProgress(task),{done:1,total:2,percent:50});
 const input=r=>Object.fromEntries(['id','kind','version','name','accountId',...api.forms[r.kind].map(f=>f.key)].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
 const staff=[row('person','am',{status:'Active',department:'Account Managers'})];
 assert.throws(()=>api.clean(input({...task,status:'Completed',resolution:'Done'}),task,am,[account,task],staff),/checklist/);
 const done=api.clean(input({...task,status:'Completed',completedSteps:['step1','step2'],resolution:'Done'}),task,am,[account,task],staff);
 assert.equal(done.remindOn,'');assert.equal(done.waitingOn,'');assert(done.completedAt);
});
test('unanswered outreach satisfies monthly check-in while scheduled outreach does not',()=>{
 const activity=row('activity','call',{accountId:'account',date:'2026-09-01',channel:'Phone call',response:'No response'});
 assert.equal(api.lastContact([activity],'account'),'2026-09-01');
 assert.equal(api.lastContact([{...activity,response:'Scheduled'}],'account'),'');
});
test('Brianna historical affiliation displays Assistant Property Manager with confirmed months only',async()=>{
 const seeds=JSON.parse(await readFile('lib/accounts/seed-data.json','utf8')),r=seeds.find(r=>r.id==='affiliation:brianna-mckinney-202411');
 assert.equal(r.role,'Assistant Property Manager');assert.equal(r.accountId,'account:mckinneyfalls');
 assert.equal(api.affiliationDates(r),'Nov 2024 – Mar 2025');assert.equal(api.contactName('Brianna Soliz - PM'),'Brianna Soliz');assert.equal(api.current(r,'2025-03-31'),true);assert.equal(api.current(r,'2025-04-01'),false);
});
