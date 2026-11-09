import test from 'node:test';
import assert from 'node:assert/strict';
import {planHandoffContacts,withSalesHandoffHistory} from '../../lib/sales/handoff-relationships.ts';
const row=(id,kind,name,extra={})=>({id,kind,name,version:1,...extra}),lead=row('lead-123','opportunity','Fixture Property',{stage:'Won',propertyManager:'Current Manager',contactId:'chooser',contactName:'Same Name',contactRole:'Decision Maker',phone:'decision number',companyId:'company'}),day='2026-11-01';
const account=()=>row('sales-account:lead-123','account',lead.name,{sourceOpportunityId:lead.id,companyId:'company',status:'Onboarding'});
const rel=(id,contactId,role,extra={})=>row(id,'salesRelationship',role,{opportunityId:lead.id,contactId,role,...extra});
const manager=row('pm','contact','Current Manager',{photoUrl:'already-stored-at-canonical-id'}),chooser=row('chooser','contact','Same Name'),former=row('former','contact','Same Name');
const authority=rel('z','chooser','Decision Maker',{decisionMaker:true,phone:'decision number',email:'decision@example.invalid'}),current=rel('y','pm','Property Manager',{startDate:'2025-04-01',email:'manager@example.invalid',phone:'manager number'});
const previous=rel('x','former','Property Manager',{startDate:'2024-01-01',endDate:'2025-04-01',endReason:'Moved to another property',email:'earlier@example.invalid',companyId:'previous-company',decisionMaker:true});
const all=[manager,chooser,former,lead,previous,current,authority];
const plan=(l=lead,items=all)=>{const a=account(),p=planHandoffContacts(l,a,items,day);return {a,...p,rows:withSalesHandoffHistory([...items,a,...p.created])}};
test('current and historical affiliations retain exact identities, manager-tenure dates, work contacts, company and decision authority',()=>{
 for(const src of [all,[...all].reverse()]){
  const {a,rows,created}=plan(lead,src);
  assert.equal(a.primaryContactId,'pm');assert.equal(a.officeContact,'Current Manager');assert.equal(a.email,'manager@example.invalid');assert.equal(a.phone,'manager number');
  assert.ok(!created.some(r=>r.kind==='contact'));assert.equal(rows.find(r=>r.id===a.primaryContactId).photoUrl,manager.photoUrl);
  const links=rows.filter(r=>r.kind==='affiliation');assert.equal(links.length,3);
  const b=links.find(r=>r.sourceRelationshipId==='x');assert.equal(b.contactId,'former');assert.equal(b.companyId,'previous-company');assert.equal(b.endReason,previous.endReason);assert.equal(b.startDate,previous.startDate);assert.equal(b.endDate,previous.endDate);assert.equal(b.workEmail,previous.email);assert.equal(b.decisionMaker,true);
  const c=links.find(r=>r.sourceRelationshipId==='z');assert.equal(c.contactId,'chooser');assert.equal(c.decisionMaker,true);
  assert.deepEqual([...new Set(links.map(r=>r.contactId))].sort(),['chooser','former','pm']);
 }
});
test('lead-only free-text onsite manager is a separate contact from the decision maker; no other property contact is matched by name',()=>{
 const a=account(),list=[...all.filter(r=>r.id!=='y'),row('other','contact','Current Manager')];
 const {created,affiliations}=planHandoffContacts(lead,a,list,day);
 const fresh=created.filter(r=>r.kind==='contact');assert.equal(fresh.length,1);assert.equal(fresh[0].name,manager.name);
 assert.equal(a.primaryContactId,fresh[0].id);assert.equal(a.email,'');assert.equal(a.phone,'');assert.notEqual(a.primaryContactId,'other');assert.ok(affiliations.some(f=>f.contactId==='chooser'));
 const second=planHandoffContacts(lead,account(),list,day);assert.deepEqual(second.created.map(r=>r.id),created.map(r=>r.id));
});
test('large activity history uses linked originals, never Gmail/policy/private records; read-through is deterministic and corrected affiliations win',()=>{
 const timeline=Array.from({length:440},(_,i)=>row('t'+i,'salesActivity','Phone call',{opportunityId:lead.id,date:'2025-01-01',channel:'Phone call',details:'Call '+i,outcome:'Left voicemail',authorId:'rep',updatedBy:'Fixture Rep'}));
 const forbidden=[row('private','email','Private mail',{opportunityId:lead.id,details:'PRIVATE'}),row('gmail','salesActivity','Email',{channel:'Email',opportunityId:lead.id,gmailMessageId:'private',details:'PRIVATE'}),row('case','claim','Private case',{opportunityId:lead.id}),row('other-lead','salesActivity','Phone call',{channel:'Phone call',opportunityId:'other',details:'PRIVATE'})];
 const {a,created,rows}=plan(lead,[...all,...timeline,...forbidden]);
 const hist=rows.filter(r=>r.kind==='activity'&&r.accountId===a.id);assert.ok(created.length<10);assert.equal(hist.length,440);
 assert.equal(hist[0].date,'2025-01-01');assert.equal(hist[0].updatedBy,'Fixture Rep');assert.equal(hist[0].readOnly,true);assert.equal(hist[0].outcome,'Left voicemail');assert.doesNotMatch(JSON.stringify(hist),/PRIVATE/);
 assert.equal(new Set(hist.map(r=>r.id)).size,440);assert.equal(rows.some(r=>r.id.startsWith('sales-handoff-source:')),false);
 const editable=rows.find(r=>r.kind==='affiliation'&&r.contactId==='pm'),correction={...editable,version:1,endDate:'2026-03-01',endReason:'Reassigned'};
 const corrected=withSalesHandoffHistory([...all,...timeline,a,...created,correction]);assert.deepEqual(corrected.filter(r=>r.id===editable.id),[correction]);
 assert.equal(withSalesHandoffHistory([...all,...timeline,row('old','account','Existing Account',{sourceOpportunityId:lead.id})]).some(r=>r.kind==='activity'),false);
});
test('training leads and broken canonical identities cannot produce a fake live contact',()=>{
 assert.throws(()=>plan({...lead,example:true}),/Training/);assert.throws(()=>plan({...lead,id:'sales-example:demo'}),/Training/);
 assert.throws(()=>plan(lead,all.filter(r=>r.id!=='pm')),/unavailable contact/);
});
