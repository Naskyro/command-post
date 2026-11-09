import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('property court editors can read choices for their account without gaining directory management or cross-portfolio access',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'court-directory-'));
 const am={id:'staff',person:'emp',name:'Account Manager',access:[{module:'Account Management',tab:'accounts',level:'View'},{module:'Account Management',tab:'courtHearings',level:'Edit'}]};
 const state=globalThis.courtDirectoryTest={viewer:am,accounts:[{kind:'account',id:'account:mine',name:'My Property',assignee:'emp',status:'Active'},{kind:'account',id:'account:other',name:'Other Property',assignee:'other',status:'Active'}],directoryReads:0};
 t.after(async()=>{delete globalThis.courtDirectoryTest;await rm(dir,{recursive:true,force:true});});
 const mocks=new Map([
  ['next/server','export const NextResponse={json:(body,init)=>({body,...init})};'],
  ['@/lib/finance/server','export const requestViewer=async()=>globalThis.courtDirectoryTest.viewer,requestRoster=async()=>[];'],
  ['@/lib/accounts/server','export const yearCaseRows=async()=>globalThis.courtDirectoryTest.accounts;'],
  ['@/db/finance','export const financeDb=()=>({prepare:()=>({first:async()=>{globalThis.courtDirectoryTest.directoryReads++;return null;}})}),financeFiles=()=>({});'],
  ['@/lib/hr/server','export const encryptBytes=async x=>x;'],
  ['./docket-server','export const propertyDocketRows=async()=>[],matterById=async()=>undefined,insertEdition=async()=>{},courtIdentityInUse=async()=>false;'],
  ['./court-files-server','export const readAuthorizedCourtOriginal=async()=>undefined;']
 ]);
 const outfile=join(dir,'route.mjs');
 await build({entryPoints:['app/api/ccr/docket/directory/route.ts'],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},x=>mocks.has(x.path)?{path:x.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},x=>({contents:mocks.get(x.path)}));}}]});
 const {GET,POST}=await import(pathToFileURL(outfile));
 const request=accountId=>({headers:new Headers({origin:'https://command.test'}),nextUrl:new URL('https://command.test/api/ccr/docket/directory'+(accountId?'?'+new URLSearchParams({accountId}):''))});
 let response=await GET(request('account:mine'));
 assert.equal(response.status,200);
 assert.equal(response.body.canManage,false);
 assert.equal(response.body.choices.filter(c=>c.kind==='court').length,7);
 assert.equal((await GET(request('account:other'))).status,404);
 assert.equal((await GET(request())).status,404);
 assert.equal((await POST(request('account:mine'))).status,403);
 state.viewer={...am,id:'preview:staff'};
 assert.equal((await GET(request('account:mine'))).status,403);
 state.viewer={...am,access:am.access.filter(g=>g.tab!=='courtHearings')};
 assert.equal((await GET(request('account:mine'))).status,403);
 assert.equal(state.directoryReads,1);
 state.viewer={id:'owner',person:'boss',name:'Owner',owner:true};
 response=await GET(request());
 assert.equal(response.status,200);
 assert.equal(response.body.canManage,true);
});
