import test from 'node:test';
import assert from 'node:assert/strict';
import {blankRecoveryAppointment,blankRecoveryContact,blankRecoverySettlement,checkedRecoveryAppointments,checkedRecoveryContacts,checkedRecoverySettlement} from '../lib/ccr/recovery-activity.ts';

test('dated contact log records actual outcome while preserving an unknown local time zone',()=>{
 const entry={...blankRecoveryContact(),day:'2026-11-01',time:'17:30',person:'Customer',method:'Phone Call',outcome:'No Answer',notes:'Called the number on file.'};
 const saved=checkedRecoveryContacts([entry]);assert.equal(saved[0].zone,'');assert.equal(saved[0].time,'17:30');assert.equal(saved[0].outcome,'No Answer');
 assert.throws(()=>checkedRecoveryContacts([{...entry,day:''}]),/date/);assert.throws(()=>checkedRecoveryContacts([{...entry,time:'25:00'}]),/valid/);
 assert.throws(()=>checkedRecoveryContacts([{...entry,outcome:'Other',notes:''}]),/notes/);assert.throws(()=>checkedRecoveryContacts([entry,entry]),/own saved/);
});

test('settlement agreement requires evidence, preserves terms and never invents a payment or fulfilled status',()=>{
 const draft={...blankRecoverySettlement(),status:'Agreed',amountCents:20000,person:'Customer',terms:'Bring $200 cash by the agreed date.'};
 assert.throws(()=>checkedRecoverySettlement(draft),/agreement date/);
 const agreed=checkedRecoverySettlement({...draft,agreedDay:'2026-11-01',dueDay:'2026-11-03',dueTime:'14:00',agreementReference:'Customer email dated Nov 1'});assert.equal(agreed.zone,'');assert.equal(agreed.amountCents,20000);assert.equal(agreed.currency,'USD');assert.equal(Object.hasOwn(agreed,'paidCents'),false);assert.equal(Object.hasOwn(agreed,'entries'),false);
 assert.throws(()=>checkedRecoverySettlement({...agreed,status:'Fulfilled'}),/listed/);assert.throws(()=>checkedRecoverySettlement({...agreed,dueDay:'2026-10-31'}),/precede/);assert.throws(()=>checkedRecoverySettlement({...agreed,amountCents:20.01}),/cents/);assert.throws(()=>checkedRecoverySettlement({...agreed,currency:'EUR'}),/currency/);
 assert.equal(checkedRecoverySettlement(undefined),undefined);assert.equal(checkedRecoverySettlement(null),undefined);
});

test('appointments record attendance and expected cash separately from any payment ledger',()=>{
 const appointment={...blankRecoveryAppointment(),person:'Customer',day:'2026-11-03',time:'14:00',location:'Main yard',status:'Completed',expectedAmountCents:20000,notes:'Customer attended; payment is documented separately.'};
 const saved=checkedRecoveryAppointments([appointment])[0];assert.equal(saved.status,'Completed');assert.equal(saved.zone,'');assert.equal(saved.expectedAmountCents,20000);assert.equal(Object.hasOwn(saved,'paid'),false);assert.equal(Object.hasOwn(saved,'entries'),false);
 assert.throws(()=>checkedRecoveryAppointments([{...appointment,day:''}]),/date/);assert.throws(()=>checkedRecoveryAppointments([{...appointment,status:'No Show',notes:'',reference:''}]),/note or source/);
 const unscheduled=checkedRecoveryAppointments([{...blankRecoveryAppointment(),contact:'512-555-0100'}])[0];assert.equal(unscheduled.day,'');assert.equal(unscheduled.time,'');assert.equal(unscheduled.status,'Needs Scheduling');
});

test('rescheduled appointments cannot point to themselves, missing entries, or circular replacements',()=>{
 const a={...blankRecoveryAppointment(),person:'Customer',status:'Rescheduled',notes:'Customer changed their availability.'},b={...blankRecoveryAppointment(),person:'Customer',status:'Confirmed',day:'2026-11-04'};
 assert.equal(checkedRecoveryAppointments([{...a,rescheduledToId:b.id},b])[0].rescheduledToId,b.id);
 assert.throws(()=>checkedRecoveryAppointments([{...a,rescheduledToId:a.id},b]),/different appointment/);
 assert.throws(()=>checkedRecoveryAppointments([{...a,rescheduledToId:'missing'},b]),/different appointment/);
 assert.throws(()=>checkedRecoveryAppointments([{...a,rescheduledToId:b.id},{...b,status:'Rescheduled',notes:'Changed again.',rescheduledToId:a.id}]),/chain/);
});
