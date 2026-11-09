import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const compiled=await build({entryPoints:[new URL('../../components/school/LessonMediaEditor.tsx',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^(?:react(?:\/jsx-runtime)?|lucide-react)$/},args=>({path:import.meta.resolve(args.path),external:true}));}}]});
const {default:Editor}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const render=(kind,patch={},extra={})=>renderToStaticMarkup(createElement(Editor,{course:{id:'course',title:'Dispatch Foundations',status:'Draft'},lesson:{id:'lesson',title:'Shift Handoff',kind,...patch},busy:false,onUpload:()=>{},onRemove:()=>{},...extra}));
test('each media upload names its course and lesson, shows exact formats and a visible save action',()=>{
 const video=render('video'),audio=render('audio');for(const html of [video,audio]){assert.match(html,/Dispatch Foundations/);assert.match(html,/Shift Handoff/);assert.match(html,/Up to 50 MB/);assert.match(html,/links the file to this lesson/);}
 assert.match(video,/Upload &amp; Save Video/);assert.match(video,/accept="\.mp4,\.webm"/);assert.match(audio,/Upload &amp; Save Audio/);assert.match(audio,/\.mp3,\.m4a,\.wav,\.ogg,\.weba/);assert.doesNotMatch(video,/Save Draft to Add/);
});
test('saved video and audio have inline playback, names, sizes and safe non-submit controls',()=>{
 for(const kind of ['video','audio']){const html=render(kind,{mediaId:'media',mediaUrl:'/api/school/media?id=media',mediaName:'My Recording',mediaSize:2*1024*1024});assert.match(html,new RegExp('<'+kind+'[^>]*controls=""'));assert.match(html,/preload="metadata"/);assert.match(html,/My Recording/);assert.match(html,/2\.0 MB/);assert.match(html,/Remove from Lesson/);assert.doesNotMatch(html,/<button(?![^>]*type="button")/);}
});
test('in-flight uploads show progress and disable replacement/removal',()=>{
 const html=render('video',{mediaUrl:'/api/school/media?id=old'},{busy:true,progress:{percent:52,label:'Uploading Road Safety.mp4'}});assert.match(html,/<progress max="100" value="52"/);assert.match(html,/Uploading Road Safety.mp4/);assert.match(html,/type="file"[^>]*disabled=""/);assert.equal((html.match(/<button[^>]*disabled=""/g)||[]).length,2);
});
