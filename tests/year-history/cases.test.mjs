import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {courtEntries,releaseEntries,propertyClaims,assetEntries,safetyEntries,oldPropertyClaim} from '../../lib/year-history/case-events.ts';
import {filterYear} from '../../lib/year-history/model.ts';

const am='Account Management',ccr='Compliance, Claims & Recovery';
const day=y=>y+'-06-01T18:00:00.000Z',stmt=y=>({text:'Sensitive, do not project',at:day(y)});
const matter=(version,status,at,statements,appearances=[])=>({id:'court1',version,title:'Case fixture',type:'Tow Hearing',status,filedOn:'2023-02-01',createdAt:day(2023),updatedAt:day(at),statements,appearances});
const event=(id,date,status)=>({id,label:'Court Date',date,status});
test('real court status transitions survive notes, reopening and subsequent changes without duplication',()=>{
 const revisions=[matter(1,'Open',2023,[]),matter(2,'Closed',2023,[stmt(2023)]),matter(3,'Closed',2024,[stmt(2023),stmt(2024)]),matter(4,'Open',2025,[stmt(2023),stmt(2024)],[event('h','2026-01-23','Scheduled')]),matter(5,'Closed',2026,[stmt(2023),stmt(2024),stmt(2026)],[event('h','2026-01-23','Attended')])];
 const rows=courtEntries(revisions);assert.equal(rows.length,2);const c=rows[0];assert.equal(c.closedDate,'2026-06-01');assert.deepEqual(c.openPeriods,[{start:'2023-02-01',end:'2023-06-01'},{start:'2025-06-01',end:'2026-06-01'}]);
 for(const [year,expected] of [[2023,0],[2024,0],[2025,1],[2026,0]])assert.equal(filterYear(rows,{module:ccr,view:'open-at-close',year},'2027-02-14').total,expected);
 assert.equal(filterYear(rows,{module:ccr,view:'activity',year:2024},'2027-02-14').total,1);
 assert.equal(rows[1].closedDate,'2026-01-23');assert.doesNotMatch(JSON.stringify(rows),/Sensitive/);
});
test('release financial totals distinguish actual adjustments, unknown and requests that never completed',()=>{
 const releases=(id,releaseType,status,other={})=>({id,kind:'courtesy',accountId:'p',releaseType,status,date:'2024-06-01',vehicle:'private-vehicle',details:'secret note',...other});
 const rows=releaseEntries([{kind:'account',id:'p',name:'Test Residence'},releases('free','Full courtesy','Imported'),releases('discount','Reduced charge','Released',{originalCharges:243.31,amountCharged:90}),releases('void','Reduced charge','Voided',{amountWaived:300,voidedAt:day(2025)}),releases('unknown','Unclassified','Imported'),releases('pending','Full courtesy','Approved',{amountWaived:200})]);
 assert.deepEqual(rows.map(x=>[x.category,x.amountCents]),[['courtesy-release',undefined],['discounted-release',15331],['discounted-release',undefined],['unclassified-release',undefined],['courtesy-release',undefined]]);
 assert.equal(rows[1].property,'Test Residence');assert.equal(rows[2].closedDate,'2025-06-01');assert.equal(rows[4].terminal,false);assert.doesNotMatch(JSON.stringify(rows),/private-vehicle|secret note/);
});
test('paid claims archive only on real payment date, upcoming settlements remain active and asset values do not become employee debt',()=>{
 const claim={id:'c',kind:'claim',name:'Case',status:'Paid',date:'2024-01-01',paidDate:'2025-01-03',paidAmount:47.89,updatedAt:day(2026)};
 assert.ok(oldPropertyClaim(claim,'2026-01-01'));assert.equal(oldPropertyClaim({...claim,paidDate:''},'2026-01-01'),false);assert.equal(oldPropertyClaim({...claim,status:'Approved'}),false);
 assert.equal(propertyClaims([claim],ccr)[0].amountCents,4789);
 const asset={id:'a',kind:'assetClaim',data:{reportedDate:'2024-01-01',status:'Investigating',assetSnapshot:{cost:450},statements:[{status:'Open',at:day(2024)},{status:'Resolved',at:day(2024)},{status:'Investigating',at:day(2025)}]}};
 const a=assetEntries([asset])[0];assert.equal(a.terminal,false);assert.equal(a.closedDate,undefined);assert.equal(a.amountCents,undefined);assert.equal(filterYear([a],{module:ccr,view:'open-at-close',year:2024},'2026-06-01').total,0);
 assert.equal(assetEntries([{...asset,data:{...asset.data,deletedAt:day(2025)}}]).length,0);
 const safe=safetyEntries([{id:'s',kind:'trespass',caseStatus:'Open',name:'secret person',incidentDate:'2023-01-01',dispositionDate:'2024-01-01',evidence:'secret file'}])[0];assert.equal(safe.closedDate,undefined);assert.deepEqual(safe.openPeriods,[]);assert.doesNotMatch(JSON.stringify(safe),/secret/);
});
test('actual server source dispatcher scopes before accessing private repositories; no CCR read from Account Management',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'annual-scope-'));t.after(()=>{delete globalThis.ccrTestCalls;return rm(dir,{recursive:true,force:true})});const outfile=join(dir,'cases.mjs');globalThis.ccrTestCalls=[];
 const mock={'../ccr/register-server':"export async function registerEditions(){globalThis.ccrTestCalls.push('register');return []}",'../ccr/docket-server':"export async function docketEditions(){globalThis.ccrTestCalls.push('court');return []}",'../hr/server':"export async function readAssetClaims(){globalThis.ccrTestCalls.push('assets');return []}",'../accounts/server':"export async function yearCaseRows(){globalThis.ccrTestCalls.push('accounts');return [{id:'claim1',kind:'claim',status:'Investigating'},{id:'release1',kind:'courtesy',status:'Imported',releaseType:'Full courtesy',date:'2024-01-01'}]};export function projection(rows,v,surface){return rows}"};
 await build({entryPoints:['lib/year-history/cases.ts'],outfile,bundle:true,format:'esm',platform:'node',logLevel:'silent',plugins:[{name:'case-data',setup(b){b.onResolve({filter:/^\.\.\/(accounts\/server|ccr\/(?:docket-server|register-server)|hr\/server)$/},a=>({path:a.path,namespace:'case-fixture'}));b.onLoad({filter:/.*/,namespace:'case-fixture'},a=>({contents:mock[a.path]}));}}]});
 const {caseHistory}=await import(pathToFileURL(outfile).href),v=(grants)=>({id:'id',person:'p',role:'Employee',owner:false,customAccess:true,access:grants.map(([module,tab])=>({module,tab,level:'View'}))});
 const actor=v([[am,'courtesy'],[ccr,'damage'],[ccr,'hearings']]),people=[{id:'p',kind:'person',status:'Active'}];
 assert.deepEqual((await caseHistory(actor,people,am)).map(r=>[r.module,r.category]),[[am,'courtesy-release']]);assert.deepEqual(ccrTestCalls,['accounts']);ccrTestCalls.length=0;
 assert.deepEqual((await caseHistory(actor,people,ccr)).map(r=>r.category),['damage-claim']);assert.deepEqual(ccrTestCalls.sort(),['accounts','assets','court']);ccrTestCalls.length=0;
 for(const blocked of [v([]),{...actor,onboardingOnly:true},{...actor,id:'preview:p'}])assert.deepEqual(await caseHistory(blocked,people),[]);
 assert.deepEqual(ccrTestCalls,[]);
 const licenseOnly=v([[ccr,'licenses']]);assert.deepEqual(await caseHistory(licenseOnly,people,am),[]);assert.deepEqual(ccrTestCalls,[]);await caseHistory(licenseOnly,people,ccr);assert.deepEqual(ccrTestCalls,['register']);ccrTestCalls.length=0;await caseHistory(v([[ccr,'command']]),people,ccr);assert.deepEqual(ccrTestCalls,[]);
});

test('December requests appear in the December-year register but count only once in the year of actual release; declined and voided adjustments never count',async()=>{
 const {yearMetrics}=await import('../../lib/year-history/summary.ts');
 const make=(id,releaseType,status,more)=>({id,kind:'courtesy',accountId:'property',releaseType,status,...more});
 const common={requestedAt:'2025-12-29T12:00:00-06:00',approvedAt:'2025-12-31T15:00:00-06:00'};
 const src=releaseEntries([
  make('next','Full courtesy','Released',{...common,date:'2026-01-03',releasedAt:'2026-01-04T03:00:00Z'}),
  make('historic','Reduced charge','Imported',{date:'2025-12-30',updatedAt:'2026-04-01T12:00:00Z'}),
  make('late-log','Full courtesy','Released',{date:'2025-12-31',releasedAt:'2026-01-01T18:00:00Z'}),
  make('bound','Reduced charge','Released',{...common,releasedAt:'2026-01-01T06:05:00Z'}),
  make('waiting','Full courtesy','Approved',{...common}),make('no','Reduced charge','Declined',{...common,declinedAt:'2026-01-03T12:00:00Z'}),
  make('void','Full courtesy','Voided',{...common,date:'2025-12-31',voidedAt:'2026-01-06T12:00:00Z'}),
  make('unknown','Reduced charge','Imported',{}),make('example','Full courtesy','Released',{example:true,date:'2025-12-30'})
 ]);
 const byYear=(year,view)=>{const {selected}=filterYear(src,{module:am,year,view},'2027-03-01');return Object.fromEntries(yearMetrics(selected,am,view,year).map(x=>[x.label,x.value]));};
 assert.deepEqual(byYear(2025,'activity'),{'Matching Records':7,'Courtesy Releases':1,'Discounted Releases':1});
 assert.deepEqual(byYear(2026,'activity'),{'Matching Records':5,'Courtesy Releases':1,'Discounted Releases':1});
 assert.deepEqual(byYear(2025,'archive'),{'Matching Records':2,'Courtesy Releases':1,'Discounted Releases':1});
 assert.deepEqual(byYear(2026,'archive'),{'Matching Records':4,'Courtesy Releases':1,'Discounted Releases':1});
 assert.equal(byYear(2025,'open-at-close')['Courtesy Releases'],0);
 assert.deepEqual(byYear(2025,'undated'),{'Matching Records':1});
});
