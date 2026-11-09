import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const dir=await mkdtemp(join(tmpdir(),'cp-queue-')),out=join(dir,'bundle.cjs'),req=createRequire(import.meta.url);after(()=>rm(dir,{recursive:true,force:true}));
await build({stdin:{contents:"export * from './lib/accounts/queue-workspace'; export {default as Workbench} from './components/accounts/AccountWorkQueue'; export {clean} from './lib/accounts/policy'; export {forms} from './lib/accounts/model';",resolveDir:process.cwd(),loader:'ts'},outfile:out,bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'react',setup(b){b.onResolve({filter:/^(?:react|react-dom)(?:\/.*)?$/},a=>({path:req.resolve(a.path),external:true}));}}]});
const {cleanFilters,filteredQueue,groupQueue,parsePrefs,canQuickEdit,completionBlock,Workbench,clean,forms}=req(out);
const names=new Map([['a','Property One'],['b','Property Two'],['one','First Manager'],['two','Second Manager']]),make=(id,patch={})=>({id,kind:'task',name:'Follow Up '+id,version:1,status:'Open',type:'Follow-up',assignee:'one',accountId:'a',...patch}),day='2027-01-04';
const delayed=make('return',{status:'Waiting',dueDate:'2027-01-03',remindOn:'2027-01-08',waitingOn:'Vendor'}),closed=make('closed',{status:'Completed',completedAt:'2026-12-30T18:00:00Z',originalClosedDate:'2026-12-30',resolution:'Confirmed'}),past=make('sign',{dueDate:'2026-12-30'}),foreign=make('foreign',{accountId:'b',assignee:'two',dueDate:day}),derived=make('src',{derived:true,version:0,name:'Monthly Check-In'}),ops=make('repair',{kind:'workOrder',status:'Requested',type:'Flyering',assignee:''});
const rows=[delayed,closed,past,foreign,derived,ops,make('trash',{deletedAt:'2027-01-01'}),past];
test('queue views share the same records; overdue includes earlier years and waits use reminder dates',()=>{
 const match=f=>filteredQueue(rows,{...cleanFilters,...f},'one',day,names);
 assert.deepEqual(match({due:'Overdue'}).map(r=>r.id),['sign']);
 assert.deepEqual(match({due:'Next 7 Days',person:'one'}).map(r=>r.id),['return']);
 assert.deepEqual(match({search:'property two'}).map(r=>r.id),['foreign']);
 assert.deepEqual(match({search:'property two',scope:'Mine'}),[]);
 assert.deepEqual(match({status:'Completed'}).map(r=>r.id),['closed']);
 assert(!match({status:'All Statuses'}).some(r=>r.id==='closed'));
 assert(match({status:'All Statuses',allYears:true}).some(r=>r.id==='closed'));
 const list=groupQueue(match({}),'Due Date',day,names),board=groupQueue(match({}),'Status',day,names,true),agenda=groupQueue(match({}),'Day',day,names);
 for(const groups of [list,board,agenda])assert.deepEqual(groups.flatMap(g=>g.rows.map(r=>r.id)).sort(),['return','sign','foreign','src','repair'].sort());
 assert.equal(list.find(g=>g.key==='Waiting').rows[0].id,'return');assert.equal(agenda.find(g=>g.key==='2027-01-08').rows[0].id,'return');
 assert.deepEqual(groupQueue([delayed,foreign],'Property',day,names).map(g=>g.title),['Property One','Property Two']);
 assert.deepEqual(parsePrefs('{"view":"Board","boardGroup":"Assignee","listGroup":"Priority"}'),{view:'Board',boardGroup:'Assignee',listGroup:'Priority'});assert.equal(parsePrefs('malformed').view,'List');
});
test('quick completion preserves source, permissions, checklist and dependency safeguards; backend persists the recorded outcome',()=>{
 for(const x of [derived,{...ops,assetRequest:true},make('read',{readOnly:true})])assert.equal(canQuickEdit(x,()=>true,true),false);
 assert.equal(canQuickEdit(ops,()=>true,false),false);assert.equal(canQuickEdit(ops,()=>true,true),true);assert.equal(canQuickEdit(past,()=>false,true),false);
 const after=make('audit',{checklist:['1|Verify sign'],completedSteps:[],dependsOn:'problem',status:'Completed',resolution:'Verified at the office'});assert.match(completionBlock(after,[]),/checklist/);after.completedSteps=['1'];assert.match(completionBlock(after,[]),/preceding/);
 const predecessor=make('problem',{status:'Completed'}),account=make('a',{kind:'account',status:'Active'}),old={...after,status:'In progress',completedSteps:[],resolution:''},all=[account,old,predecessor],viewer={id:'one',person:'one',name:'First Manager',role:'Employee',department:'Account Managers',owner:false},staff=[make('one',{kind:'person',status:'Active',department:'Account Managers'})];
 assert.equal(completionBlock(after,all),'');assert.match(completionBlock(ops,[]),/Operations/);
 const payload=Object.fromEntries(['id','kind','name','accountId','version',...forms.task.map(f=>f.key)].filter(k=>after[k]!==undefined).map(k=>[k,after[k]]));
 const saved=clean(payload,old,viewer,all,staff);assert.equal(saved.status,'Completed');assert.equal(saved.resolution,'Verified at the office');assert.ok(saved.completedAt);
 assert.throws(()=>clean({...payload,resolution:''},old,viewer,all,staff),/outcome/);
});
test('real workbench renders task ownership controls and only authorized completion actions',()=>{
 const common={rows:[past,derived,ops],all:[...rows,{id:'a',kind:'account',name:'Property One',version:1}],staff:[{id:'one',name:'First Manager',department:'Account Managers'}],viewerId:'one',onOpen(){},onSave:async()=>{},canOpenAssets:false,operationsEditor:false};
 const rendered=renderToStaticMarkup(createElement(Workbench,{...common,editable:()=>true}));
 assert.match(rendered,/My Tasks/);assert.match(rendered,/aria-label="Work Queue Views"/);assert.match(rendered,/>Agenda</);assert.match(rendered,/>Board</);assert.match(rendered,/aria-label="Complete Follow Up sign"/);assert.doesNotMatch(rendered,/aria-label="Complete Monthly Check-In"|aria-label="Complete Follow Up repair"/);
 assert.doesNotMatch(renderToStaticMarkup(createElement(Workbench,{...common,editable:()=>false})),/aria-label="Complete /);
});
