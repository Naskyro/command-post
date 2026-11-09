import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'claim-operations-')),file=join(dir,'logic.mjs');
await build({stdin:{contents:"export * from './lib/ccr/claim-operations';export * from './lib/accounts/claims';export {forms} from './lib/accounts/model';",resolveDir:process.cwd(),loader:'ts'},outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const api=await import(pathToFileURL(file));after(()=>rm(dir,{recursive:true,force:true}));
const row=(kind,id,extra={})=>({kind,id,name:id,version:1,...extra});
const staff=[row('department','department-2',{name:'Road Operations',aliases:['Drivers']}),row('person','active',{name:'Zoe Active',status:'Active',departmentId:'department-2',email:'private@example.test',salary:99999}),row('person','former',{name:'A Legal Name',preferredName:'Ana Former',status:'Former',department:'Drivers'}),row('person','leave',{name:'Li Leave',status:'Leave',coverageRole:'Driver'}),row('person','hr',{name:'HR Staff',status:'Active',department:'People & HR'}),row('person','candidate',{name:'Applicant',status:'Onboarding',department:'Drivers'}),row('person','sample',{name:'Example Driver',status:'Active',department:'Drivers',sample:true}),row('person','am',{name:'Account Manager',status:'Active',department:'Account Managers'})];
const account=row('account','account',{name:'Zulu Apartments',assignee:'am'}),contact=row('contact','contact',{name:'Ána Property'}),rows=[account,row('account','account-2',{name:'alpha flats'}),contact,row('contact','contact-2',{name:'Zara Contact'}),row('contact','demo-contact',{name:'A Sample',sample:true})];
const viewer={id:'am-native',person:'am',name:'Account Manager',department:'Account Managers',role:'Employee',owner:false,access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'Edit'}]};
const claim=row('claim','claim',{accountId:'account',name:'Fixture Claim',date:'2026-01-01',plate:'ABC123',assignee:'am',allegation:'Fixture allegation',accidentInvolved:'Unknown',driverInjury:'Unknown',ownerInjury:'Unknown'});
const payload=r=>Object.fromEntries(['id','kind','version','name','accountId',...api.forms.claim.map(f=>f.key)].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
const update=(r,details={})=>({id:r.id,kind:'claim',version:r.version,accountId:r.accountId,...details});

test('claim roster includes active, former, and leave drivers, resolves renamed departments, and projects no HR details',()=>{
 const choices=api.operationalChoices(staff,rows);
 assert.deepEqual(choices.drivers.map(p=>p.id),['former','leave','active']);
 assert.deepEqual(choices.drivers[0],{id:'former',name:'Ana Former',status:'Former',detail:'Former Driver'});
 assert(!JSON.stringify(choices).includes('salary'));assert(!JSON.stringify(choices).includes('private@example.test'));
 assert.deepEqual(choices.accounts.map(p=>p.id),['account-2','account']);assert.deepEqual(choices.contacts.map(p=>p.id),['contact','contact-2']);
});
test('search is alphabetical, accent-insensitive, and keeps stable IDs for duplicate names',()=>{
 const choices=[{id:'b',name:'Ána Property',detail:'Former Contact'},{id:'z',name:'Zara'},{id:'a',name:'Ána Property'}];
 assert.deepEqual(api.searchClaimChoices(choices,'ana').map(x=>x.id),['a','b']);
 assert.deepEqual(api.searchClaimChoices(choices,'FORMER').map(x=>x.id),['b']);
 assert.deepEqual(api.searchClaimChoices(choices,'missing'),[]);
});
test('former driver validation stamps the roster identity and rejects forged or non-driver selections',()=>{
 assert.deepEqual(api.prepareClaimOperations({driverId:'former',contactId:'contact'}, {},staff,rows,'2026-11-01'),{driverId:'former',contactId:'contact',driverName:'Ana Former',driverStatus:'Former',contactName:'Ána Property'});
 for(const driverId of ['hr','candidate','sample','missing'])assert.throws(()=>api.prepareClaimOperations({driverId},{},staff,rows,'2026-11-01'),/active or former driver/);
 assert.throws(()=>api.prepareClaimOperations({driverId:'former',driverName:'Forged'},{},staff,rows,'2026-11-01'),/Only operational/);
 assert.deepEqual(api.prepareClaimOperations({driverId:'historical-id'},{driverId:'historical-id',driverName:'Historical Driver'},[],rows,'2026-11-01'),{driverId:'historical-id'});
});
test('new claims require explicit incident answers while a legacy claim remains unclassified',()=>{
 const absent={...claim};delete absent.accidentInvolved;delete absent.driverInjury;delete absent.ownerInjury;
 assert.throws(()=>api.prepareClaim(payload(absent),undefined,viewer,rows,staff,'save'),/Answer each accident/);
 const saved=api.prepareClaim(payload(claim),undefined,viewer,rows,staff,'save');assert.equal(saved.driverInjury,'Unknown');
 const legacy=api.prepareClaim(update(absent),absent,viewer,rows,staff,'appendClaimUpdate','New evidence is being reviewed.');assert.equal(legacy.driverInjury,undefined);assert.equal(legacy.accidentInvolved,undefined);
 assert.throws(()=>api.prepareClaimOperations({accidentInvolved:'Maybe'},{},staff,rows,'2026-11-01'),/Yes, No, or Unknown/);
 assert.throws(()=>api.prepareClaimOperations({accidentOn:'2026-02-30'},{},staff,rows,'2026-11-01'),/actual incident date/);
});
test('post-decision details append author and before/after history while every settlement fact remains unchanged',()=>{
 const priorUpdate={at:'2026-01-02T12:00:00Z',by:'Prior Reviewer',byId:'prior',note:'Original update',changes:{}};
 const paid={...claim,status:'Paid',assignee:'former-manager',driverId:'active',driverName:'Zoe Active',driverStatus:'Active',investigation:'Approved investigation',finding:'Inconclusive',proposedSettlement:125,approvedAmount:125,reviewNotes:'Approved on the submitted evidence',reviewedAt:'2026-01-02T10:00:00Z',reviewedBy:'Director',reviewedById:'ops',paidAmount:100,paidDate:'2026-01-03',paymentReference:'CHECK-1',claimUpdatesJson:JSON.stringify([priorUpdate])};
 const next=api.prepareClaim(update(paid,{driverId:'former',driverInjury:'Yes',accidentInvolved:'Yes',accidentOn:'2026-01-01'}),paid,viewer,rows,staff,'appendClaimUpdate','Driver identity verified from the incident log.');
 for(const key of ['status','assignee','investigation','finding','proposedSettlement','approvedAmount','reviewNotes','reviewedAt','reviewedBy','reviewedById','paidAmount','paidDate','paymentReference'])assert.deepEqual(next[key],paid[key],key);
 assert.equal(next.driverId,'former');assert.equal(next.driverName,'Ana Former');assert.equal(next.driverStatus,'Former');
 const history=api.claimCaseUpdates(next.claimUpdatesJson);assert.equal(history.length,2);assert.deepEqual(history[0],priorUpdate);assert.equal(history[1].byId,'am');assert.deepEqual(history[1].changes.driverName,{before:'Zoe Active',after:'Ana Former'});
 const again=api.prepareClaim(update(next),next,viewer,rows,staff,'appendClaimUpdate','Additional source reviewed.');assert.equal(api.claimCaseUpdates(again.claimUpdatesJson).length,3);assert.deepEqual(api.claimCaseUpdates(again.claimUpdatesJson)[1],history[1]);
});
test('supplemental endpoint rejects decision edits, history replacement, unprivileged access, and empty notes',()=>{
 const approved={...claim,status:'Approved',approvedAmount:125};
 for(const patch of [{approvedAmount:500},{status:'Paid'},{investigation:'Rewrite approved report'},{claimUpdatesJson:'[]'}])assert.throws(()=>api.prepareClaim(update(approved,patch),approved,viewer,rows,staff,'appendClaimUpdate','Test note'),/cannot change/);
 assert.throws(()=>api.prepareClaim(update(approved),approved,viewer,rows,staff,'appendClaimUpdate',' '),/case update/);
 assert.throws(()=>api.prepareClaim(update(approved),approved,{...viewer,access:[{module:'Compliance, Claims & Recovery',tab:'damage',level:'View'}]},rows,staff,'appendClaimUpdate','Test note'),e=>e.status===403);
 assert.throws(()=>api.prepareClaim(payload(approved),approved,viewer,rows,staff,'save'),/decision is locked/);
});
