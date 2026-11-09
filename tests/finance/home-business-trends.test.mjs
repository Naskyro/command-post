import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

const dir=await mkdtemp(join(tmpdir(),'home-monthly-business-'));
after(()=>rm(dir,{recursive:true,force:true}));
await build({stdin:{resolveDir:process.cwd(),contents:"export * from './lib/home/module-trends'; export {propertyMonthlyPerformance} from './lib/accounts/history';"},outfile:join(dir,'app.cjs'),platform:'node',format:'cjs',bundle:true,external:['cloudflare:workers'],logLevel:'silent'});
const {homeHireTrend,homeTowTrend,projectPropertyTowTrend,propertyMonthlyPerformance}=createRequire(import.meta.url)(join(dir,'app.cjs'));
const now=new Date('2026-11-01T04:30:00Z'); // October 31 in Austin, before the DST change.
const grant=(module,tab)=>({module,tab,level:'View'});
const me={id:'worker',person:'worker',name:'Test',role:'Employee',department:'Dispatch',owner:false,access:[]};
const row=(kind,id,more={})=>({kind,id,version:1,name:'not-public-'+id,...more});
const self=row('person','worker',{department:'Dispatch',status:'Active'});
const at=(series,month,key='value')=>series.months.find(x=>x.month===month)?.[key];

test('hire trend filters by report/source grants and HR responsibility scope and leaves unknown or future dates out',()=>{
 const viewer={...me,access:[grant('People & HR','people'),grant('People & HR','reports')],hrResponsibilities:[{action:'viewPersonnel',scope:'Department'}]};
 const records=[self,row('person','one',{department:'Dispatch',status:'Former',startDate:'2026-10-28'}),row('person','two',{department:'Dispatch',status:'Active',startDate:'2026-09-15'}),
 row('person','secret',{department:'Drivers',status:'Active',startDate:'2026-10-08'}),row('person','future',{department:'Dispatch',status:'Pending',startDate:'2026-11-01'}),
 row('person','seed',{sample:true,department:'Dispatch',startDate:'2026-10-15'})];
 const result=homeHireTrend(viewer,records,now);assert.equal(result.months.length,12);assert.equal(result.asOf,'2026-10-31');
 assert.equal(at(result,'2026-10'),1);assert.equal(at(result,'2026-09'),1);assert.equal(at(result,'2026-08'),null);assert.equal(at(result,'2026-11'),undefined);
 assert.match(result.note,/1 person has no valid hire date/);assert.doesNotMatch(JSON.stringify(result),/not-public|Drivers|secret|worker/);
 assert.equal(homeHireTrend({...viewer,access:[grant('People & HR','people')]},records,now),null);
 assert.equal(homeHireTrend({...viewer,hrResponsibilities:[]},records,now),null);
 assert.equal(homeHireTrend({...viewer,onboardingOnly:true},records,now),null);
});

test('property counts use confirmed tow or received-only dates, never payments, blank months or excluded records; edits replace imports',()=>{
 const accounts=[row('account','property:demo-test'),row('account','sample_property',{sample:true})];
 const veh=(id,more)=>row('vehicle',id,{accountId:accounts[0].id,...more});
 const good=[veh('v1',{towDate:'2026-08-11',receivedDate:'2026-08-12'}),veh('v1',{towDate:'2026-09-04',receivedDate:'2026-08-12'}),veh('v2',{receivedDate:'2026-09-12'}),veh('v3',{towDate:'2026-10-12',receivedDate:'2026-09-03'}),veh('v4',{receivedDate:'2026-11-01'})];
 const bad=[veh('s1',{sample:true,towDate:'2026-09-22'}),veh('s2',{accountId:'sample_property',towDate:'2026-09-22'}),veh('s3',{accountId:'orphan',towDate:'2026-09-22'}),veh('s4',{paymentDate:'2026-09-22'}),veh('s5',{towDate:'2026-11-06',receivedDate:'2026-09-22'})];
 const data=projectPropertyTowTrend(accounts,[...good,...bad],now);assert.equal(at(data,'2026-08'),null);assert.equal(at(data,'2026-09'),1);assert.equal(at(data,'2026-09','secondary'),1);assert.equal(at(data,'2026-10'),1);
 assert.doesNotMatch(JSON.stringify(data),/property:demo|orphan|not-public|v1/);
 const p=propertyMonthlyPerformance([...accounts,...good],accounts[0].id,2026,'2026-10-31',[]);
 for(const month of ['2026-09','2026-10']){const m=p.monthly.find(r=>r.month===month);assert.equal(at(data,month)??0,m.towCount);assert.equal(at(data,month,'secondary')??0,m.receivedDateCount);}
});
test('tow chart never touches the account store when the viewer lacks property results access',async()=>{
 const read=async()=>{throw new Error('forbidden read');};
 assert.equal(await homeTowTrend({...me,access:[grant('Accounts','overview')]},[self],now,read),null);
 assert.equal(await homeTowTrend({...me,owner:true,onboardingOnly:true},[self],now,read),null);
 assert.equal(await homeTowTrend({...me,owner:true},[{...self,status:'Former'}],now,read),null);
 let n=0;const empty=async()=>{n++;return[];};
 const legacy=await homeTowTrend({...me,access:[grant('Account Management','accounts')]},[self],now,empty);
 assert.equal(n,1);assert.ok(legacy.months.every(r=>r.value===null&&r.secondary===null));
});
