import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRelationships,matchAccountRelationships,accountRelationshipActivity,relationshipPeriod} from '../../lib/accounts/relationship-directory.ts';
const r=(kind,id,fields={})=>({kind,id,name:id,version:1,...fields});
const rows=[
 r('contact','one',{name:'Lee Park',email:'lee@example.invalid'}),r('contact','two',{name:'Lee Park'}),
 r('company','cur',{name:'Current Co',type:'Management company'}),r('company','past',{name:'Former Co',type:'Management company'}),r('company','own',{name:'Owner Co',type:'Apartment owner'}),
 r('account','p1',{name:'New Place',companyId:'cur',ownerId:'own',primaryContactId:'one'}),r('account','p2',{name:'Old Place',companyId:'cur'}),
 r('affiliation','a1',{contactId:'one',accountId:'p1',role:'Property Manager',startDate:'2026-05-02',decisionMaker:true,workEmail:'new@example.invalid'}),
 r('affiliation','a2',{contactId:'one',accountId:'p2',companyId:'past',endDate:'2026-05-02',role:'Leasing Team',workEmail:'old@example.invalid'}),
 r('affiliation','a3',{contactId:'two',accountId:'p2',endDate:'2026-05-01'}),r('affiliation','a4',{contactId:'two',startDate:'2027-01-01',companyId:'cur'}),
 r('task','self',{waitingContactId:'one',dueDate:'2027-02-10'}),r('task','property-only',{accountId:'p1'}),
 r('email','em',{contactId:'one',status:'Sent',date:'2025-01-01'}),r('email','draft',{contactId:'one',status:'Draft'}),r('activity','log',{contactId:'one',date:'2026-05-01'}),
];
const groups=accountRelationships(rows,'2026-05-02'),entry=id=>groups.find(g=>g.entity.id===id);
test('directory retains people with duplicate names, owners, current formal assignments and dated roles',()=>{
 assert.equal(groups.filter(g=>g.entity.name==='Lee Park').length,2);
 assert.equal(entry('own').links[0].role,'Property Owner');assert.equal(entry('cur').links.filter(l=>l.role==='Management Company').length,2);
 assert.equal(entry('one').links.find(l=>l.key==='a1').decision,true);assert.equal(entry('one').links.find(l=>l.key==='a1').primary,true);assert.equal(entry('one').links.filter(l=>l.account.id==='p1').length,1);
 assert.equal(relationshipPeriod(rows.find(r=>r.id==='a2'),'2026-05-02'),'Former');
 assert.equal(relationshipPeriod(rows.find(r=>r.id==='a4'),'2026-12-31'),'Upcoming');
});
test('old assignments preserve recorded company and work email, never inferring today’s firm for a former contact',()=>{
 assert.equal(entry('one').links.find(l=>l.key==='a2').company.id,'past');
 assert.equal(entry('two').links.find(l=>l.key==='a3').company,undefined);
 assert.match(entry('one').search,/old@example.invalid/);
 assert.deepEqual(matchAccountRelationships(groups,'old place','people','Former').map(g=>g.entity.id),['one','two']);
 assert.deepEqual(matchAccountRelationships(groups,'new place','people','Former'),[]);
 assert.deepEqual(matchAccountRelationships(groups,'new place','owners','Current').map(g=>g.entity.id),['own']);
});
test('activity honors each module grant, excludes draft mail, and requires the exact contact ID',()=>{
 assert.deepEqual(accountRelationshipActivity(rows,'one',k=>k==='activity').map(r=>r.id),['log']);
 assert.deepEqual(new Set(accountRelationshipActivity(rows,'one',()=>true).map(r=>r.id)),new Set(['log','em','self']));
 assert.deepEqual(accountRelationshipActivity(rows,'two',()=>true),[]);
});
test('company timeline follows documented tenure rather than all activity at currently managed properties',()=>{
 const sample=[...rows,r('affiliation','documented',{contactId:'one',companyId:'cur',accountId:'p1',startDate:'2026-01-01',endDate:'2026-05-01'}),
 r('activity','during',{contactId:'one',accountId:'p1',date:'2026-04-30'}),r('activity','after',{contactId:'one',accountId:'p1',date:'2026-05-01'}),
 r('activity','other-property',{contactId:'one',accountId:'p2',date:'2026-04-30'})];
 assert.deepEqual(accountRelationshipActivity(sample,'cur',()=>true).map(r=>r.id),['during']);
});
