import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'account-refinement-')),file=join(dir,'logic.mjs');
await build({stdin:{contents:"export * from './lib/accounts/model';export * from './lib/accounts/insights';export * from './lib/accounts/claims';export * from './lib/accounts/history';export * from './lib/accounts/policy';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const api=await import(pathToFileURL(file));after(()=>rm(dir,{recursive:true,force:true}));
const row=(kind,id,extra={})=>({kind,id,name:id,version:0,...extra});
const am={person:'am',id:'am',name:'AM',email:'am@test.test',department:'Account Managers',role:'Employee',owner:false},ops={...am,person:'ops',id:'ops',name:'Ops',department:'Operations',role:'Department Head'},owner={...am,person:'owner',owner:true};
const staff=[row('person','am',{department:'Account Managers',status:'Active'}),row('person','ops',{department:'Operations',title:'Operations Director',status:'Active'})];
const account=row('account','a',{assignee:'am'}),evidence=row('file','e',{accountId:'a',category:'Claim evidence'}),all=[account,evidence];
const base=row('claim','claim',{accountId:'a',date:'2026-09-01',plate:'ABC123',plateState:'TX',assignee:'am',allegation:'Claimant alleges bumper damage.',investigation:'Reviewed both photo sets and operator statement.',finding:'Inconclusive',attachmentIds:['e'],propertyCommunication:'Property informed; next update Friday.',proposedSettlement:100});
const input=r=>Object.fromEntries(['id','kind','version','name','accountId',...api.forms[r.kind].map(f=>f.key)].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
test('health uses all nine weights and requires complete applicable evidence',()=>{
 assert.equal(api.healthScore(account).status,'Not assessed');
 const assessed={...account,service:'Full Patrol'};for(const [key,,max] of api.healthFactors)assessed['health_'+key]=max;
 assert.deepEqual([api.healthScore(assessed).score,api.healthScore(assessed).status],[100,'Healthy']);
 assessed.health_relationship=0;assessed.health_checkin=0;assert.equal(api.healthScore(assessed).status,'Watch');
 delete assessed.health_permits;assessed.service='Basic Patrol';assert.equal(api.healthScore(assessed).score,72);
});
test('vehicle identity search is exact and state disambiguates duplicate plates',()=>{
 const a=row('claim','c',{vin:'1HGCM82633A004352',plate:'ABC-123',plateState:'TX'});
 assert(api.vehicleMatch(a,'abc123','TX'));assert(!api.vehicleMatch(a,'ABC123','CA'));assert(!api.vehicleMatch(a,'ABC'));assert(api.vehicleMatch(a,'1HGCM82633A004352'));assert(!api.vehicleMatch(a,'1HGCM82633A00435'));
});
test('backdated manager attribution is exclusive at transition and rejects ambiguous overlaps',()=>{
 const a=row('affiliation','old',{accountId:'a',contactId:'p1',role:'Property Manager',startDate:'2024-01-01',endDate:'2025-01-01'}),b={...a,id:'new',contactId:'p2',startDate:'2025-01-01',endDate:''};
 assert.equal(api.tenureAt([a,b],'a','2024-12-31').contactId,'p1');assert.equal(api.tenureAt([a,b],'a','2025-01-01').contactId,'p2');assert.equal(api.tenureAt([a,b,{...b,id:'overlap'}],'a','2025-01-02'),undefined);
});
test('AM investigates; only authorized Operations leadership or owners can decide settlements',()=>{
 const pending=api.prepareClaim(input(base),undefined,am,all,staff,'submitClaim');assert.equal(pending.status,'Pending review');
 assert.throws(()=>api.prepareClaim(input({...pending,reviewNotes:'Approve'}),pending,am,all,staff,'approveClaim'),/authorized reviewer|require an authorized reviewer/);
 const approved=api.prepareClaim(input({...pending,reviewNotes:'Evidence reviewed; approved.'}),pending,ops,all,staff,'approveClaim');assert.equal(approved.status,'Approved');assert.equal(approved.approvedAmount,100);
 assert.throws(()=>api.prepareClaim(input({...approved,paidAmount:101,paidDate:'2026-09-02',paymentReference:'ref'}),approved,ops,all,staff,'payClaim'),/within the approved/);
 assert.equal(api.prepareClaim(input({...approved,paidAmount:90,paidDate:'2026-09-02',paymentReference:'ref'}),approved,ops,all,staff,'payClaim').status,'Paid');
 assert(!api.settlementApprover({...am,department:'Operations'},staff));
 assert(!api.settlementApprover({...ops,access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'View'}]},staff));
});
test('approval cannot silently change submitted investigation and a changed submission requires review again',()=>{
 const pending=api.prepareClaim(input(base),undefined,am,all,staff,'submitClaim');
 assert.throws(()=>api.prepareClaim(input({...pending,proposedSettlement:200,reviewNotes:'Approve'}),pending,ops,all,staff,'approveClaim'),/assigned Account Manager|submit again/);
 assert.equal(api.prepareClaim(input({...pending,investigation:'More evidence found'}),pending,am,all,staff,'save').status,'Investigating');
});
test('source collections preserve multiple payments per call and unknown tow dates remain unattributed',async()=>{
 const data=JSON.parse(await readFile('lib/accounts/history-data.json','utf8')),report=api.results([]);
 assert.equal(report.total,data.payments.filter(p=>!p.void).reduce((s,p)=>s+p.cents,0)/100);assert.equal(report.unattributed,report.total);
 assert.equal(new Set(data.payments.map(p=>p.id)).size,data.payments.length);assert(data.payments.length>new Set(data.payments.map(p=>p.callNumber)).size);
 assert(data.vehicles.filter(v=>!v.towDate).length>4000);assert(data.vehicles.every(v=>!('plate' in v)));assert(Object.values(data.profileDefaults).every(p=>Object.keys(p).every(k=>['address','phone'].includes(k))));
});
