// Render the real CRM panel and bundled fictional sample records, without credentials, production records, API calls, or network assets.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),tmp=await mkdtemp(join(tmpdir(),'command-rel-'));
const out=process.argv[2]||join(tmpdir(),'command-sales-relationships-fixture.html');
const body=`import SalesRelationships from './components/sales/SalesRelationships';
import {exampleRows} from './lib/sales/examples';import {defaultStages} from './lib/sales/config';
const all=exampleRows(new Set()); const data={records:all.filter(r=>r.kind!=='contact'),contacts:all.filter(r=>r.kind==='contact'),companies:[],staff:[],editable:[],canCreate:false,stages:defaultStages};
const show=lead=>{const n=document.querySelector('#preview-lead'); n.querySelector('strong').textContent=lead.name; n.querySelector('p').textContent=lead.details; n.showModal();},noop=()=>{};
const panel=<main className="sc-workspace"><SalesRelationships data={data} refresh={async()=>{}} onLead={show} onLink={noop} onEdit={noop} onEnd={noop} onLog={noop} onFollow={noop} onNewLead={noop}/></main>;`;
const base={absWorkingDir:root,bundle:true,tsconfig:join(root,'tsconfig.json'),jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}};
function source(tail){return {contents:body+tail,loader:'tsx',sourcefile:'relationships-fixture.tsx',resolveDir:root};}
try {
 await build({...base,platform:'node',format:'cjs',stdin:source("import {renderToString} from 'react-dom/server';module.exports=renderToString(panel);"),outfile:join(tmp,'ssr.cjs')});
 const markup=createRequire(import.meta.url)(join(tmp,'ssr.cjs'));
 const client=await build({...base,platform:'browser',format:'iife',minify:true,stdin:source("import {hydrateRoot} from 'react-dom/client';hydrateRoot(document.getElementById('app'), panel);"),write:false});
 const css=await readFile(join(root,'components/sales/sales-relationships.css'),'utf8');
 const files={}; for(const slug of ['jordan','casey','taylor'])files['/sample-portraits/'+slug+'.webp']='data:image/webp;base64,'+(await readFile(join(root,'public/sample-portraits/'+slug+'.webp'))).toString('base64');
 const embed=s=>Object.entries(files).reduce((txt,[path,data])=>txt.split(path).join(data),s);
 const fallbackStyle='*{box-sizing:border-box}body{margin:0;background:#f7f9f8;color:#172e2a;font-family:Arial,Helvetica,sans-serif}button,input,select{font:inherit}button{cursor:pointer}.sc-workspace{padding:clamp(12px,2vw,30px);max-width:1750px;margin:auto}dialog{max-width:32rem;border:1px solid #b5c9bf;border-radius:12px;padding:22px}';
 await writeFile(out,'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sales Relationships · Sample Preview</title><style>'+fallbackStyle+css+'</style><div id="app">'+embed(markup)+'</div><dialog id="preview-lead"><strong></strong><p></p><form method="dialog"><button>Close Preview</button></form></dialog><script>'+embed(client.outputFiles[0].text).replace(/<\/script/gi,'<\\/script')+'</script></html>');
 console.log(out);
} finally {await rm(tmp,{recursive:true,force:true});}
