import test from 'node:test';
import assert from 'node:assert/strict';
import {leadDirectoryRows,followQueue,propertyLabel} from '../../lib/sales/lead-directory.ts';
const day='2026-11-01',stages=[{id:'prospect',type:'open',label:'Discovery'},{id:'w',type:'won',label:'Under Contract'},{id:'l',type:'lost',label:'Passed'}];
const row=(id,stage,info={})=>({id,kind:'opportunity',version:1,name:id,stage,...info});
const open=row('oaks','prospect',{name:'Quiet Oaks',propertyManager:'T. Rivera',assignee:'rep',nextAction:'Discuss the contract',dueDate:'2026-11-03'}),won=row('won','w'),lost=row('lost','l',{lossReason:'Chose another provider'}),sample=row('sales-example:laurel','w',{name:'Sample · Laurel Park'}),all=[open,won,lost,sample,{...open,kind:'salesActivity',id:'event'}];
test('published stage types define distinct open, won, lost and cross-section directories; practice never mixes with real properties',()=>{
 const get=(view,scope)=>leadDirectoryRows(all,stages,view,day,scope).map(r=>r.id);assert.deepEqual(get('won',{practice:false}),['won']);assert.deepEqual(get('won',{practice:true}),['sales-example:laurel']);assert.deepEqual(get('lost',{practice:false}),['lost']);assert.deepEqual(get('all',{practice:false}),['oaks']);assert.deepEqual(get('property',{practice:false}),['lost','oaks','won']);assert.equal(propertyLabel(sample),'Laurel Park');
});
test('rail search and owner filtering combine across property names, people, task, and configured stage label',()=>{
 for(const query of ['rivera','Discovery contract','quiet rivera'])assert.deepEqual(leadDirectoryRows(all,stages,'all',day,{practice:false,query,owner:'rep'}).map(r=>r.id),['oaks']);assert.equal(leadDirectoryRows(all,stages,'all',day,{practice:false,query:'contract',owner:'other'}).length,0);
});
test('each open property is in exactly one follow-up group and the queue respects the company day',()=>{
 const tasks=[['next','2026-11-04','Visit'],['missed','2026-10-30','Call'],['today','2026-11-01','Call'],['unknown','',''],['no-task','2026-10-30',''],['next2','2026-11-02','Call']].map(([id,dueDate,nextAction])=>row(id,'prospect',{dueDate,nextAction}));
 assert.deepEqual(leadDirectoryRows([...tasks,won,lost],stages,'followups',day,{practice:false}).map(v=>v.id),['missed','today','next2','next','unknown','no-task']);assert.equal(followQueue(tasks[4],day),'unscheduled');assert.deepEqual(leadDirectoryRows(tasks,stages,'followups',day,{practice:false,queue:'today'}).map(r=>r.id),['today']);
});

test('the rendered editable practice profile exposes follow-up and activity controls without Gmail, real contacts, pending-account handoff, or photo upload',async()=>{
 const {build}=await import('esbuild'),{createRequire}=await import('node:module'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,dirname,resolve}=await import('node:path'),{fileURLToPath}=await import('node:url');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),temp=await mkdtemp(join(tmpdir(),'crm-workbench-render-')),file=join(temp,'fixture.cjs');
 try {await build({absWorkingDir:root,jsx:'automatic',bundle:true,platform:'node',format:'cjs',outfile:file,tsconfig:join(root,'tsconfig.json'),loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},stdin:{resolveDir:root,loader:'tsx',contents:`import {renderToString} from 'react-dom/server';import Workbench from './components/sales/SalesLeadWorkbench';
 const noop=()=>{};const sample={kind:'opportunity',id:'sales-example:cedar',example:true,stage:'Engaged',version:0,name:'Sample · Test Garden',address:'Example Lane',nextAction:'Call tomorrow',dueDate:'2026-11-02',onboardingAccountId:'forbidden-in-practice'};
 const real={...sample,example:false,name:'Restricted Real Property',id:'real-prop'};
 const data={viewer:{owner:true},records:[sample,real],contacts:[],companies:[],staff:[],stages:[{id:'Engaged',type:'open',label:'Engaged'}],editable:[sample.id],editableRelationships:[sample.id],editableFollowUps:[sample.id],canCreate:false};
 const common={onRefresh:noop,onEdit:noop,onRemove:noop,onPending:noop,onLog:noop,onRelationship:noop,onEnd:noop,onPhoto:noop,emailView:()=>null,onSelect:noop,onBack:noop,onCreate:noop};
 module.exports=[renderToString(<Workbench {...common} origin="Pipeline" view="property" selected={sample.id} data={data}/>),renderToString(<Workbench {...common} view="all" selected={real.id} data={{...data,editable:[],editableRelationships:[],editableFollowUps:[]}}/>)];`}});const [practice,readOnly]=createRequire(import.meta.url)(file);
 for(const phrase of ['Back to Pipeline','Personal Practice','Edit Lead','Next Step','Follow-Up Date','Save Follow-Up','Log Call','Log Visit','Add Note','Delete Sample for Me','/sample-properties/cedar.webp'])assert.ok(practice.includes(phrase),phrase);
 for(const phrase of ['Restricted Real Property','Open Pending Account','Log Email Sent','href="mailto:','type="file"'])assert.ok(!practice.includes(phrase),phrase);
 assert.match(readOnly,/Restricted Real Property/);for(const phrase of ['Edit Lead','Save Follow-Up','Log Call','Delete Sample for Me','type="file"','Test Garden'])assert.ok(!readOnly.includes(phrase),phrase);
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('an explicitly scheduled handoff or internal task on a closed property remains findable; deleted records never do',()=>{
 const handoff={...won,nextAction:'Verify onboarding handoff',dueDate:day},internal={...lost,nextAction:'Review decision internally',dueDate:day,resolicitEligible:'No'};
 assert.deepEqual(leadDirectoryRows([won,lost,handoff,internal,{...open,deletedAt:day}],stages,'followups',day,{practice:false}).map(r=>r.id),['lost','won']);
});
