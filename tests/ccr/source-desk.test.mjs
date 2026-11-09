import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
test('source desk grants use verified roster and keep the unverified shell free of facts and filing controls',async t=>{
 const req=createRequire(import.meta.url),dir=await mkdtemp(join(tmpdir(),'source-desk-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await build({entryPoints:['lib/ccr/source-desk-server.ts','components/ccr/SourceFilingDesk.tsx'],outdir:dir,entryNames:'[name]',outExtension:{'.js':'.cjs'},bundle:true,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/lib\/finance\/server$/},x=>({path:x.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const requestRoster=()=>{throw Error("No second roster read allowed")};'}));b.onResolve({filter:/^(?:react|react-dom)(?:\/.*)?$/},x=>({path:req.resolve(x.path),external:true}));}}]});
 const {sourceDeskGrants}=req(join(dir,'source-desk-server.cjs')),view={id:'v',person:'j',name:'A',access:[{module:'Compliance, Claims & Recovery',tab:'hearings',level:'View'}]};
 const role=await sourceDeskGrants(view,[]);assert.equal(role.hearings,true);for(const k of ['courtEdit','property','counsel','counselEdit','drive','damage','tdlr'])assert.equal(role[k],false);
 const grant=(tab,level='Edit')=>({module:'Compliance, Claims & Recovery',tab,level}),exec={...view,access:[grant('hearings'),grant('court-counsel'),grant('damage'),grant('tdlr')]};const roster=[{kind:'person',id:'j',authorityLevel:'Executive'}],e=await sourceDeskGrants(exec,roster);assert.equal(e.counselEdit,true);assert.equal(e.drive,true);assert.equal(e.damage,false);assert.equal(e.tdlr,true);assert.equal(e.property,false);
 const ordinary=await sourceDeskGrants(exec,[{kind:'person',id:'j',authorityLevel:'Manager'}]);assert.equal(ordinary.courtEdit,true);assert.equal(ordinary.counsel,false);assert.equal(ordinary.tdlr,false);assert.equal(ordinary.drive,false);
 assert.equal((await sourceDeskGrants({...view,owner:true},[])).damage,true);await assert.rejects(()=>sourceDeskGrants({...view,id:'preview:s'},[]));await assert.rejects(()=>sourceDeskGrants({...view,onboardingOnly:true},[]));await assert.rejects(()=>sourceDeskGrants({...view,access:[]},[]));
 const html=renderToStaticMarkup(h(req(join(dir,'SourceFilingDesk.cjs')).default));assert.match(html,/Source Filing Desk/);assert.match(html,/Checking Your Access/);assert.doesNotMatch(html,/Find Court Case|Import Support Claims|Review Property|Case Number|Import Support Correspondence/);
});
