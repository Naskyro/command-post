import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMail,mergeMail} from '../../lib/ccr/regulatory-mail.ts';
import {publicRegisterRecord,prepareRegister} from '../../lib/ccr/register-model.ts';
const e=checkMail({messageId:'abcdf00010000001',threadId:'abcdf00010000002',sentAt:'2025-08-11T10:22:00-05:00',direction:'PTE to Agency',sender:'PTE Support',recipient:'Investigator',subject:'Response',summary:'Packet submitted.',body:'Our response is attached.',attachments:[{name:'Exhibit.pdf',bytes:10,disposition:'Source indexed; not uploaded'}]});
test('source chronology deduplicates exact replays, rejects conflicting changes, and never mistakes an invalid source for a message',()=>{
 assert.equal(mergeMail([e],[e]).length,1);assert.throws(()=>mergeMail([e],[{...e,body:'Changed'}]));assert.throws(()=>checkMail({...e,sentAt:'2026-08-11'}));assert.throws(()=>checkMail({...e,direction:'Agency found liability'}));assert.throws(()=>checkMail({...e,attachments:[{name:'x',bytes:-8}]}));assert.equal(e.sentAt,'2025-08-11T15:22:00.000Z');
});
test('ordinary case projections withhold the correspondence body and future staff edits preserve it',()=>{
 const v={id:'exec',person:'exec',name:'Reviewer',owner:true};const b={section:'tdlr',title:'Example',category:'Agency Complaint',reference:'TOW20260000000',ownerId:'',nextAction:'',dueOn:'',version:0,steps:[],status:'Awaiting Agency'};
 const r={...prepareRegister(v,'tdlr',b,undefined,[],true,e.sentAt),regulatoryMail:[e]}; assert.equal(publicRegisterRecord(r).regulatoryMail,undefined);assert.equal(publicRegisterRecord(r).mailCount,1);assert.equal(JSON.stringify(publicRegisterRecord(r)).includes(e.body),false);const edited=prepareRegister(v,'tdlr',{...b,id:r.id,version:1,note:'Follow up in writing.'},r,[],true,e.sentAt);assert.deepEqual(edited.regulatoryMail,[e]);assert.equal(edited.status,'Awaiting Agency');
});
