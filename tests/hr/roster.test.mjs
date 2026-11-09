import test from 'node:test';
import assert from 'node:assert/strict';
import {hrRoster,resolveHrRosterPersonId} from '../../lib/hr/roster.ts';

const person=(id,name,status,extra={})=>({id,kind:'person',version:1,name,status,...extra});
const people=[
 person('tori','Tori','Former',{rate:23}),
 person('clay','Clay','Former',{workerType:'Contractor'}),
 person('zoe','Zoe','Active',{department:'Dispatch'}),
 person('alex','Alex','Onboarding',{title:'Driver'}),
 person('sam','Sam','Leave'),
];

test('current pay and onboarding selections exclude former workers and retain current workers on leave or onboarding',()=>{
 assert.deepEqual(hrRoster(people).map(row=>row.id),['alex','sam','zoe']);
 assert.deepEqual(hrRoster(people,'Former').map(row=>row.id),['clay','tori']);
 assert.deepEqual(hrRoster(people,'All').map(row=>row.id),['alex','clay','sam','tori','zoe']);
 assert.equal(people.length,5);
 assert.equal(people.find(row=>row.id==='tori').rate,23);
 assert.deepEqual(people.map(row=>row.id),['tori','clay','zoe','alex','sam']);
});

test('moving from a former profile to current pay replaces the stale choice without losing explicit historical access',()=>{
 const current=hrRoster(people);
 assert.equal(resolveHrRosterPersonId(current,'tori','zoe'),'zoe');
 assert.equal(resolveHrRosterPersonId(current,'tori','owner-not-in-scope'),'alex');
 assert.equal(resolveHrRosterPersonId(current,'sam','zoe'),'sam');
 assert.equal(resolveHrRosterPersonId(hrRoster(people,'Former'),'tori','zoe'),'tori');
 assert.equal(resolveHrRosterPersonId([],'tori','zoe'),'');
});

test('picker search stays within the selected roster and never expands authorized records',()=>{
 assert.deepEqual(hrRoster(people,'Current',' tori '),[]);
 assert.deepEqual(hrRoster(people,'Current','DISPATCH').map(row=>row.id),['zoe']);
 assert.deepEqual(hrRoster(people,'Current','driver').map(row=>row.id),['alex']);
 assert.deepEqual(hrRoster(people.filter(row=>row.id==='zoe'),'All').map(row=>row.id),['zoe']);
});
