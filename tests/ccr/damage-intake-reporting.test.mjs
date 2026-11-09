import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../../lib/ccr/reports-catalog.ts';
import {buildReport,breakdown,filteredLines,uniqueIncidentIntakes} from '../../lib/ccr/reports.ts';
import {ccrOverview} from '../../lib/ccr/overview.ts';
const clock=new Date('2026-11-01T18:00:00Z');
const intake=(id,status,day,extra={})=>({id:'dmi_'+id,title:'Case '+id,status,reportedOn:day,createdAt:'2026-11-01T09:00:00Z',files:[{name:'Not for reports.pdf',documentType:'Repair Estimate'}],summary:'Sealed source narrative',claimReference:'Confidential reference',...extra});
const intakes=[intake('1','Outcome Unverified','2025-07-08',{propertyName:'Property A'}),intake('2','Closed','2026-09-03',{propertyName:'Property B',statusBasis:'Evidence only: total estimate $5,000; parties discussed a settlement.'}),intake('3','Open','2026-10-01')];
const report=(id,overrides={})=>buildReport(catalog.find(r=>r.id===id),{intakes,propertyNamesAllowed:true,...overrides},clock);
test('reports count actual intakes once by source/status/reported month, and never turn allegations, estimates or dates of import into payments or settlements',()=>{
 const source=report('damage-source');assert.equal(source.rows.length,3);assert.deepEqual(breakdown(source.rows).map(x=>[x.group,x.value]),[['Incident Intake',3]]);
 assert.deepEqual(breakdown(report('damage-status').rows).map(x=>[x.group,x.n]),[['Closed',1],['Open',1],['Outcome Unverified',1]]);
 assert.equal(report('damage-month').rows.find(x=>x.id==='intake:dmi_1').group,'2025-07');assert.equal(filteredLines(report('damage-month').rows,{from:'2026-10-01'}).length,1);
 assert.deepEqual(report('damage-property').rows.map(r=>r.group),['Property B','Property A']);
 assert.ok(report('damage-property',{propertyNamesAllowed:false}).rows.every(r=>r.group==='Reported Property (Restricted)'));
 for(const id of ['damage-paid','damage-settled'])assert.deepEqual(report(id).rows,[]);
 for(const id of ['damage-source','damage-month','damage-status','damage-property','damage-paid','damage-settled'])assert.doesNotMatch(JSON.stringify(report(id)),/Sealed source|Confidential reference|Not for reports|5,000/);
});
test('overview keeps unknown outcomes separate from explicitly open intake and never counts closed intakes or source only amounts as open or paid',async()=>{
 const v={id:'user',owner:false,person:'employee',access:['command','damage'].map(tab=>({module:'Compliance, Claims & Recovery',tab,level:'View'}))};
 const s={court:async()=>{throw Error('No grant')},register:async()=>{throw Error('No grant')},claims:async()=>[...intakes.map(i=>({id:'intake:'+i.id,source:'intake',title:i.title,status:i.status})),{id:'a',source:'asset',title:'Tool',status:'Open'}]};
 const o=await ccrOverview(v,s,clock);assert.equal(o.desks.find(d=>d.desk==='damage').open,2);assert.equal(o.intakeClaims,1);assert.equal(o.unverifiedClaims,1);assert.equal(o.assetClaims,1);assert.equal(o.propertyClaims,0);assert.equal(o.recoveryAmount,null);
});

test('known native claim links and unique claim numbers do not double count, but sharing an apartment or an ambiguous reference is not a case link',()=>{
 const as=[intake('a','Open','2026-11-01',{propertyName:'PTE Plaza',claimReference:'REPAIR-12'}),intake('b','Open','2026-11-01',{propertyName:'PTE Plaza'}),intake('c','Open','2026-11-01',{claimReference:'shared-7'}),intake('d','Open','2026-11-01',{claimReference:'HR-90'}),intake('e','Open','2026-11-01')];
 const pr=[{id:'native',kind:'claim',name:'Native case',propertyName:'PTE Plaza',insurerClaimNumber:'repair-12'},{id:'a',kind:'claim',insurerClaimNumber:'SHARED-7'},{id:'t',kind:'claim',insurerClaimNumber:'shared-7'},{id:'dup',kind:'claim',damageIntakeId:as[4].id}];
 const hr=[{id:'hr1',kind:'assetClaim',data:{insurerClaimNumber:'HR-90'}}];
 assert.deepEqual(uniqueIncidentIntakes(as,pr,hr).map(i=>i.id),[as[1].id,as[2].id]);assert.equal(buildReport(catalog.find(r=>r.id==='damage-source'),{intakes:as,propertyClaims:pr,assets:hr},clock).rows.length,7);
});
