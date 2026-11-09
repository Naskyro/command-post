import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('only a disabled and linked user gets reporting-only navigation without an operational session',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'command-reporting-session-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const outfile=path.join(dir,'session.mjs');
  const replacements=new Map([
    ['next/server','export const NextResponse=Response;'],
    ['@/lib/finance/server','export async function allRecords(){globalThis.sessionFixture.reads++;if(globalThis.sessionFixture.fail) throw Error("Database unavailable");return globalThis.sessionFixture.people;}'],
    ['@/db/finance','export function financeDb(){throw Error("Unexpected audit or operational session");}']
  ]);
  await build({entryPoints:['app/api/session/route.ts'],outfile,bundle:true,platform:'node',format:'esm',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(next\/server|@\/lib\/finance\/server|@\/db\/finance)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:replacements.get(a.path)}));}}]});
  const {GET}=await import(pathToFileURL(outfile));
  const fixture=globalThis.sessionFixture={reads:0,people:[
    {kind:'person',id:'former',role:'Employee',status:'Former',userId:'f-account',email:'former@example.test',accountStatus:'Disabled'},
    {kind:'person',id:'hire',role:'Employee',status:'Onboarding',userId:'h-account'},
    {kind:'person',id:'active',role:'Employee',status:'Active',userId:'a-account'}]};
  t.after(()=>{delete globalThis.sessionFixture;});
  async function get(user='',email=''){
    const h=new Headers();if(user)h.set('oai-authenticated-user-id',user);if(email)h.set('oai-authenticated-user-email',email);
    const before=fixture.reads;
    const r=await GET({headers:h,cookies:{get:()=>({value:'already-audited'})}});
    assert.equal(fixture.reads,before+1);assert.equal(r.headers.get('cache-control'),'private, no-store');return [r.status,await r.json()];
  }
  const [status,restricted]=await get('f-account');assert.equal(status,403);assert.equal(restricted.reportingOnly,true);assert.equal(restricted.viewer,undefined);
  for(const [user,email,expected] of [['','',401],['unknown','former@example.test',403]]){
    const [s,b]=await get(user,email);assert.equal(s,expected);assert.equal(b.reportingOnly,undefined);assert.equal(b.viewer,undefined);
  }
  for(const user of ['h-account','a-account']){const [s,b]=await get(user);assert.equal(s,200);assert.equal(b.viewer.onboardingOnly,user==='h-account');assert.equal(b.reportingOnly,undefined);}
  fixture.fail=true;const [s,b]=await get('f-account');assert.equal(s,400);assert.equal(b.reportingOnly,undefined);assert.equal(b.viewer,undefined);
});
