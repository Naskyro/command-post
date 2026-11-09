import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

async function compile(t,contents){
 const dir=await mkdtemp(join(tmpdir(),'delegated-client-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'client.mjs');
 await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',outfile:output,jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'react-runtime',setup(b){b.onResolve({filter:/^(?:react(?:\/jsx-runtime)?|lucide-react|next\/link)$/},args=>({path:import.meta.resolve(args.path==='next/link'?'next/link.js':args.path),external:true}));}}]});
 return import(pathToFileURL(output));
}
function browser(t,url='https://command.test/?module=People%20%26%20HR'){
 const originalWindow=globalThis.window,originalFetch=globalThis.fetch;
 let location=new URL(url);const calls=[],navigations=[],events={};
 const setLocation=value=>{location=new URL(value,location);};
 const nativeFetch=async(input,init)=>{calls.push({input,init});return Response.json({ok:true});};
 const history={state:{},pushState(data,unused,url){this.state=data;if(url!=null)setLocation(url);},replaceState(data,unused,url){this.state=data;if(url!=null)setLocation(url);}};
 const window={get location(){return location;},history,fetch:nativeFetch,addEventListener(name,callback){events[name]=callback;},open(url,target,features){navigations.push({url,target,features});return null;}};
 globalThis.window=window;globalThis.fetch=(...args)=>window.fetch(...args);
 t.after(()=>{if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;globalThis.fetch=originalFetch;});
 return {window,calls,navigations,events,setLocation};
}

test('raw fetch and timed fetch remain read-only after the shared cookie is cleared',async t=>{
 const {window,calls}=browser(t),client=await compile(t,"export * from './lib/shared/client';");
 assert.equal(client.isDelegatedClient(),false);client.lockDelegatedClient();const installed=window.fetch;client.lockDelegatedClient();assert.equal(window.fetch,installed);
 await window.fetch('/api/accounts?surface=manager');assert.equal(new Headers(calls.at(-1).init.headers).get('x-command-read-only'),'1');
 const request=new Request('https://command.test/api/hr/files?id=file',{method:'HEAD',headers:{'x-test':'original'}});
 await window.fetch(request);assert.equal(calls.at(-1).input,request);assert.equal(new Headers(calls.at(-1).init.headers).get('x-test'),'original');
 await client.timedFetch(request);assert.equal(new Headers(calls.at(-1).init.headers).get('x-test'),'original');assert.equal(new Headers(calls.at(-1).init.headers).get('x-command-read-only'),'1');
 for(const method of ['POST','PATCH','PUT','DELETE']){const before=calls.length,response=await window.fetch('/api/hr',{method});assert.equal(response.status,403);assert.match((await response.json()).error,/read-only/);assert.equal(calls.length,before);}
 const before=calls.length;assert.equal((await window.fetch(new Request('https://command.test/api/school',{method:'POST'}))).status,403);assert.equal(calls.length,before);
 await window.fetch('/api/delegated-access',{method:'POST',body:JSON.stringify({action:'end'})});assert.equal(calls.length,before+1);assert.equal(new Headers(calls.at(-1).init.headers).get('x-command-read-only'),'1');
 // No cookie or session state can unwrap a document that has shown an employee.
 window.cookie='';await window.fetch('/api/hr?person=p');assert.equal(new Headers(calls.at(-1).init.headers).get('x-command-read-only'),'1');assert.equal(client.isDelegatedClient(),true);
 const headers={Authorization:'public-test'};await window.fetch('https://other.test/api/read',{headers});assert.equal(calls.at(-1).init.headers,headers);
 await window.fetch('/assets/static-image.svg');assert.equal(new Headers(calls.at(-1).init.headers).get('x-command-read-only'),'1');
 await window.fetch('/?module=Home');assert.equal(new Headers(calls.at(-1).init.headers).get('x-command-read-only'),'1');
 const beforeAction=calls.length;assert.equal((await window.fetch('/',{method:'POST',headers:{'next-action':'action'}})).status,403);assert.equal(calls.length,beforeAction);
});

test('a restrictive URL bootstraps before the first request and survives history, new tabs, and stale navigation',async t=>{
 const {window,calls,navigations,events,setLocation}=browser(t,'https://command.test/people/accident-followups?driverId=p&_command_view=0');
 const client=await compile(t,"export * from './lib/shared/client';");assert.equal(client.isDelegatedClient(),true);
 await window.fetch('/api/session');assert.equal(new Headers(calls[0].init.headers).get('x-command-read-only'),'1');assert.equal(window.location.searchParams.get('_command_view'),'1');
 for(const path of ['/api/hr/accident-reports/print?caseId=c&reportId=r','/api/school/media?id=m','/?module=Finance#record','/people/accident-followups?driverId=p']){const marked=new URL(client.delegatedUrl(path),window.location);assert.equal(marked.searchParams.get('_command_view'),'1');assert.equal(client.delegatedUrl(marked),marked.href);}
 for(const value of ['https://outside.test/api/hr','blob:https://command.test/local','data:text/plain,hello','mailto:someone@example.test','#report'])assert.equal(client.delegatedUrl(value),value);
 window.history.pushState({step:1},'','/?module=Accounts');assert.equal(window.location.searchParams.get('_command_view'),'1');
 window.history.replaceState({step:2},'','/?module=Finance');assert.equal(window.location.searchParams.get('_command_view'),'1');
 setLocation('https://command.test/?module=Home');events.popstate();assert.equal(window.location.searchParams.get('_command_view'),'1');
 window.open('/api/hr/files?id=f','_blank','noopener');assert.equal(new URL(navigations[0].url,window.location).searchParams.get('_command_view'),'1');
 assert.equal((await window.fetch('/api/school',{method:'POST'})).status,403);
});

test('real module children render while navigation, search, and detail inspection stay distinct from writes',async t=>{
 const ui=await compile(t,"export * from './lib/admin/delegated-ui';export * from './components/admin/DelegatedWorkspace';");
 for(const label of ['View Claim','Open Record','Edit Claim Details','Review Record','Close','Cancel','Return to My Account','Search','Filter by Status','Reset Filters','Add Filter','Preview PDF','Download Original','Next Lesson','Previous Photo','Copy Reference'])assert.equal(ui.delegatedMutationControl({label}),false,label);
 for(const label of ['Save Details','Submit Claim','Approve Settlement','Return for Investigation','Close without settlement','Delete Claim','Upload & Save Audio','Record Contact','Mark Complete','Clock In','New Claim','Send Email','Review & Sign'])assert.equal(ui.delegatedMutationControl({label}),true,label);
 assert.equal(ui.delegatedMutationControl({label:'New Hires',navigation:true}),false);assert.equal(ui.delegatedMutationControl({inputType:'file'}),true);assert.equal(ui.delegatedMutationControl({href:'/command-access/sign-out'}),true);
 assert.equal(ui.delegatedReadForm('Search Records'),true);assert.equal(ui.delegatedReadForm('Save Record'),false);
 const html=renderToStaticMarkup(createElement(ui.DelegatedWorkspace,{module:'People & HR'},createElement('article',null,createElement('h2',null,'Actual Personnel Details'),createElement('button',null,'View History'))));
 assert.match(html,/Actual Personnel Details/);assert.match(html,/View History/);assert.match(html,/Saving, sending, uploading, and approvals are disabled/);assert.doesNotMatch(html,/Details Are Restricted|Loading employee workspace/);
});

test('native video, audio, document and profile sources carry the marker before render starts loading them',async t=>{
 browser(t,'https://command.test/?_command_view=1');
 const ui=await compile(t,"export {default as Media} from './components/school/LessonMediaEditor';export {default as Avatar} from './components/people/PersonAvatar';export {default as Cover} from './components/school/CourseCover';export {default as Reading} from './components/school/ReadingContent';export {default as Followups} from './components/people/AccidentFollowups';");
 for(const kind of ['video','audio','reading']){
  const html=renderToStaticMarkup(createElement(ui.Media,{course:{id:'c',title:'Training'},lesson:{id:'l',kind,title:'Lesson',mediaUrl:'/api/school/media?id=m',mediaMime:kind==='reading'?'image/png':kind+'/example'},busy:false,onUpload:()=>{},onRemove:()=>{}}));
  assert.match(html,/src="\/api\/school\/media\?id=m&amp;_command_view=1"/);
 }
 const avatar=renderToStaticMarkup(createElement(ui.Avatar,{personId:'p',name:'Driver'}));assert.match(avatar,/_command_view=1/);
 const reading=renderToStaticMarkup(createElement(ui.Reading,{text:'![Document image](/api/school/media?id=scan)'}));assert.match(reading,/src="\/api\/school\/media\?id=scan&amp;_command_view=1"/);
 const cover=renderToStaticMarkup(createElement(ui.Cover,{course:{id:'c',title:'Training',coverMediaId:'cover-12345678-1234-1234-1234-123456789abc'}}));assert.match(cover,/src="\/api\/school\/cover\?id=cover-12345678-1234-1234-1234-123456789abc&amp;_command_view=1"/);
 // The standalone page cannot mount medical list/report loaders until verified.
 const initial=renderToStaticMarkup(createElement(ui.Followups));assert.match(initial,/Verifying your account/);assert.doesNotMatch(initial,/Linked Accidents|Driver Accident Reports|Report History/);
});

test('actual hrefs remain marked for copied links, middle-click, context menus, and newly rendered records',async t=>{
 browser(t);const saved={document:globalThis.document,Element:globalThis.Element,MutationObserver:globalThis.MutationObserver};
 const elements=[],listeners={};let refresh;
 class DomElement{
  constructor(tag,attributes){this.tag=tag;this.attributes=new Map(Object.entries(attributes));elements.push(this);}
  getAttribute(name){return this.attributes.get(name)||null;}
  setAttribute(name,value){this.attributes.set(name,value);}
  closest(){return this.tag==='a'?this:null;}
 }
 globalThis.Element=DomElement;
 globalThis.document={documentElement:{},querySelectorAll(selector){return elements.filter(el=>selector.split(',').some(part=>{const match=part.match(/^(\w+)\[(\w+)(?:=[^\]]+)?\]/);return match&&el.tag===match[1]&&el.getAttribute(match[2]);}));},addEventListener(name,callback){listeners[name]=callback;}};
 globalThis.MutationObserver=class{constructor(callback){refresh=callback;}observe(){}};
 t.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 const documentLink=new DomElement('a',{href:'/api/hr/files?id=f'}),external=new DomElement('a',{href:'https://outside.test/report'}),frame=new DomElement('iframe',{src:'/api/school/media?id=m'});
 const client=await compile(t,"export * from './lib/shared/client';");client.lockDelegatedClient();
 assert.match(documentLink.getAttribute('href'),/_command_view=1/);assert.match(frame.getAttribute('src'),/_command_view=1/);assert.equal(external.getAttribute('href'),'https://outside.test/report');
 const later=new DomElement('a',{href:'/people/accident-followups?driverId=p'});refresh();assert.match(later.getAttribute('href'),/_command_view=1/);
 for(const event of ['click','auxclick','contextmenu']){later.setAttribute('href','/api/hr/accident-reports/print?caseId=c&reportId=r');listeners[event]({target:later});assert.match(later.getAttribute('href'),/_command_view=1/,event);}
});

test('learning and policy detail previews stay visible without starting attempts, games, or signatures',async t=>{
 browser(t,'https://command.test/?_command_view=1');
 const ui=await compile(t,"export {default as Policy} from './components/sop/SopSignatureReader';export {default as Quiz} from './components/school/LearnerQuiz';export {default as Game} from './components/school/LearnerGame';");
 const policy=renderToStaticMarkup(createElement(ui.Policy,{policy:{id:'policy',version:3,code:'SAFE-1',content:{title:'Driver Safety',sections:[{heading:'Procedure',text:'Review the current procedure.'}]}},url:'/api/sop/pdf?id=policy',signerNames:['Driver'],attestation:'I reviewed this policy.',onOpened:async()=>{throw Error('Must not record an opening while rendering');},onSign:async()=>{throw Error('Must not sign in employee view');}}));
 assert.match(policy,/Read as Text/);assert.match(policy,/SAFE-1/);assert.match(policy,/<input[^>]*disabled=""/);assert.match(policy,/<button[^>]*disabled=""[^>]*><svg[^]*Sign Policy/);
 const lesson={id:'lesson',kind:'quiz',title:'Knowledge Check',questions:[{id:'q',prompt:'Question',type:'choice',options:['A','B'],points:1}],maxAttempts:3,passingScore:80};
 const course={id:'course',title:'Driver Safety',status:'Published',lessons:[lesson]};
 const quiz=renderToStaticMarkup(createElement(ui.Quiz,{course,lesson,data:{attempts:[],viewer:{personId:'p'}},onRefresh:async()=>{},onContinue:()=>{}}));
 assert.match(quiz,/Knowledge Check/);assert.match(quiz,/Attempts Remaining/);assert.match(quiz,/<button[^>]*disabled=""[^>]*>[^]*Start Exam/);
 const game=renderToStaticMarkup(createElement(ui.Game,{course,onClose:()=>{},onRefresh:async()=>{}}));assert.match(game,/Driver Safety/);assert.match(game,/<button[^>]*disabled=""[^>]*>[^]*Generate My Board/);
});
