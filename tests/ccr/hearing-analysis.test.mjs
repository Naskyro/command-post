import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeHearings,hearingFilters} from '../../lib/ccr/hearing-analysis.ts';
const sample=(id,result,facts)=>({id,title:'Matter '+id,number:id,courtName:'Travis County Justice of the Peace, Precinct 4',status:result?'Closed':'Outcome Unverified',filedOn:'2024-04-01',statements:result?[{outcome:{result,on:'2026-07-10'}}]:[],hearingFacts:facts});
const h=(id,date,judge,status='Held')=>({id,kind:'hearing',date,status,judge,judgeRole:status==='Scheduled'?'Named on Notice':'Presiding'});
const cases=[sample('A','PTE Won',[h('11','2025-11-02','First Judge'),h('12','2026-08-02','Second Judge'),h('13','2026-08-10','Third Judge','Scheduled'),{kind:'order',id:'14',judge:'Order Signer',judgeRole:'Signing',date:'2025-12-01'},{kind:'party',id:'15',prevailingParty:'Company A',otherParty:'Other Company'}]),sample('B','Settled',[{id:'old',kind:'hearing',date:'2025-11-02',status:'Held',judge:'Error',judgeRole:'Presiding'},{...h('repl','2025-11-02','First Judge'),supersedes:'old'}]),sample('C','PTE Lost',[]),sample('D',null,[])];
const run=f=>analyzeHearings(cases,hearingFilters({basis:'Held Hearing',judgeRole:'Presiding',...f}));
test('distinct-case rates retain unknowns, restrict denominator and do not total multiple judge appearances into extra cases',()=>{
 const r=run({});assert.equal(r.counts.all,4);assert.equal(r.winRate,50);assert.equal(r.denominator,2);assert.equal(r.unknownJudge,2);assert.equal(r.groups.reduce((n,g)=>n+g.cases,0),5);assert.ok(!r.meta.judges.includes('Error'));
 assert.deepEqual(run({from:'2025-01-01',to:'2025-12-31',judge:'Second Judge'}).details,[]);
 assert.deepEqual(run({from:'2025-01-01',to:'2025-12-31',judge:'First Judge'}).details.map(r=>r.id),['A','B']);
 assert.equal(run({basis:'Held Hearing',from:'2025-01-01',to:'2025-12-31'}).excludedUnknownDate,2);
});
test('signer never proves a presiding judge, notice is not held, loss is not inferred from opposing-party text, filing and disposition dates differ',()=>{
 assert.equal(run({basis:'Signed Order',judgeRole:'Signing',judge:'Order Signer',from:'2025-12-01',to:'2025-12-01'}).counts.all,1);
 assert.equal(run({basis:'Held Hearing',judge:'Order Signer'}).counts.all,0);
 assert.equal(run({basis:'Held Hearing',from:'2026-08-10',to:'2026-08-10'}).counts.all,0);assert.equal(run({basis:'Scheduled Hearing',from:'2026-08-10',to:'2026-08-10',judgeRole:'Named on Notice'}).counts.all,1);
 assert.equal(run({partyRole:'Losing Party',party:'Other Company'}).counts.all,0);
 assert.equal(run({partyRole:'Other Party',party:'Other Company'}).counts.all,1);
 assert.equal(run({basis:'Filed Date',from:'2024-04-01',to:'2024-04-01'}).counts.all,4);assert.equal(run({basis:'Disposition Date',from:'2024-04-01',to:'2024-04-01'}).counts.all,0);
 assert.throws(()=>hearingFilters({from:'2025-02-30'}));assert.throws(()=>hearingFilters({basis:'Guess'}));
});

test('typographic accents do not split a judge; different given names are not guessed to be aliases',()=>{
 const more=[sample('A','PTE Won',[h('1','2026-01-01','Raúl González')]), sample('B','PTE Lost',[h('2','2026-01-02','Raul Gonzalez')]),sample('C','PTE Won',[h('3','2026-01-03','Richard Olivo')]),sample('D','PTE Won',[h('4','2026-01-03','Rick Olivo')])];
 const r=analyzeHearings(more,hearingFilters({basis:'Held Hearing',judgeRole:'Presiding',judge:'Raul Gonzalez'}));assert.equal(r.counts.all,2);assert.equal(r.groups.length,1);assert.deepEqual(r.meta.judges,['Not Recorded','Raúl González','Richard Olivo','Rick Olivo']);assert.equal(hearingFilters({}).judgeRole,'Signing');
});

test('a clerk notice is not a signed judicial order or a hearing',()=>{
 const m=sample('Clerk','Other',[{id:'n',kind:'notice',date:'2026-09-21'}]);const one=basis=>analyzeHearings([m],hearingFilters({basis,from:'2026-09-21',to:'2026-09-21'})).counts.all;
 assert.equal(one('Signed Order'),0);assert.equal(one('Held Hearing'),0);assert.equal(one('Notice Issued'),1);
});
