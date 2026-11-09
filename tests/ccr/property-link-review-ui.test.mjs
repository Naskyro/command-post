import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const dir=await mkdtemp(join(process.cwd(),'.sites-runtime/property-link-ui-'));
test.after(()=>rm(dir,{recursive:true,force:true}));
await build({entryPoints:['components/ccr/CourtPropertyReconciliation.tsx'],outfile:join(dir,'ui.mjs'),bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime','lucide-react'],loader:{'.css':'empty'},plugins:[{name:'dialog-preview',setup(b){b.onResolve({filter:/^@\/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"import {createElement} from 'react';export const Dialog=({children})=>children;export const DialogContent=({children,className})=>createElement('section',{className},children);export const DialogTitle=({children})=>createElement('h2',{},children);export const DialogDescription=({children})=>createElement('p',{},children);"}));}}]});
const {default:Review,CourtPropertyReviewForm}=await import(pathToFileURL(join(dir,'ui.mjs')).href);
const properties=[{id:'account:b',name:'Barton Place',address:'100 Barton Road'},{id:'account:a',name:'Anderson Place',address:'200 Anderson Road'}];
const matter={id:'case-one',version:1,title:'A Resident Tow Hearing',number:'J2-CV-12345',courtName:'Travis County Justice Court, Precinct 2',type:'Tow Hearing',status:'Open',filedOn:'',dueOn:'',dueFor:'',appearances:[],statements:[],createdAt:'2026-11-01',createdBy:'Clerk',updatedAt:'2026-11-01',updatedBy:'Clerk',actorId:'clerk',files:[]};
const callbacks={onSaved(){throw Error('Rendering must not save a link');},onOpenCase(){},onAttach(){}};
const render=(c,props)=>renderToStaticMarkup(createElement(c,props));
test('a case with no PDF has a complete manual review path without an upload or technical identifiers',()=>{
 const html=render(CourtPropertyReviewForm,{matter,properties,...callbacks});
 assert.match(html,/No document is attached/);assert.match(html,/manual property link/);assert.match(html,/Select the Property \/ Account/);assert.match(html,/Why Does This Case Belong to That Property/);assert.match(html,/manual review — original PDF not verified/);
 assert.match(html,/<option value="manual" selected/);assert.match(html,/Review This Property Link/);assert.match(html,/<button[^>]*disabled=""[^>]*>/);assert.doesNotMatch(html,/type="file"|sha256|Reviewed Property Link Packet/);
});
test('original document selection uses readable filenames and existing protected links',()=>{
 const file={id:'original',name:'Court Notice.pdf',type:'application/pdf',sha256:'a'.repeat(64),documentType:'Court Notice',bytes:100,at:'2026-11-01',by:'Clerk',byId:'clerk'};
 const html=render(CourtPropertyReviewForm,{matter:{...matter,accountId:'account:a',files:[file]},properties,...callbacks});
 assert.match(html,/Currently Linked Property/);assert.match(html,/Anderson Place/);assert.match(html,/Download Court Notice.pdf/);assert.match(html,/\/api\/ccr\/docket\/file\?id=case-one&amp;file=original/);assert.match(html,/Page You Checked/);assert.match(html,/Property Name or Address as Printed/);assert.doesNotMatch(html,/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
});
test('the main flow lists existing cases and keeps retired import controls absent',()=>{
 const html=render(Review,{rows:[matter,{...matter,id:'case-two',number:'J2-CV-54321',title:'Another Hearing',accountId:'account:b'}],properties,...callbacks});
 assert.match(html,/No upload is needed to start/);assert.match(html,/Choose a Case/);assert.match(html,/J2-CV-12345/);assert.match(html,/J2-CV-54321/);assert.match(html,/Barton Place/);assert.match(html,/Review the Property Match/);
 assert.doesNotMatch(html,/cpr-advanced|Import a Prepared JSON List|Download JSON Example|court-property-link-example\.json|Choose a Prepared JSON List|type="file"/);
});
