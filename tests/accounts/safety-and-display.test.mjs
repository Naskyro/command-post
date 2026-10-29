import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'command-post-safety-')),file=join(dir,'logic.mjs');
await build({stdin:{contents:"export * from './lib/safety/model';export * from './lib/safety/access';export * from './lib/accounts/policy';export * from './lib/accounts/display';export * from './lib/accounts/list-view';export * from './lib/accounts/management-research';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const a=await import(pathToFileURL(file));after(()=>rm(dir,{recursive:true,force:true}));
const row=(kind,id,extra={})=>({kind,id,name:id,version:0,...extra});
const am={id:'am',person:'am',name:'AM',department:'Account Managers',role:'Employee',owner:false},dispatch={...am,id:'d',person:'d',department:'Dispatch'},head={...am,id:'h',person:'h',role:'Department Head',department:'Operations'},driver={...am,department:'Drivers'};
const vehicle={vin:'1HGCM82633A004352',plate:'ABC123',plateState:'TX',description:'Sedan',relationship:'Vehicle associated with caller'},base={name:'Test person',incidentDate:'2026-08-01',location:'Company yard',behavior:'Threatening behavior reported by dispatcher.',vehiclesJson:JSON.stringify([vehicle])};
const c=row('trespass','c',{...base,watchFrom:'2026-09-07',watchEnabled:true,caseStatus:'Open'});
test('dispatch and AM share case access; explicit view-only grants cannot edit or clear',()=>{
 assert(a.safetyAccess(dispatch,true));assert(a.safetyAccess(am,true));assert(a.safetyReviewer(am));assert(a.safetyReviewer(head));assert(!a.safetyReviewer(dispatch));assert(!a.safetyAccess(driver));assert(!a.safetyReviewer({...head,access:[{module:'Accounts',tab:'safety',level:'View'}]}));
});
test('missing property values disappear without hiding zero or explicit No',()=>{
 for(const v of [undefined,null,'','   ','Not recorded','N/A','Not confirmed','Not applicable'])assert(!a.hasDetail(v));for(const v of [0,false,'No','Do not tow','6pm - 7am'])assert(a.hasDetail(v));assert.equal(a.phoneLink('N/A'),'');assert.equal(a.phoneLink('(512) 555-1212'),'tel:5125551212');
});
test('vehicle alerts require full VIN or a complete plate plus state',()=>{
 assert(a.exactVehicle(vehicle,{vin:vehicle.vin}));assert(a.exactVehicle(vehicle,{plate:'abc-123',plateState:'TX'}));assert(!a.exactVehicle(vehicle,{plate:'ABC123',plateState:'CA'}));assert(!a.exactVehicle(vehicle,{plate:'ABC123'}));assert(!a.exactVehicle(vehicle,{vin:'1HGCM82633A00435'}));assert(!a.exactVehicle(vehicle,{description:'Sedan'}));
});
test('a historical incident does not create urgent alerts from old vehicle records',()=>{
 const oldCall=row('vehicle','old',{...vehicle,towDate:'2026-08-05'});assert.equal(a.safetyAlerts([c],[oldCall],'2026-09-07').length,0);
 const saved=a.prepareCase(base,undefined,dispatch,[],'2026-09-07');assert.equal(saved.incidentDate,'2026-08-01');assert.equal(saved.watchFrom,'2026-09-07');
});
test('clearing an occurrence preserves history; a new return produces a new alert',()=>{
 const first=row('vehicle','return-1',{...vehicle,towDate:'2026-09-07'}),second=row('vehicle','return-2',{...vehicle,towDate:'2026-09-08'});
 const [alert]=a.safetyAlerts([c],[first],'2026-09-07');const review=row('safetyReview','review',{caseId:c.id,alertId:alert.id});const remaining=a.safetyAlerts([c,review],[first,second],'2026-09-08');assert.equal(remaining.length,1);assert.equal(remaining[0].id,'c::return-2');assert.equal(a.matchingCases([c],vehicle).length,1);
});
test('explicit current safety incidents can be alerted independently of historical vehicle monitoring',()=>{
 const off={...c,watchEnabled:false},event=row('safetyEvent','e',{caseId:'c',raiseAlert:true,encounterDate:'2026-09-07',staffGuidance:'Contact Dispatch before assisting.'});assert.equal(a.safetyAlerts([off,event],[],'2026-09-07').length,1);assert.equal(a.safetyAlerts([off,{...event,raiseAlert:false}],[],'2026-09-07').length,0);
});
test('dispatch can update facts but cannot resolve a case or disable alerts',()=>{
 assert.equal(a.prepareCase({...base,version:0,behavior:'Additional reported behavior'},c,dispatch,[],'2026-09-07').behavior,'Additional reported behavior');assert.throws(()=>a.prepareCase({...base,version:0,caseStatus:'Resolved'},c,dispatch,[],'2026-09-07'),/Account Manager/);assert.throws(()=>a.prepareCase({...base,version:0,watchEnabled:false},c,dispatch,[],'2026-09-07'),/Account Manager/);
});
test('management disposition and warrants need their supporting details',()=>{
 assert.throws(()=>a.prepareCase({...base,version:0,caseStatus:'Resolved'},c,am,[],'2026-09-07'),/final disposition/);assert.throws(()=>a.prepareCase({...base,warrantStatus:'Confirmed active'},undefined,am,[],'2026-09-07'),/source and date/);assert.throws(()=>a.prepareCase({...base,incidentDate:'2026-09-31'},undefined,am,[],'2026-09-07'),/valid/);
 const r=a.prepareCase({...base,version:0,caseStatus:'Resolved',finalDisposition:'Case follow-up concluded.',dispositionDate:'2026-09-07'},c,am,[],'2026-09-07');assert.equal(r.caseStatus,'Resolved');assert.equal(r.watchEnabled,true);
});
test('optimistic concurrency rejects stale case edits',()=>assert.throws(()=>a.prepareCase({...base,version:0},{...c,version:2},am,[],'2026-09-07'),/record changed/));
test('generic account editing cannot bypass the safety workflow or evidence protection',()=>{
 for(const kind of ['trespass','safetyEvent','safetyReview','safetyUpdate','accountView'])assert.throws(()=>a.clean(row(kind,'test'),undefined,{...am,owner:true},[],[]),/register/);
 const file=row('file','f',{category:'Trespass evidence'});assert(!a.canReadFile(driver,file));assert(a.canReadFile(dispatch,file));assert.throws(()=>a.clean({...file,category:'Other'},file,{...am,owner:true},[],[]),/register/);
});
test('evidence accepts actual media signatures and rejects disguised HTML',()=>{
 assert.equal(a.evidenceMime('id.pdf',new TextEncoder().encode('%PDF-1.7')),'application/pdf');assert.equal(a.evidenceMime('incident.mp4',new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])),'video/mp4');assert.throws(()=>a.evidenceMime('id.jpg',new TextEncoder().encode('<html>untrusted</html>')),/Choose/);
});
test('column preferences preserve a usable identity column and default by role',()=>{
 assert(!a.defaultAccountColumns(false).includes('assignee'));assert(a.defaultAccountColumns(true).includes('assignee'));assert(a.validAccountColumns(['property','jurisdiction','service']));for(const x of [[],['service'],['property','property'],['property','revenue'],['company','property']])assert(!a.validAccountColumns(x));
});
test('researched companies fill gaps without replacing an existing company assignment',()=>{
 assert(a.researchedManagement(row('account','account:altura')).companyId);assert.deepEqual(a.researchedManagement(row('account','account:altura',{companyId:'existing'})),{});assert.deepEqual(a.researchedManagement(row('account','unmatched')),{});
});

test('researched company records remain editable in the company form',()=>{for(const r of a.researchedCompanies)assert.equal(a.clean(r,undefined,{...am,owner:true},[],[]).type,'Management company');});
