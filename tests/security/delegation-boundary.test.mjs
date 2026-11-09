import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('delegation routing and payload allowlists',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'delegation-boundary-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const out=join(dir,'subject.mjs');
 await build({stdin:{contents:"export * from './lib/admin/delegated-policy';export * from './lib/admin/delegated-projections';",resolveDir:process.cwd()},bundle:true,outfile:out,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'test-boundaries',setup(b){
  // Keep real viewer permission checks and projections, stub only downstream adapters.
  const mocks={
   '@/lib/accounts/server':"export const records=async()=>[{kind:'account',name:'Orchard',service:'Patrol',status:'Active',address:'123 Main',gateCode:'PRIVATE GATE',contact:'PRIVATE CONTACT'},{kind:'file',name:'PRIVATE FILE'},{kind:'trespass',name:'PRIVATE PERSON'}];export const projection=rows=>rows;",
   '@/lib/school/server':"export const contextForViewer=async()=>({});export const courses=async()=>[];export const data=async()=>({courses:[]});",
   '@/lib/home/pulse-preferences':"export const readPulsePreferences=async()=>({layout:{},preferences:{},version:0});",
   '@/lib/home/pulse-people':"export const schedulingSignals=async()=>[];",
   '@/lib/home/pulse-learning':"export const homeLearning=async()=>null;",
   '@/lib/home/order-analytics':"export const homeOrderAnalytics=async()=>null;",
   '@/lib/home/pulse-field':"export const fieldSignalsFromRows=()=>[];",
   '@/lib/home/pulse-cases':"export const caseSignalProjection=()=>[];",
  };
  b.onResolve({filter:/^@\//},args=>args.path in mocks?{path:args.path,namespace:'mocks'}:undefined);
  b.onLoad({filter:/.*/,namespace:'mocks'},args=>({contents:mocks[args.path],loader:'js'}));
 }}]});
 const {delegateRequestAction,delegatedReadResponse,cookieToken,aggregateSignal,previewWorkspace}=await import(pathToFileURL(out));
 const cookie='__Host-command-view='+'1'.repeat(64),req=(path,init={})=>new Request('https://command.test'+path,{...init,headers:{cookie,...init.headers}});
 await t.test('unreviewed endpoints, callbacks, sign-in and every write fail closed',()=>{
  for(const path of ['/api/accounts/google/callback?state=x','/api/future','/_vinext/image?url=/api/hr/files','/api/delegated-access%2f','/hr-concern','/callback','/signin-with-chatgpt','/api/session/'])assert.equal(delegateRequestAction(req(path)),'deny',path);
  assert.equal(delegateRequestAction(req('/api/home',{method:'POST'})),'deny');
  assert.equal(delegateRequestAction(req('/',{method:'POST',headers:{'next-action':'x'}})),'deny');
  for(const name of ['next-action','x-vinext-action','x-rsc-action'])assert.equal(delegateRequestAction(req('/api/home',{headers:{[name]:'x'}})),'deny');
  for(const path of ['/api/session','/api/user-settings','/api/delegated-access/workspace?module=Timeclock'])assert.equal(delegateRequestAction(req(path)),'project');
  for(const path of ['/api/home','/api/finance?surface=timeclock','/api/people?surface=admin','/api/school/source','/api/hr/concerns','/api/hr/bank','/api/hr/accident-reports','/api/school/media?id=example']){
   assert.equal(delegateRequestAction(req(path)),'read',path);
   for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(delegateRequestAction(req(path,{method})),'deny',method+' '+path);
  }
  assert.equal(delegateRequestAction(req('/people/accident-followups?driverId=p')),'shell');
  assert.equal(delegateRequestAction(req('/people/accident-followups.rsc?_command_view=1')),'shell');
  assert.equal(delegateRequestAction(req('/.rsc?_rsc=')),'shell');
  assert.equal(delegateRequestAction(req('/admin.rsc')),'deny');
  assert.equal(delegateRequestAction(req('/')),'shell');assert.equal(delegateRequestAction(req('/theme-art/a.svg')),'asset');
  assert.equal(delegateRequestAction(req('/vendor/sop-pdfjs/5.6.205/pdf.min.js')),'asset');assert.equal(delegateRequestAction(req('/vendor/sop-pdfjs/5.6.205/pdf.worker.min.js')),'asset');assert.equal(delegateRequestAction(req('/vendor/unreviewed/script.js')),'deny');
  assert.equal(delegateRequestAction(req('/api/delegated-access',{method:'POST'})),'control');
  assert.equal(cookieToken(new Headers({cookie:cookie+'; '+cookie})),'invalid');
  assert.equal(delegateRequestAction(req('/api/hr/concerns',{headers:{cookie:'__Host-command-view=broken'}})),'read');
  assert.equal(delegateRequestAction(req('/api/hr/concerns',{headers:{cookie:'','x-command-read-only':'1'}})),'read');
  assert.equal(delegateRequestAction(req('/api/hr/concerns',{headers:{cookie:''}})),'normal');
  assert.equal(delegateRequestAction(req('/api/hr/files?id=private&_command_view=1',{headers:{cookie:''}})),'read');
  assert.equal(delegateRequestAction(req('/api/home?_command_view=1',{method:'POST',headers:{cookie:''}})),'deny');
  assert.equal(delegateRequestAction(req('/?_command_view=1',{headers:{cookie:''}})),'shell');
 });
 await t.test('redirects retain the restriction marker, remove cookies, and preserve response privacy',()=>{
  const response=delegatedReadResponse(req('/api/accounts/files?id=1'),new Response(null,{status:302,headers:{Location:'/api/drive/files?id=2','Set-Cookie':'unsafe=1',Vary:'Accept'}}));
  const target=new URL(response.headers.get('Location'));assert.equal(target.searchParams.get('_command_view'),'1');assert.equal(target.searchParams.get('id'),'2');assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Vary'),'Accept, Cookie');
  const external=delegatedReadResponse(req('/api/accounts/files?id=1'),new Response(null,{status:302,headers:{Location:'https://drive.example.invalid/document/1'}}));assert.equal(external.headers.get('Location'),'https://drive.example.invalid/document/1');
 });
 await t.test('home signals can never project arbitrary new cards, item details, raw fields, or record targets',()=>{
  const source={id:'field_paused',title:'Paused',description:'Paused Properties',module:'Accounts',count:1,unit:'properties',items:[{name:'PRIVATE'}],private:'PRIVATE',target:{module:'Accounts',tab:'overview',account:'PRIVATE',params:'PRIVATE'},score:2,tone:'warning',displayValue:'PRIVATE'};
  const [projected]=aggregateSignal(source);assert.deepEqual(projected.items,[]);assert.deepEqual(projected.target,{module:'Accounts',tab:'overview'});assert(!JSON.stringify(projected).includes('PRIVATE'));
  for(const id of ['court_this_week','new_lawsuits','safety_new','safety_alerts','major_damage','finance_new','new_source'])assert.deepEqual(aggregateSignal({...source,id}),[]);
 });
 await t.test('workspace intersects actor and employee grants, protects specific tabs and includes no raw fields',async()=>{
  const grant=(module,tab)=>({module,tab,level:'Edit'});
  const v={id:'p',name:'Sample',email:'',person:'p',department:'Dispatch',role:'Employee',access:[grant('Accounts','overview'),grant('Accounts','notes'),grant('People & HR','people')],owner:false,canManage:false,canRelease:false};
  const actor={...v,person:'a',owner:true};
  const page=await previewWorkspace(v,[],'Accounts','overview',actor);assert.deepEqual(page.rows,[['Orchard','123 Main','Patrol','Active']]);assert(!JSON.stringify(page).includes('PRIVATE'));
  assert.equal((await previewWorkspace(v,[],'Accounts','notes',actor)).protected,true);
  assert.equal((await previewWorkspace(v,[],'People & HR','people',actor)).protected,true);
  assert.equal((await previewWorkspace(v,[],'Accounts','overview',{...actor,owner:false,access:[]})).protected,true);
  await assert.rejects(previewWorkspace(v,[],'Accounts','agreement',actor),/access/i);
  await assert.rejects(previewWorkspace(v,[],'__proto__','constructor',actor),/access/i);
 });
});
