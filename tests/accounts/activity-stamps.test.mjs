import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
test('a starred dispatch handoff keeps its original author and Central send time; a date-only legacy handoff does not acquire a clock time',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'audit-meta-render-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=path.join(dir,'view.cjs');
 await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {DispatchInbox} from './components/accounts/DispatchInbox';export const render=(props)=>renderToStaticMarkup(React.createElement(DispatchInbox,props));`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',outfile:output,loader:{'.css':'empty'},logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'}});
 const {render}=createRequire(import.meta.url)(output);
 const account={kind:'account',id:'property',version:1,name:'Property',assignee:'manager'},note={kind:'activity',id:'thread',name:'Example',version:2,channel:'Dispatcher note',accountId:'property',pinned:true,authorId:'sender',updatedBy:'Last User Who Starred',noteCreatedAt:'2026-11-01T06:30:00Z',date:'2026-10-31',details:'Original dispatch handoff'};
 const markup=render({all:[account,note,{...note,id:'legacy',authorId:'no-longer-on-staff',noteCreatedAt:undefined,date:'2026-09-05'}],viewer:'manager',head:true,canManage:()=>false,staff:[{id:'sender',name:'Original Dispatcher'}]});
 assert.match(markup,/<time dateTime="2026-11-01T06:30:00Z"[^>]*>11-01-2026 01:30am CT<\/time>/i);
 assert.match(markup,/Original Dispatcher/);assert.doesNotMatch(markup,/Last User Who Starred/);
 assert.match(markup,/<time dateTime="2026-09-05">2026-09-05<\/time>/i);assert.doesNotMatch(markup,/2026-09-05T00:00/);
});
