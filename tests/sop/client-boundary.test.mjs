/**
 * Run after building: an employee must not be able to recover any restricted
 * SOP by downloading the public application assets instead of using the API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
const root=new URL('../../',import.meta.url);
async function json(file){return JSON.parse(await readFile(new URL('lib/sop/private/'+file+'.json',root),'utf8'))}
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});return(await Promise.all(entries.map(e=>e.isDirectory()?files(path.join(dir,e.name)):path.join(dir,e.name)))).flat()}
test('public build and static files contain no imported SOP pages or restricted source text', async()=>{
 const [catalog,objects,refs]=await Promise.all(['catalog','objects','original-files'].map(json));
 const useCounts=new Map();
 for(const parts of Object.values(refs))for(const i of new Set(parts))useCounts.set(i,(useCounts.get(i)||0)+1);
 // Sample actual document narrative and a nonshared encoded PDF object for each policy.
 // Skip fonts, headers, and templates that legitimately occur across documents.
 const markers=[];
 for(const doc of catalog){
  const section=doc.content.sections.map(s=>s.text).filter(s=>s.length>100).sort((a,b)=>b.length-a.length)[0];
  const phrase=section?.match(/[A-Za-z][a-zA-Z ,;:()/-]{75,175}/)?.[0];
  if(phrase)markers.push([doc.id,Buffer.from(phrase)]);
  const i=refs[doc.id].filter(i=>useCounts.get(i)===1&&objects[i].length>512).at(-1);
  if(i!==undefined)markers.push([doc.id,Buffer.from(objects[i].slice(200,340))]);
 }
 assert(markers.length>=catalog.length,'Expected substantial restricted text or PDF bytes for each document');
 const clientDir=new URL('dist/client/',root).pathname;
 assert((await stat(clientDir)).isDirectory(),'Build the site before running this test');
 const publicFiles=await files(clientDir);
 assert(publicFiles.some(f=>f.endsWith('.js')),'Built client JavaScript is required');
 for(const file of publicFiles){
   const b=await readFile(file);
   for(const [policy,m] of markers)if(b.includes(m))assert.fail('Restricted SOP '+policy+' is present in '+path.relative(clientDir,file));
 }
});
