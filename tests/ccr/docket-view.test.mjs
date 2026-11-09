import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('court profiles keep hidden property names out of search, sort appearances by their actual dates, and restrict edit and append controls',async t=>{
 const req=createRequire(import.meta.url),root=process.cwd(),dir=await mkdtemp(join(tmpdir(),'pte-court-view-'));t.after(()=>rm(dir,{recursive:true,force:true}));const outfile=join(dir,'court.cjs');
 await build({entryPoints:[join(root,'components/ccr/CourtDocket.tsx')],outfile,absWorkingDir:root,bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'shared-react',setup(b){b.onResolve({filter:/^(?:react|react-dom)(?:\/.*)?$/},a=>({path:req.resolve(a.path),external:true}));}}]});
 const {filteredCourtRecords:search,courtDirectoryView,CourtCaseDetail}=req(outfile),m={id:'1',accountId:'undeclared-id',title:'Hearing Alpha',type:'Tow Hearing',status:'Open',number:'1234',filedOn:'2026-08-14',dueOn:'2026-09-04',dueFor:'Evidence Packet',appearances:[{id:'late',date:'2026-11-04',time:'09:15',status:'Scheduled',label:'Final Appearance'},{id:'early',date:'2026-10-15',status:'Continued',label:'Initial Appearance'}],updatedAt:'2026-11-02T20:00:00Z',updatedBy:'Reviewer',statements:[{text:'First statement',at:'2026-10-01T01:04:00Z',by:'Author One'},{text:'Correction to the statement',at:'2026-10-02T01:04:00Z',by:'Author Two'}]},closed={...m,id:'2',status:'Closed',type:'Lawsuit',updatedAt:'2026-11-03T17:00:00Z'};
 const names=new Map(),granted=new Map([[m.accountId,'Example Court Apartments']]);
 assert.equal(search([m,closed],names,'All','','undeclared-id').length,0);assert.equal(search([m,closed],names,'All','','apartments').length,0);
 assert.deepEqual(search([m,closed],granted,'Closed','Lawsuit','apartments 1234').map(r=>r.id),['2']);assert.deepEqual(search([m,closed],granted,'All','','').map(r=>r.id),['2','1']);
 await t.test('the default directory includes previous cases without counting them as open',()=>{
  const past={...closed,number:'C-1-CR-26000001',filedOn:'2024-06-15',appearances:[],statements:[{outcome:{result:'PTE Won',on:'2024-10-10'}}]},unknown={...m,id:'3',status:'Outcome Unverified'};
  const rows=[m,past,unknown],all=courtDirectoryView(rows,names);
  assert.equal(all.visible.length,3);assert.deepEqual(all.counts,{All:3,Open:1,Closed:1,'Outcome Unverified':1});
  assert.deepEqual(courtDirectoryView(rows,names,'','', 'Open').visible.map(r=>r.id),[m.id]);
  assert.deepEqual(courtDirectoryView(rows,names,'2024 Won').visible.map(r=>r.id),[past.id]);
  assert.deepEqual(courtDirectoryView(rows,names,'c1cr26000001').visible.map(r=>r.id),[past.id]);
  assert.deepEqual(courtDirectoryView(rows,names,'','Lawsuit').counts,{All:1,Open:0,Closed:1,'Outcome Unverified':0});
  const wins=courtDirectoryView(rows,names,'2024','','All','won');
  assert.deepEqual(wins.visible.map(x=>x.id),[past.id]);assert.equal(wins.counts.Open,0);assert.equal(wins.counts.Closed,1);assert.equal(wins.resultCounts.won,1);
  assert.deepEqual(courtDirectoryView(rows,names,'','','Open','won').visible,[]);assert.equal(courtDirectoryView(rows,names,'','','All','settled').visible.length,0);
 });
 const render=canEdit=>renderToStaticMarkup(h(CourtCaseDetail,{m,canEdit,onEdit(){},onStatement(){},onBack(){}}));
 const view=render(false);assert.doesNotMatch(view,/undeclared-id|Add Statement|Edit Record/);assert.match(view,/Property Linked/);
 assert.ok(view.indexOf('Initial Appearance')<view.indexOf('Final Appearance'));assert.match(view,/11-04-2026 09:15am CT/);
 assert.ok(view.indexOf('Correction to the statement')<view.indexOf('First statement'));assert.match(view,/Author Two/);assert.match(view,/Reviewer/);
 const editor=render(true);assert.match(editor,/Add Statement/);assert.match(editor,/Edit Record/);
});
