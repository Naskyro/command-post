import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
test('the real sales panels expose scoped practice controls, avoid external contact actions, and render route/stage workflows',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-sales-planning-'));t.after(()=>rm(dir,{force:true,recursive:true}));
 const repo=fileURLToPath(new URL('../../',import.meta.url)),fn=join(dir,'views.cjs');
 await build({absWorkingDir:repo,stdin:{resolveDir:repo,loader:'jsx',contents:`
 import {renderToStaticMarkup as html} from 'react-dom/server';
 import SalesRelationships from './components/sales/SalesRelationships';import SalesFollowUp from './components/sales/SalesFollowUp';import SalesRoutes from './components/sales/SalesRoutes';import SalesStages from './components/sales/SalesStageSettings';import {exampleRows} from './lib/sales/examples';import {defaultStages} from './lib/sales/config';
 const raw=exampleRows(new Set());const lead=raw.find(r=>r.kind==='opportunity');const noop=()=>{},refresh=async()=>{};
 export function views(edit){
 const data={records:raw.filter(r=>r.kind!=='contact').map(r=>({...r,readOnly:false,...(r.kind==='salesRelationship'?{email:'practice@example.invalid',phone:'512-555-0100'}:{})})),contacts:raw.filter(r=>r.kind==='contact').map(r=>({...r,editableProfile:edit})),stages:defaultStages,companies:[],staff:[],editable:[],editableFollowUps:edit?[lead.id]:[],editableRelationships:edit?[lead.id]:[],settingsVersion:1,canCreate:false};return {
 relations:html(<SalesRelationships data={data} refresh={refresh} onLead={noop} onEdit={noop} onEnd={noop} onLink={noop} onLog={noop} onNewLead={noop}/>),
 follow:html(<SalesFollowUp lead={lead} editable={edit} refresh={refresh} alwaysOpen/>),
 routes:html(<SalesRoutes leads={data.records.filter(r=>r.kind==='opportunity')} onLead={noop}/>),
 stages:html(<SalesStages data={data} save={refresh}/>)};}`},bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},outfile:fn});
 const {views}=createRequire(import.meta.url)(fn),yes=views(true),no=views(false);
 for(const both of [yes.relations,no.relations]){assert.match(both,/Personal Practice/);assert.match(both,/practice@example.invalid/);assert.doesNotMatch(both,/href="(?:mailto:|tel:)|Read-Only|Edit Photo/);}
 for(const s of ['Edit Contact','Add Relationship','End Relationship','Edit Relationship','Log Call','Add Note']){assert.ok(yes.relations.includes(s),s);assert.ok(!no.relations.includes(s),s+' hidden without rights');}
 assert.match(yes.follow,/Next Step<input/);assert.match(yes.follow,/type="date"/);assert.match(yes.follow,/Save Follow-Up/);assert.match(yes.follow,/Remove Follow-Up/);assert.doesNotMatch(no.follow,/Save Follow-Up|type="date"/);
 for(const s of ['Saved Plans','Build Your Itinerary','Find Route Leads','Calculate Route','Save Plan','Visits and Breaks'])assert.ok(yes.routes.includes(s),s);
 for(const s of ['Open Stages','Closing Outcomes','Your Pipeline','Add Stage','Save Stages','Won Outcome','Lost Outcome','Probability'])assert.ok(yes.stages.includes(s),s);
});
