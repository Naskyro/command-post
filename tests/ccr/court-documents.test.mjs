import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {courtEntries} from '../../lib/year-history/case-events.ts';
import {ccrOverview} from '../../lib/ccr/overview.ts';
import {caseSignalProjection} from '../../lib/home/pulse-cases.ts';
import {prepareMatter,relatedCourtRecords} from '../../lib/ccr/docket-model.ts';

const v={id:'user-1',person:'person-1',name:'Court Editor',owner:true,role:'Owner'}, at=new Date('2026-10-30T17:00:00Z'), base={title:'Fictional Matter',number:'COURT-012',type:'Victim / Witness Matter',status:'Open',version:0,appearances:[],lawEnforcement:[{id:'pol-1',agency:'Example Police',number:'POL-999',officer:'Example Officer',badge:'77'}],courtName:'Example County Court',courtContact:'Victim Services'};
test('notes preserve a court cause, distinct police references and each signed outcome; no case evidence leaks into property brief',()=>{
 const m=prepareMatter({...base,accountId:'a'},undefined,v,at);
 assert.equal(m.number,'COURT-012');assert.equal(m.lawEnforcement[0].number,'POL-999');
 assert.throws(()=>prepareMatter({...m,status:'Closed',statement:'Resolved'},m,v,at),/disposition/);
 assert.throws(()=>prepareMatter({...m,newOutcome:{result:'Settled',stage:'Before the Hearing'}},m,v,at),/date/);
 assert.throws(()=>prepareMatter({...m,newOutcome:{result:'Settled',on:'2026-10-28'},statement:'Agreement'},m,v,at),/when the settlement/);
 const settled=prepareMatter({...m,status:'Closed',newOutcome:{result:'Settled',on:'2026-10-28',stage:'At the Courthouse Before the Hearing',settlementCents:25000},statement:'Parties signed before the hearing.'},m,v,at);
 const corrected=prepareMatter({...settled,files:[{id:'bogus'}],statements:[],newOutcome:{result:'Settled',on:'2026-10-28',stage:'At the Courthouse Before the Hearing',settlementCents:20500},statement:'Correcting amount per signed copy.'},settled,{...v,name:'Another Reviewer'},new Date(+at+60000));
 assert.deepEqual(corrected.statements.map(s=>s.outcome.settlementCents),[25000,20500]);assert.deepEqual(corrected.statements.map(s=>s.by),['Court Editor','Another Reviewer']);assert.deepEqual(corrected.files,[]);

});
test('an old hearing notice without a ruling is searchable history, never open, scheduled, overdue or closed without a signed disposition',async()=>{
 const unknown=prepareMatter({...base,status:'Outcome Unverified',type:'Lawsuit',filedOn:'2026-10-27',dueOn:'2026-10-28',dueFor:'Old Deadline',appearances:[{id:'x',date:'2026-10-30',status:'Scheduled',label:'Listed Hearing'}]},undefined,v,at);
 const overview=await ccrOverview(v,{court:async()=>[unknown],claims:async()=>[],register:async()=>({items:[],sections:[]})},at);
 assert.equal(overview.desks.find(d=>d.desk==='hearings').open,0);assert.equal(overview.appearances,0);assert(!overview.items.some(x=>x.desk==='hearings'));assert(!caseSignalProjection(v,[],[unknown],'2026-10-30').some(s=>s.items.length));
 const year=courtEntries([unknown]);assert.deepEqual(year[0].openPeriods,[]);assert.equal(year[0].terminal,false);assert.equal(year[0].closedDate,undefined);assert.equal(year[0].status,'Outcome Unverified');
 assert.throws(()=>prepareMatter({...unknown,status:'Closed',statement:'No document yet.'},unknown,v,at),/disposition/);
 const verified=prepareMatter({...unknown,status:'Closed',statement:'Received signed judgment.',newOutcome:{result:'PTE Won',on:'2026-10-28'}},unknown,v,at);assert.equal(courtEntries([unknown,verified])[0].closedDate,'2026-10-28');
});
test('typed evidence is stored encrypted, private, versioned and verified on download',async t=>{
 const sql=new DatabaseSync(':memory:'),bucket=new Map(),tmp=await mkdtemp(join(tmpdir(),'court-docs-'));
 t.after(async()=>{sql.close();delete globalThis.ccrCourtTest;await rm(tmp,{recursive:true,force:true});});
 sql.exec(await readFile('drizzle/0018_ccr_court_docket.sql','utf8'));
 const db={prepare(s){const q=sql.prepare(s);let a=[];return {bind(...p){a=p;return this;},async first(){return q.get(...a)||null;},async all(){return {results:q.all(...a)};},async run(){return {meta:{changes:q.run(...a).changes}};}};}};
 const r2={async put(k,b){bucket.set(k,new Uint8Array(b));},async get(k){return bucket.has(k)?{arrayBuffer:async()=>bucket.get(k).slice().buffer}:null;},async delete(k){bucket.delete(k);}};
 const reader={...v,owner:false,role:'Employee',access:[{module:'Compliance, Claims & Recovery',tab:'hearings',level:'View'}]},blocked={...reader,access:[]};
 globalThis.ccrCourtTest={db,r2,key:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),viewers:{writer:v,reader,blocked}};
 const stubs=new Map([['@/db/finance','export const financeDb=()=>globalThis.ccrCourtTest.db,financeFiles=()=>globalThis.ccrCourtTest.r2;'],['cloudflare:workers','export const env={get HR_DATA_ENCRYPTION_KEY(){return globalThis.ccrCourtTest.key}};'],['@/lib/finance/server','export const requestRoster=async()=>[],requestViewer=async h=>globalThis.ccrCourtTest.viewers[h.get("x-test-actor")],allRecords=async()=>[],identify=(_,h)=>globalThis.ccrCourtTest.viewers[h.get("x-test-actor")];'],['@/lib/accounts/server','export const yearCaseRows=async()=>[];'],['next/server','export const NextResponse={json:Response.json};']]);
 await build({entryPoints:{api:'app/api/ccr/docket/file/route.ts',server:'lib/ccr/docket-server.ts',property:'lib/accounts/today-brief.ts'},outdir:tmp,bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>stubs.has(a.path)?{path:a.path,namespace:'stubs'}:undefined);b.onLoad({namespace:'stubs',filter:/.*/},a=>({contents:stubs.get(a.path)}));}}]});
 const [api,server,property]=await Promise.all(['api','server','property'].map(f=>import(pathToFileURL(join(tmp,f+'.mjs')))));
 const m=await server.updateMatter(v,base),path='/document?id='+m.id;
 const view=JSON.stringify(property.publicCourtBrief([{...m,accountId:'a'}],new Set(['a'])));assert.doesNotMatch(view,/COURT-012|POL-999|Example Officer|Victim Services/);
 const request=(path,actor,body,origin='https://fixture.invalid')=>{const url=new URL(path,'https://fixture.invalid');const r=new Request(url,{method:body?'POST':'GET',...(body?{body}:{}),headers:{origin,'x-test-actor':actor}});Object.defineProperty(r,'nextUrl',{value:url});return r;};
 const upload=(actor,version,kind,origin)=>{const fd=new FormData();fd.set('file',new File(['%PDF-1.6\nprivate fixture\n%%EOF'],'witness.pdf'));fd.set('id',m.id);fd.set('version',String(version));if(kind)fd.set('documentType',kind);return api.POST(request(path,actor,fd,origin));};
 assert.equal((await upload('reader',1,'Victim/Witness Notice')).status,403);assert.equal((await upload('writer',1)).status,400);assert.equal((await upload('writer',1,'Victim/Witness Notice','https://outside.invalid')).status,403);
 const ok=await upload('writer',1,'Victim/Witness Notice');assert.equal(ok.status,200,await ok.clone().text());const m2=await ok.json(),doc=m2.files[0];assert.equal(doc.documentType,'Victim/Witness Notice');assert.equal(doc.byId,v.id);assert.equal(m2.version,2);assert.equal((await upload('writer',1,'Final Judgment')).status,409);
 const revised=await server.updateMatter(v,{...m2,files:[],status:'Closed',statement:'Ruling entered',newOutcome:{result:'PTE Lost',on:'2026-10-28'}});assert.equal(revised.files[0].id,doc.id);
 const postClose=await upload('writer',revised.version,'Final Judgment');assert.equal(postClose.status,200);const newRev=await postClose.json();assert.equal(newRev.status,'Closed');assert.deepEqual(newRev.files.map(d=>d.documentType),['Victim/Witness Notice','Final Judgment']);assert.equal(newRev.statements[0].text,'Ruling entered');
 assert.doesNotMatch(JSON.stringify(sql.prepare('select payload from ccr_docket_versions').all()),/POL-999|witness.pdf|private fixture/);assert(!Buffer.from([...bucket.values()][0]).includes('private fixture'));
 assert.equal((await api.GET(request(path+'&file='+doc.id,'blocked'))).status,403);const download=await api.GET(request(path+'&file='+doc.id,'reader'));assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment/);assert.equal(await download.text(),'%PDF-1.6\nprivate fixture\n%%EOF');
});

test('JP and county proceedings link bidirectionally without guessing from text, duplicate causes or inaccessible records',()=>{
 const jp=prepareMatter({...base,number:'J4-CV-26-000399',statement:'Do not confuse with J1-CV-26-000777.'},undefined,v,at);
 const a=prepareMatter({...base,number:'C-1-CV-26-3311',relatedCauses:['J4-CV-26-000399']},undefined,v,at);
 const stray=prepareMatter({...base,number:'J1-CV-26-000777'},undefined,v,at);
 assert.deepEqual(relatedCourtRecords(jp,[jp,a,stray]).map(m=>m.id),[a.id]);
 assert.deepEqual(relatedCourtRecords(a,[jp,a,stray]).map(m=>m.id),[jp.id]);
 assert.deepEqual(relatedCourtRecords(a,[a,stray]),[]);
 const duplicate={...jp,id:'other-county',courtName:'Another County'};
 assert.deepEqual(relatedCourtRecords(a,[jp,a,duplicate]),[]);
 const explicit=prepareMatter({...a,relatedMatterIds:[jp.id]},a,v,at);
 assert.deepEqual(relatedCourtRecords(explicit,[jp,explicit,duplicate]).map(m=>m.id),[jp.id]);
 assert.throws(()=>prepareMatter({...a,relatedCauses:[a.number]},a,v,at),/itself/);
 assert.throws(()=>prepareMatter({...a,relatedMatterIds:[a.id]},a,v,at),/itself/);
});
