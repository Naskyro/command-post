import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

async function setup(t,reply){
 const dir=await mkdtemp(join(tmpdir(),'command-sign-out-')),output=join(dir,'test.mjs');
 t.after(()=>rm(dir,{recursive:true,force:true}));
 await build({stdin:{contents:"export * from './lib/shared/sign-out';export {default as SignOutButton} from './components/preferences/SignOutButton';export {lockDelegatedClient,isDelegatedClient} from './lib/shared/client';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',outfile:output,jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^(?:react(?:\/jsx-runtime)?|lucide-react)$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,calls=[];
 const native=async(input,init)=>{calls.push({input,init});return reply(input,init);};
 globalThis.window={location:new URL('https://command.example.invalid/'),fetch:native,history:{replaceState(){},pushState(){}},addEventListener(){}};
 globalThis.fetch=(...args)=>globalThis.window.fetch(...args);
 t.after(()=>{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;globalThis.fetch=oldFetch;});
 return {module:await import(pathToFileURL(output)),calls};
}

test('ordinary sign-out records intent and uses the server authentication provider',async t=>{
 for(const redirect of ['/auth/logout','/signout-with-chatgpt?return_to=/']){
  const {module,calls}=await setup(t,()=>Response.json({redirect}));
  assert.equal(await module.commandSignOutDestination(),redirect);
  assert.equal(calls.length,1);assert.equal(calls[0].input,'/api/session');assert.equal(calls[0].init.method,'POST');
 }
});

test('delegated sign-out ends the actor view without lifting the read-only document or writing as the employee',async t=>{
 const {module,calls}=await setup(t,()=>Response.json({session:null}));
 module.lockDelegatedClient();
 assert.equal(await module.commandSignOutDestination(),'/command-access/sign-out');
 assert.equal(calls.length,1);assert.equal(calls[0].input,'/api/delegated-access');
 assert.deepEqual(JSON.parse(calls[0].init.body),{action:'end'});
 assert.equal(new Headers(calls[0].init.headers).get('x-command-read-only'),'1');
 assert.equal(module.isDelegatedClient(),true);
 assert.equal((await window.fetch('/api/finance',{method:'POST'})).status,403);
});

test('failed delegated exit stays on the existing page and never obtains a logout destination',async t=>{
 const {module,calls}=await setup(t,()=>Response.json({error:'Exit failed. Try again.'},{status:503}));
 await assert.rejects(module.commandSignOutDestination({delegated:true}),/Exit failed/);
 assert.equal(calls.length,1);assert.equal(calls[0].input,'/api/delegated-access');
});

test('unverified account state can reach the host sign-out page while unexpected redirect URLs fail closed',async t=>{
 const {module,calls}=await setup(t,()=>Response.json({redirect:'https://outside.example.invalid/'}));
 assert.equal(await module.commandSignOutDestination({authenticated:false}),'/command-access/sign-out');
 assert.equal(calls.length,0);
 await assert.rejects(module.commandSignOutDestination(),/could not be verified/);
});

test('the header control is a labeled keyboard button even in delegated or unavailable-account states',async t=>{
 const {module}=await setup(t,()=>Response.json({}));
 for(const props of [{},{delegated:true},{authenticated:false}]){
  const html=renderToStaticMarkup(createElement(module.SignOutButton,props));
  assert.match(html,/<button[^>]*type="button"[^>]*aria-label="Sign Out"/);
  assert.match(html,/>Sign Out<\/span>/);assert.doesNotMatch(html,/disabled/);
 }
});
