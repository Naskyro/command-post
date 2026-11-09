import test from 'node:test';
import assert from 'node:assert/strict';
import {ccrOverview} from '../../lib/ccr/overview.ts';
import {overviewClaimLines} from '../../lib/ccr/overview-claims.ts';
import {claimDirectory,lookupClaim} from '../../lib/ccr/claim-directory.ts';
const CCR='Compliance, Claims & Recovery';
const now=new Date('2026-11-01T04:30:00Z'); // 10/31 at 11:30pm in Austin.
const viewer=(...tabs)=>({id:'auth-limited',person:'person-1',owner:false,access:tabs.map(tab=>({module:CCR,tab,level:'View'}))});
const owner={...viewer(),owner:true};
const closedMat={id:'closed',title:'Closed',status:'Closed',appearances:[],dueOn:'2026-10-24'};
const matter={id:'m1',title:'Sample v Respondent',status:'Open',dueOn:'2026-11-06',dueFor:'Response',statements:[{text:'PRIVATE STATEMENT'}],appearances:[
 {id:'held',date:'2026-10-28',label:'Old Sitting',status:'Attended'},
 {id:'miss',date:'2026-10-30',label:'Recorded Hearing',status:'Scheduled'},
 {id:'up',date:'2026-11-06',label:'Hearing',status:'Scheduled',time:'09:00'},
 {id:'later',date:'2026-11-07',label:'Later Hearing',status:'Scheduled'},
 {id:'moved',date:'2026-11-01',label:'Old Hearing',status:'Continued'},
]};
const src={court:async()=>[matter,closedMat],claims:async()=>[
 {id:'claim-1',source:'property',title:'Property Case',status:'Pending review',dueOn:'2026-11-01',allegation:'PRIVATE ALLEGATION'},
 {id:'a-1',source:'asset',title:'Equipment Case',status:'Investigating'},
 {id:'a-2',source:'asset',title:'Resolved',status:'Resolved'},
 {id:'c-2',source:'property',title:'Paid Claim',status:'Paid'}],register:async()=>({items:[
 {id:'r1',section:'recovery',title:'Demand',status:'Open',dueOn:'2026-11-03',amountCents:345000,confidential:'PRIVATE NOTE'},
 {id:'r2',section:'recovery',title:'No recorded price',status:'Open',amountCents:null},
 {id:'r3',section:'recovery',title:'Closed Recovery',status:'Closed',amountCents:120000},
 {id:'r4',section:'tdlr',title:'Regulator',status:'Open',dueOn:'2026-11-01',nextAction:'Response'},
 ],sections:['tdlr','recovery','calendar','evidence','licenses']})};
test('command access does not imply any desk contents; unauthorized sources never load',async()=>{
 const blocked=()=>{throw Error('unauthorized read')},s={court:blocked,claims:blocked,register:blocked};
 for(const v of [viewer('hearings'),{...owner,onboardingOnly:true},{...owner,id:'preview:employee'}])await assert.rejects(ccrOverview(v,s,now),/access/);
 const r=await ccrOverview(viewer('command'),s,now);assert.deepEqual(r.desks,[]);assert.deepEqual(r.items,[]);assert.equal(r.appearances,null);assert.equal(r.totalClaims,null);assert.equal(r.completedClaims,null);
 let court=0,claims=0,reg=0;const w={court:()=>{court++;return src.court()},claims:()=>{claims++;return src.claims()},register:()=>{reg++;return src.register()}};
 const limited=await ccrOverview(viewer('command','recovery'),w,now);assert.deepEqual([court,claims,reg],[0,0,1]);assert.deepEqual(limited.desks,[{desk:'recovery',open:2}]);assert.equal(limited.items.length,1);assert.equal(limited.items[0].sourceId,'r1');assert.doesNotMatch(JSON.stringify(limited),/Regulator|PROPERTY|PRIVATE/);
});
test('counts distinct active records and upcoming scheduled appearances; prompts for past unconfirmed hearings',async()=>{
 const r=await ccrOverview(owner,src,now);assert.equal(r.today,'2026-10-31');assert.equal(r.desks.length,7);assert.deepEqual([r.appearances,r.propertyClaims,r.assetClaims,r.recoveryKnown,r.recoveryAmount],[1,1,1,1,345000]);
 const counts=Object.fromEntries(r.desks.map(x=>[x.desk,x.open]));assert.equal(counts.hearings,1);assert.equal(counts.damage,2);assert.equal(counts.recovery,2);assert.equal(counts.licenses,0);
 assert.equal(r.totalClaims,4);assert.equal(r.completedClaims,2);assert.equal(r.unverifiedClaims,0);
 const items=r.items.filter(i=>i.desk==='hearings');assert.equal(items.length,4);assert.match(items[0].action,/Confirm Appearance Outcome/);assert.equal(items.filter(i=>i.time).length,1);
 assert(r.items.some(i=>i.sourceId==='claim-1'&&i.kind==='review'));assert.doesNotMatch(JSON.stringify(r),/PRIVATE|Resolved|Old Sitting|Closed Recovery/);
});
test('an unavailable source remains unknown and does not hide available sources',async()=>{
 const r=await ccrOverview(owner,{...src,claims:async()=>{throw Error('private database failure')},register:async()=>{throw Error('hidden')}},now);
 assert.equal(r.propertyClaims,null);assert.equal(r.assetClaims,null);assert.equal(r.desks.find(x=>x.desk==='recovery').open,null);assert.equal(r.desks.find(x=>x.desk==='damage').open,null);
 assert.equal(r.totalClaims,null);assert.equal(r.completedClaims,null);assert.equal(r.unverifiedClaims,null);
 assert.equal(r.appearances,1);assert.equal(r.items.length,4);assert.doesNotMatch(JSON.stringify(r),/private database|hidden/);
});

test('the damage headline includes all claims while confirmed open, unverified and completed stay separate',async()=>{
 const unverified={id:'intake:spoiler',version:1,source:'intake',title:'Reported spoiler damage',status:'Outcome Unverified'};
 const current={...unverified,version:2,status:'Open'};
 const claims=[unverified,current,current,
  {id:'intake:unknown',source:'intake',title:'Awaiting outcome review',status:'Outcome Unverified'},
  {id:'intake:closed',source:'intake',title:'Completed claim',status:'Closed'},
 ];
 const r=await ccrOverview(viewer('command','damage'),{...src,claims:async()=>claims},now);
 assert.equal(r.totalClaims,3);assert.equal(r.desks.find(x=>x.desk==='damage').open,1);
 assert.equal(r.intakeClaims,1);assert.equal(r.unverifiedClaims,1);assert.equal(r.completedClaims,1);
 assert.equal(r.items.length,0,'Unverified claims are counted without inventing deadlines or dispositions.');
 assert.equal(unverified.status,'Outcome Unverified');
 const before=await ccrOverview(viewer('command','damage'),{...src,claims:async()=>[unverified]},now);
 assert.equal(before.totalClaims,1);assert.equal(before.desks[0].open,0);assert.equal(before.unverifiedClaims,1);assert.equal(before.completedClaims,0);
});

test('claim sources use the directory rules and count linked intake evidence once under its investigation',async()=>{
 const intake=(id,status='Outcome Unverified',changes={})=>({id,version:1,title:'Incident '+id,status,reportedOn:'2026-10-01',references:[],...changes});
 const properties=[
  {id:'same-id',kind:'claim',version:1,name:'Native investigation',status:'Investigating',date:'2026-10-01',nextFollowUp:'2026-11-01',damageIntakeId:'linked-intake',insurerClaimNumber:'CLAIM-100'},
  {id:'deleted',kind:'claim',version:1,name:'Old version',status:'Investigating'},
  {id:'deleted',kind:'claim',version:2,name:'Deleted claim',status:'Deleted'},
  {id:'sample',kind:'claim',version:1,name:'Sample claim',sample:true},
 ];
 const assets=[{id:'same-id',kind:'assetClaim',version:1,data:{title:'Distinct employee claim',status:'Resolved',reportedDate:'2026-10-01'}},{id:'training',kind:'assetClaim',version:1,data:{title:'Training example',trainingSample:true}}];
 const old=intake('current','Outcome Unverified'),current=intake('current','Open',{version:2});
 const intakes=[intake('linked-intake'),intake('matched-reference','Outcome Unverified',{claimReference:'CLAIM-100'}),old,current,current,intake('closed','Closed'),intake('unverified'),intake('sample','Outcome Unverified',{sample:true})];
 const lines=overviewClaimLines(properties,assets,intakes,'2026-10-31');
 assert.deepEqual(new Set(lines.map(r=>r.id)),new Set(['claim:same-id','asset-claim:same-id','intake:current','intake:closed','intake:unverified']));
 const r=await ccrOverview(viewer('command','damage'),{...src,claims:async()=>lines},now);
 assert.equal(r.totalClaims,5);assert.equal(r.desks[0].open,2);assert.equal(r.completedClaims,2);assert.equal(r.unverifiedClaims,1);
 assert.equal(r.propertyClaims,1);assert.equal(r.assetClaims,0);assert.equal(r.intakeClaims,1);
 assert.equal(lines.find(r=>r.id==='intake:current').version,2);
 const directory=claimDirectory(properties,assets,'2026-10-31',intakes);
 for(const line of lines)assert.equal(lookupClaim(directory,line.id)?.key,line.id,'Overview targets use the exact directory key.');
 const action=r.items.find(i=>i.desk==='damage');
 assert.equal(action.sourceId,'claim:same-id');
 assert.equal(lookupClaim(directory,action.sourceId)?.title,'Native investigation');
 assert.equal(lookupClaim(directory,'asset-claim:same-id')?.title,'Distinct employee claim');
});
