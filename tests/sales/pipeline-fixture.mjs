// A browser fixture for the actual SalesWorkspace. It never calls a real API.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function fakeSales(person='viewer-a'){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const day=today.slice(0,8)+'12';
 const lead=(id,name,stage,assignee,dueDate,amount)=>({id,name,kind:'opportunity',version:1,stage,assignee,dueDate,estimatedAnnualRevenue:amount,address:'Training '+id,nextAction:'Office visit'});
 return {salesAssigneeIds:['a','b'],contacts:[],companies:[],staff:[{id:'a',name:'Example Alpha',department:'Sales'},{id:'b',name:'Example Beta',department:'Sales'}],viewer:{id:person,person,name:'Fixture Viewer',owner:false,role:'Employee',department:'Sales',access:[{module:'Sales CRM',tab:'pipeline',level:'View'}]},settingsVersion:1,canSettings:false,canCreate:false,canAssign:false,canHandoff:false,editable:[],stages:[{id:'cold',label:'Not Engaged',type:'open'},{id:'warm',label:'Engaged',type:'open'},{id:'wins',label:'Won',type:'won'},{id:'loss',label:'Lost',type:'lost'}],records:[
  lead('a1','Juniper Court','cold','a',day,1200),lead('b2','Juniper Court','warm','b','',3000),
  lead('b3','Elm Annex','cold','b',day,2100),lead('w1','Closed Win','wins','b',day,9000),
  lead('l1','Closed Loss','loss','a','',8000),{...lead('ex','Training Lead','warm','a',day,1000000),example:true}
 ]};
}
export async function startPipelineFixture(){
 const assets=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Sales from './components/sales/SalesWorkspace';createRoot(document.getElementById('root')).render(React.createElement(Sales,{initialTab:'pipeline',onOpen:()=>{}}));",loader:'jsx',resolveDir:root,sourcefile:'synthetic-pipeline.jsx'},absWorkingDir:root,bundle:true,write:false,outdir:'build',entryNames:'app',format:'iife',platform:'browser',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
 const js=assets.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=assets.outputFiles.find(f=>f.path.endsWith('.css')).contents;
 const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sales Pipeline · Synthetic QA</title><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif}main{min-width:0;width:100%}.command-rail,.command-rail-trigger{display:none}</style><body><main id="root"></main><script src="/app.js"></script></body></html>';
 const mutations=[];
 const app=createServer((req,res)=>{
   if(req.method!=='GET'){mutations.push(req.method+' '+req.url);res.writeHead(405);res.end();return;}
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);}
   else if(url.pathname==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(js);}
   else if(url.pathname==='/app.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(css);}
   else if(url.pathname==='/api/sales'){const person=/fixture-user=viewer-b/.test(req.headers.cookie||'')?'viewer-b':'viewer-a';res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(fakeSales(person)));}
   else{res.writeHead(404);res.end();}
 });
 app.listen(0,'127.0.0.1');await once(app,'listening');return {url:'http://127.0.0.1:'+app.address().port,mutations,close:()=>new Promise(resolve=>app.close(resolve))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const f=await startPipelineFixture();console.log('Synthetic Sales Pipeline:',f.url);process.once('SIGINT',async()=>{await f.close();process.exit(0);});}
