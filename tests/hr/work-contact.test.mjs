import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {commandUsername,workContactEmail,prepareContactIdentity,setWorkContact,rosterUsernameConflictSql} from '../../lib/people/work-contact.ts';
import {personView} from '../../lib/people/policy.ts';
import {financeIdentity} from '../../lib/finance/identity.ts';
import {prepareAdminUser} from '../../lib/admin/users.ts';
import {personalProfileIdentity} from '../../lib/people/personal-profile.ts';
const owner={id:'trace-owner',name:'Executive',role:'Owner',person:'jerson',owner:true,department:'Dispatch',canManage:true,canRelease:true};
const worker={id:'dispatcher',kind:'person',version:2,name:'Dispatcher',role:'Employee',authorityLevel:'Coordinator',title:'Dispatcher',email:'dispatcher@gtowingtransport.com',emailAliases:['dispatcher@parkingtowingenforcement.com'],status:'Active',workerType:'Employee',department:'Dispatch'};
const dept={id:'dept',kind:'department',version:1,name:'Dispatch',head:'new-head',status:'Active'};
test('no generated corporate login is ever a work contact and read DTOs exclude hosted mailboxes/aliases',()=>{
 const old={...worker,companyEmail:'previously-recorded@gtowingtransport.com'};const records=[old,dept];
 for(const surface of ['admin','hr','finance']){
  const dto=personView(old,owner,records,surface);
  assert.equal(dto.companyEmail,'');assert.equal(dto.email,undefined);assert.equal(dto.emailAliases,undefined);
 }
 assert.deepEqual(personalProfileIdentity(old,records).companyEmail,'');
 assert.equal(workContactEmail({...worker,role:'Department Head',authorityLevel:'Department Lead / Director'}),'');
 assert.equal(financeIdentity(new Headers({'oai-authenticated-user-email':worker.emailAliases[0]}),records).person,worker.id);
});
test('recorded managerial and actual department-head mailboxes remain; HR does not invent one',()=>{
 const mailbox='assigned@gtowingtransport.com';
 assert.equal(workContactEmail({...worker,authorityLevel:'Manager',companyEmail:mailbox}),mailbox);
 assert.equal(workContactEmail({...worker,id:'new-head',companyEmail:mailbox},[dept]),mailbox);
 assert.equal(personalProfileIdentity({...worker,id:'new-head',companyEmail:mailbox},[dept]).companyEmail,mailbox);
 assert.equal(workContactEmail({...worker,authorityLevel:'Manager',companyEmail:''}),'');
});
test('unrelated saves preserve hidden contacts and all legacy logins; later deliberate assignments are contact-only',()=>{
 const old={...worker,companyEmail:'staff@gtowingtransport.com'},next={...old};
 prepareContactIdentity(next,old,[old],{title:'New Title'});assert.equal(next.companyEmail,old.companyEmail);assert.equal(workContactEmail(next),'');assert.deepEqual(next.emailAliases,old.emailAliases);
 setWorkContact(next,old,[],old.companyEmail);assert.equal(workContactEmail(next),old.companyEmail);assert.deepEqual(next.emailAliases,old.emailAliases);
 const cleared={...next};setWorkContact(cleared,next,[],'');assert.equal(workContactEmail(cleared),'');assert.equal(cleared.email,worker.email);assert.deepEqual(cleared.emailAliases,worker.emailAliases);
 assert.throws(()=>financeIdentity(new Headers({'oai-authenticated-user-email':old.companyEmail}),[next]),/not linked/);
});
test('new Admin employee with no email has an explicit unique case-insensitive non-email username',()=>{
 const fields={name:'New Dispatcher',username:'Night.Dispatch',title:'Night Dispatcher',departmentId:'dept',setupPath:'Existing Worker',workerType:'Employee',employmentClass:'Full-Time',authorityLevel:'Coordinator',access:[],hrResponsibilities:[]};
 const plan=(patch={},others=[])=>prepareAdminUser({action:'create-user',id:'new-person',reason:'Add employee',fields:{...fields,...patch}},owner,[dept,worker,...others]).next;
 const p=plan();assert.equal(p.username,'night.dispatch');assert.equal(p.email,'');assert.equal(p.companyEmail,'');assert.deepEqual(p.emailAliases,[]);
 assert.throws(()=>plan({username:'NIGHT.DISPATCH'},[{...p,id:'former-person',status:'Former'}]),/another user/);
 assert.throws(()=>plan({username:'dispatcher'}),/another user/);assert.throws(()=>plan({username:'test@example.com'}),/username/);
 assert.equal(commandUsername({...worker,username:undefined}),worker.id);
});
test('atomic roster check prevents simultaneous reuse across explicit usernames and legacy IDs',()=>{
 const db=new DatabaseSync(':memory:');db.exec('create table finance_records(id text primary key,kind text not null,payload text not null)');
 const insert=(id,username)=>db.prepare("insert into finance_records (id,kind,payload) select ?,'person',? where not exists ("+rosterUsernameConflictSql+')').run(id,JSON.stringify({username}),username,id,username,id).changes;
 assert.equal(insert('person-one','j.doe'),1);assert.equal(insert('person-two','J.DOE'),0);assert.equal(insert('j.doe','new.name'),0);assert.equal(insert('person-three','person-one'),0);assert.equal(insert('person-four','new.name'),1);
 db.close();
});
