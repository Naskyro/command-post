import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('read-only profiles hide editing and sensitive tenure reports; active assignments provide targeted actions',async t=>{
 const require=createRequire(import.meta.url),dir=await mkdtemp(join(tmpdir(),'cp-account-relationships-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const outfile=join(dir,'component.cjs');
 await build({entryPoints:[fileURLToPath(new URL('../../components/accounts/AccountRelationships.tsx',import.meta.url))],outfile,bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'same-react',setup(b){b.onResolve({filter:/^(?:react|react-dom)(?:\/.*)?$/},a=>({path:require.resolve(a.path),external:true}));}}]});
 const Rel=require(outfile).default,r=(kind,id,name,fields={})=>({kind,id,name,version:1,...fields});
 const all=[r('contact','sample-person','Ada Example'),r('account','p','Training Flats'),r('affiliation','role','Current',{contactId:'sample-person',accountId:'p',startDate:'2020-01-01',role:'Property Manager',authority:'Gate entry approval',decisionMaker:true})];
 const make=(editable)=>renderToStaticMarkup(createElement(Rel,{all,cap:()=>editable,can:()=>editable,name:String,onEdit(){},onCreate(){},onAccount(){},onRefresh:async()=>{},onMove(){},renderRecords(){return null;}}));
 const readonly=make(false);assert(readonly.includes('Ada Example')&&readonly.includes('Gate entry approval')&&readonly.includes('Decision Maker'));
 for(const action of ['Edit Contact','Edit Photo','Log Visit','Add Follow-Up','Create Opportunity','Tenure Records'])assert(!readonly.includes(action),action);
 const writable=make(true);for(const action of ['Edit Contact','Edit Photo','Log Visit','Add Follow-Up','Change Property or Company','Tenure Records'])assert(writable.includes(action),action);
});
