import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

// Keep one React runtime across the renderer and compiled components.
const compiled=await build({entryPoints:[new URL('../../components/school/CourseCover.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
const {default:Cover}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render=(patch={})=>renderToStaticMarkup(createElement(Cover,{course:{title:'Night Shift Handoff',topic:'Dispatch',...patch}}));

test('legacy courses get printable title art, the PTE logo, and no private image request',()=>{
 const html=render();assert.match(html,/Night Shift Handoff/);assert.match(html,/\/pte-road\.svg/);assert.match(html,/<svg /);assert.doesNotMatch(html,/\/api\/school\/cover/);
});
test('all four title-card designs have different drawing paths, and saved custom accent is used',()=>{
 const variants=['command','dispatch','field','executive'].map(coverStyle=>render({coverStyle,coverAccent:'mint'}));
 for(const html of variants)assert.match(html,/--sh-cover-accent:#89e4c4/);
 assert.equal(new Set(variants.map(html=>html.match(/<svg.*?<\/svg>/s)[0])).size,4);
});
test('valid private course image uses only its cover endpoint and keeps title art as a fallback',()=>{
 const media='cover-71619d2e-d1d9-44da-a18e-df711261117a';const html=render({coverMediaId:media});
 assert.ok(html.includes('/api/school/cover?id='+media));assert.match(html,/Night Shift Handoff/);
 for(const bad of ['https://example.com/private.jpg','media-123','profilePhoto:someone','../image.svg'])assert.doesNotMatch(render({coverMediaId:bad}),/\/api\/school\/cover|example\.com|profilePhoto:someone/);
});
