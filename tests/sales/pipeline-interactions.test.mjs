// Fast, browser-independent check of the real React DOM renderer and its delegated
// DOM events. This minimal host does *not* emulate layout, focus or CSS; test
// those separately with pipeline-interactions.browser.mjs in Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {fakeSales} from './pipeline-fixture.mjs';
const require=createRequire(import.meta.url);
test('React DOM dispatch preserves actual lead IDs, filtered rows and per-person pipeline preferences',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cp-pipeline-dom-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const bundle=join(dir,'pipeline.cjs'),repo=fileURLToPath(new URL('../../',import.meta.url));
 await build({stdin:{contents:"export {default as R} from 'react';export {flushSync} from 'react-dom';export {createRoot} from 'react-dom/client';export {default as Sales} from './components/sales/SalesPipeline';",resolveDir:repo,loader:'js'},absWorkingDir:repo,outfile:bundle,bundle:true,format:'cjs',platform:'node',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}});
 const before=Object.fromEntries(['document','window','Element','HTMLElement','Node','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const [k,d] of Object.entries(before)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});

class N{
 constructor(doc,name,type=1,ns='http://www.w3.org/1999/xhtml'){this.ownerDocument=doc;this.nodeType=type;this.nodeName=name;this.tagName=type===1?name:undefined;this.namespaceURI=ns;this.childNodes=[];this.parentNode=null;this.listeners={};this.style={setProperty:(k,v)=>this.style[k]=v,removeProperty:k=>delete this.style[k]};this.attrs={};}
 get options(){return this.childNodes.filter(x=>x.nodeName==='OPTION');}
 get firstChild(){return this.childNodes[0]||null}get lastChild(){return this.childNodes.at(-1)||null}get nextSibling(){let arr=this.parentNode?.childNodes;return arr?.[arr.indexOf(this)+1]||null}
 get textContent(){return this.nodeType===3?this.nodeValue:this.childNodes.map(x=>x.textContent).join('')}
 set textContent(t){this.childNodes=[];if(t&&this.nodeType!==3)this.appendChild(this.ownerDocument.createTextNode(t));else if(this.nodeType===3)this.nodeValue=t}
 addEventListener(k,f,opts){(this.listeners[k]??=[]).push([f,opts===true||!!opts?.capture]);}
 removeEventListener(k,f){this.listeners[k]=this.listeners[k]?.filter(([x])=>x!==f)||[]}
 appendChild(n){return this.insertBefore(n,null)}
 insertBefore(n,b){n.parentNode?.removeChild(n);let ix=b?this.childNodes.indexOf(b):this.childNodes.length;this.childNodes.splice(ix,0,n);n.parentNode=this;return n}
 removeChild(n){let ix=this.childNodes.indexOf(n);if(ix>=0)this.childNodes.splice(ix,1);n.parentNode=null;return n}
 setAttribute(k,v){this.attrs[k]=String(v)}setAttributeNS(ns,k,v){this.setAttribute(k,v)}getAttribute(k){return this.attrs[k]??null}hasAttribute(k){return k in this.attrs}removeAttribute(k){delete this.attrs[k]}
 contains(n){return n===this||this.childNodes.some(x=>x.contains(n))}
}
const doc=new N(null,'#document',9);doc.ownerDocument=doc;doc.createElement=(n)=>new N(doc,n.toUpperCase());doc.createElementNS=(ns,n)=>new N(doc,n,1,ns);doc.createTextNode=t=>{const n=new N(doc,'#text',3);n.nodeValue=String(t);return n};doc.documentElement=doc.createElement('html');doc.body=doc.createElement('body');doc.documentElement.appendChild(doc.body);doc.appendChild(doc.documentElement);
const events=new N(doc,'WINDOW',0);global.document=doc;global.window=Object.assign(events,{document:doc,HTMLIFrameElement:class{},HTMLInputElement:class{},HTMLSelectElement:class{},location:{protocol:'http:'}});doc.defaultView=global.window;global.HTMLElement=N;global.Element=N;global.Node=N;
const saved=new Map();global.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
const {R,createRoot,flushSync,Sales}=require(bundle);
const el=doc.createElement('div');doc.body.appendChild(el);let root=createRoot(el);let opened='',filter=false,person='alpha';
const owners={a:'Example Alpha',b:'Example Beta'};const data=fakeSales();const all=data.records,stages=data.stages;
function props(){return {rows:filter?all.filter(x=>x.assignee==='a'&&x.name.startsWith('Juniper')):all,stages,ownerName:id=>owners[id]||'Unassigned',person,onOpen:id=>opened=id,card:r=>R.createElement('button',{key:r.id,onClick:()=>opened=r.id},r.name),onClear:()=>{filter=false;render()},hasFilter:filter}}
function render(){flushSync(()=>root.render(R.createElement(Sales,{...props(),key:person})))}
function walk(n,p,out=[]){if(p(n))out.push(n);for(const c of n.childNodes)walk(c,p,out);return out}
const buttons=(label)=>walk(el,n=>n.nodeName==='BUTTON'&&(typeof label==='string'?(n.getAttribute('aria-label')||n.textContent)===label:label?.test(n.getAttribute('aria-label')||n.textContent)));
function clickButton(label,at=0){const n=buttons(label)[at];assert(n&&n.disabled!==true,'usable button '+label+' found in '+el.textContent.slice(0,550));emit(n,'click')}
function emit(target,type){const n={type,target,button:0,bubbles:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true},stopPropagation(){},composedPath:()=>[]};let chain=[];for(let x=target;x;x=x.parentNode)chain.push(x);flushSync(()=>{for(const x of [...chain].reverse())for(const [l,c] of x.listeners[type]||[])if(c)l.call(x,n);for(const x of chain)for(const [l,c] of x.listeners[type]||[])if(!c)l.call(x,n);});}
const tick=()=>new Promise(r=>setTimeout(r,10));
render();await tick();assert(buttons('Calendar')[0]&&!buttons('Calendar')[0].disabled);assert(!el.textContent.includes('Closed Win'));assert(el.textContent.includes('$6,300'));
clickButton('List');clickButton(/^Not Engaged/);assert(buttons('Juniper Court').length===1);clickButton('Juniper Court');assert.equal(opened,'b2');clickButton('Collapse All');assert.equal(buttons('Juniper Court').length,0);clickButton('Expand All');assert.equal(buttons('Juniper Court').length,2);
const select=walk(el,n=>n.nodeName==='SELECT')[0];select.value='Assignee';emit(select,'change');assert(el.textContent.includes('Example Alpha')&&el.textContent.includes('Example Beta'));clickButton(/^Example Beta/);
const stored=JSON.parse(saved.get('command:sales:pipeline:v1:alpha'));assert.equal(stored.view,'List');assert.equal(stored.group,'Assignee');assert(stored.collapsed.includes('owner:b'));
flushSync(()=>root.unmount());root=createRoot(el);render();await tick();assert.equal(buttons('List')[0].getAttribute('aria-pressed'),'true');assert.equal(buttons(/^Example Beta/)[0].getAttribute('aria-expanded'),'false');
filter=true;render();clickButton('Board');clickButton('Juniper Court');assert.equal(opened,'a1');clickButton('Calendar');assert.equal(buttons('Juniper Court').length,1);clickButton('Juniper Court');assert.equal(opened,'a1');clickButton('Collapse All');assert.equal(buttons('Juniper Court').length,0);clickButton('Expand All');clickButton('Next Month');clickButton(/^Go to /);assert.equal(buttons('Juniper Court').length,1);
filter=false;render();const unscheduled=buttons('Juniper Court').at(-1);emit(unscheduled,'click');assert.equal(opened,'b2');person='beta';render();await tick();assert.equal(buttons('Board')[0].getAttribute('aria-pressed'),'true');assert.equal(saved.has('command:sales:pipeline:v1:beta'),false);
flushSync(()=>root.unmount());
});
