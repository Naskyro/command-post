import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {freshTodayLayout,validTodayLayout,editPanel,ordered,watchPanels,upgradeTodayLayout,dashPanels} from '../../lib/accounts/today-layout.ts';
test('pin, move, hide and restore respect each group and never hide a pinned panel; unknown and duplicate panel IDs are rejected',()=>{
 const def=freshTodayLayout(),hidden=editPanel(def,'birthdays','hide',watchPanels),pinned=editPanel(hidden,'birthdays','pin',watchPanels);assert(!pinned.hidden.includes('birthdays'));assert.equal(ordered(pinned,watchPanels)[0],'birthdays');
 const next=editPanel(pinned,'claims','down',watchPanels);assert.deepEqual(ordered(next,watchPanels),['birthdays','court','pending','claims','orders']);
 const hidePin=editPanel(next,'birthdays','hide',watchPanels);assert(!hidePin.pinned.includes('birthdays'));assert(validTodayLayout(hidePin));assert(!validTodayLayout({...def,hidden:['claims'],pinned:['claims']}));assert(!validTodayLayout({...def,hidden:['payroll']}));assert(!validTodayLayout({...def,order:[...def.order,'claims']}));assert.equal(def.hidden.length,0);
});
test('performance opens first on new and previously default dashboards without erasing a personally pinned or hidden section',()=>{
 const old=['watch','work','metrics','charts',...watchPanels], standard=upgradeTodayLayout({order:old,hidden:['claims'],pinned:[]});
 assert.deepEqual(ordered(standard,dashPanels).slice(0,2),['metrics','charts']);assert.deepEqual(standard.hidden,['claims']);
 const personal=upgradeTodayLayout({order:['work','metrics','watch','charts',...watchPanels],pinned:['watch'],hidden:['claims']});
 assert.equal(ordered(personal,dashPanels)[0],'watch');assert.equal(personal.order[0],'work');assert.ok(validTodayLayout(personal));
});
const tmp=await mkdtemp(join(tmpdir(),'account-personal-layout-')),out=join(tmp,'endpoint.mjs');after(()=>rm(tmp,{recursive:true,force:true}));
await build({entryPoints:['app/api/accounts/dashboard/layout/route.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(next\/server|@\/lib\/accounts\/server)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='next/server'?"export const NextResponse={json:(data,init)=>Response.json(data,init)}":`export const context=async(req)=>({viewer:{id:req.headers.get('who'),person:req.headers.get('who'),name:'User',role:'Employee',owner:false,access:req.headers.get('grant')==='yes'?[{module:'Account Management',tab:'work',level:'View'}]:[]},all:globalThis.fxLayout});export const writeMany=async([{next}])=>{next={...next,version:next.version+1};globalThis.fxLayout=globalThis.fxLayout.filter(r=>r.id!==next.id).concat(next);return [next]}`}))}}]});
const {GET,POST}=await import(pathToFileURL(out));
const req=(staff,grant=true,data)=>Object.assign(new Request('https://local.example/api/accounts/dashboard/layout',{method:data?'POST':'GET',headers:{who:staff,grant:grant?'yes':'no',origin:'https://local.example','content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),{nextUrl:new URL('https://local.example/api/accounts/dashboard/layout')});
test('personal layouts persist across sessions under the server actor, cannot overwrite another subject, and reject stale edits and denied requests',async()=>{
 globalThis.fxLayout=[];const layout=editPanel(freshTodayLayout(),'charts','hide',['charts']);
 assert.equal((await POST(req('alice',true,{layout,version:0,personId:'bob'}))).status,200);
 assert.equal((await (await GET(req('alice'))).json()).version,1);assert.deepEqual((await (await GET(req('alice'))).json()).layout.hidden,['charts']);assert.deepEqual((await (await GET(req('bob'))).json()).layout.hidden,[]);
 assert.equal((await POST(req('alice',true,{layout,version:0}))).status,409);assert.equal((await GET(req('alice',false))).status,403);assert.equal((await POST(req('bob',false,{layout,version:0}))).status,403);assert.deepEqual(globalThis.fxLayout.map(r=>r.id),['today-layout:alice']);
});
