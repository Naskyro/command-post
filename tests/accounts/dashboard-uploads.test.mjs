import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=await mkdtemp(join(tmpdir(),'account-dashboard-')),file=join(dir,'api.mjs');
await build({stdin:{contents:"export * from './lib/accounts/work'; export * from './lib/accounts/model'; export * from './lib/accounts/policy'; export * from './lib/accounts/dashboard'; export * from './lib/accounts/contact-details'; export * from './lib/accounts/uploads'; export * from './lib/accounts/work-options';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'esm',outfile:file,logLevel:'silent'});
const api=await import(pathToFileURL(file));after(()=>rm(dir,{recursive:true,force:true}));
const row=(kind,id,extra={})=>({kind,id,name:id,version:0,...extra}),am={id:'am',person:'am',name:'AM',department:'Account Managers',role:'Employee',owner:false},dispatch={...am,department:'Dispatch'},account=row('account','a',{assignee:'am',status:'Active',service:'Full Patrol'}),staff=[row('person','am',{department:'Account Managers',status:'Active'})];
const payload=r=>Object.fromEntries(['id','kind','version','name','accountId',...api.forms[r.kind].map(f=>f.key)].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
test('browser initialization resolves work types without circular-import emptiness',()=>{
 assert.deepEqual(api.forms.workOrder.find(f=>f.key==='type').options,['Signage Install','Signage Removal','Custom Signage','Visitor Stenciling','Handicap Stenciling','Reserved Spot Stenciling','Paint Removal','Flyering']);
 const config=row('workTypes',api.workTypeSettingsId,{options:['Custom lettering']});assert.deepEqual(api.workTypeOptions([config]),['Custom lettering']);
 const work=row('workOrder','wo',{accountId:'a',type:'Signage Install',details:'Install',status:'Requested'});
 assert.equal(api.clean(payload({...work,type:'Custom lettering'}),undefined,am,[account,config],staff).type,'Custom lettering');
 assert.throws(()=>api.clean(payload(work),undefined,am,[account,config],staff),/Work type/);
 assert.equal(api.clean(payload(work),work,am,[account,config,work],staff).type,'Signage Install');
});
test('health unknown is separate from zero and boundary bands do not overlap',()=>{
 assert.equal(api.healthBand(account),5);
 const scored=score=>({...account,...Object.fromEntries(['relationship','checkin','onboarding','signage','permits','pause','safety','revenue','documentation'].map(k=>['health_'+k,0])),health_relationship:Math.min(score,15),health_signage:Math.min(Math.max(0,score-15),15),health_pause:Math.max(0,score-30)});
 assert.equal(api.healthBand(scored(0)),0);assert.equal(api.healthBand(scored(20)),0);assert.equal(api.healthBand(scored(21)),1);assert.equal(api.healthBand(scored(40)),1);assert.equal(api.healthBand(scored(41)),2);
});
test('monthly progress deduplicates outreach, counts unanswered, excludes notes and future contacts',()=>{
 const all=[account,row('account','b',{assignee:'am',status:'Active'}),row('account','gone',{assignee:'am',status:'Terminated'}),row('activity','x',{accountId:'a',channel:'Email',response:'No response',date:'2026-09-01'}),row('activity','y',{accountId:'a',channel:'Phone call',response:'Attempted',date:'2026-09-02'}),row('activity','z',{accountId:'b',channel:'Note',date:'2026-09-02'}),row('activity','future',{accountId:'b',channel:'Email',response:'Scheduled',date:'2026-09-10'})];
 const d=api.todayOverview(all,'am','2026-09-06');assert.equal(d.checkinPercent,50);assert.deepEqual(d.checked,['a']);assert.equal(d.responded.length,0);assert.equal(api.todayOverview(all,'other','2026-09-06').checkinPercent,null);
});
test('renewals use two calendar months including earlier notice deadlines',()=>{
 const d=api.todayOverview([account,{...account,id:'end',renewalDate:'2026-11-06'},{...account,id:'later',renewalDate:'2026-11-07'},{...account,id:'notice',agreementEnd:'2027-05-01',noticeDeadline:'2026-10-10'}],'am','2026-09-06');
 assert.deepEqual(d.renewals.map(r=>r.id),['notice','end']);assert.equal(api.monthOffset('2026-12-31',2),'2027-02-28');
});
test('portfolio revenue uses current assignments, signed payments and equal elapsed periods',()=>{
 const all=[account,{...account,id:'b',assignee:'other'}],p=(accountId,paymentDate,cents,voided=false)=>({accountId,paymentDate,cents,void:voided});
 const data=api.portfolioRevenue(all,[p('a','2026-08-05',10000),p('a','2026-08-20',90000),p('a','2026-09-04',6000),p('a','2026-09-06',-1000),p('a','2026-09-05',40000,true),p('b','2026-09-06',100000)],'am','2026-09-06');
 assert.equal(data.revenue,50);assert.equal(data.previousRevenue,100);assert.equal(data.change,-50);assert.equal(data.perAccount,50);assert.equal(data.historicalRevenue,1050);assert.equal(data.declining.length,1);assert.equal(data.monthly.length,6);
});
test('mixed phone/email repair preserves originals and never labels unknown numbers personal',()=>{
 for(const raw of ['a@example.com / 512-351-8123','512-351-8123 / a@example.com']) {const r=api.normalizeContact(row('contact','p',{email:raw}));assert.equal(r.email,'a@example.com');assert.equal(r.phone,'512-351-8123');assert.equal(r.emailOriginal,raw);assert.equal(r.personalPhone,undefined);assert.deepEqual(api.normalizeContact(r),r);}
 const r=api.normalizeContact(row('contact','p',{email:'x@example.com / 512-653-5586(CM) / 512-866-7708 (Prop)',phone:'Existing phone'}));assert.equal(r.email,'x@example.com');assert.equal(r.phone,'Existing phone');assert(r.emailOriginal.includes('512-866'));
 assert.equal(api.normalizeContact(row('contact','p',{email:'a@example.com / b@example.com'})).email,'a@example.com / b@example.com');
});
test('birthday, experience and LinkedIn inputs are validated independently',()=>{
 const contact=row('contact','new',{email:'a@example.com',approximateAge:30,ageAsOf:'2026-09-01',industryStartYear:2020,yearsInRole:3,experienceAsOf:'2026-09-01',linkedInUrl:'https://www.linkedin.com/in/example'});
 assert.equal(api.clean(payload(contact),undefined,am,[account],staff).industryStartYear,2020);
 assert.throws(()=>api.clean(payload({...contact,linkedInUrl:'javascript:alert(1)'}),undefined,am,[account],staff),/LinkedIn/);
 assert.equal(api.contactAge({...contact,dateOfBirth:'1990-09-07'},'2026-09-06'),'35');assert.equal(api.contactAge({...contact,dateOfBirth:'1990-09-06'},'2026-09-06'),'36');
});
test('evidence uploads require assigned investigation access and photos preserve visibility boundaries',()=>{
 assert.equal(api.mayUpload(am,[account],staff,'Claim evidence','a'),true);
 assert.equal(api.mayUpload({...am,person:'other'},[account],staff,'Claim evidence','a'),false);
 assert.equal(api.mayUpload(dispatch,[account],staff,'Claim evidence','a'),false);
 const contact=row('contact','p'),aff=row('affiliation','aff',{accountId:'a',contactId:'p',role:'Property Manager',startDate:'2026-01-01'});
 assert.equal(api.mayUpload(am,[account,contact,aff],staff,'Contact photo','','p'),true);
 assert.equal(api.canReadFile(dispatch,row('file','photo',{category:'Contact photo'})),false);
 assert.equal(api.canReadFile(dispatch,row('file','photo',{category:'Account photo'})),true);
 const bytes=s=>new TextEncoder().encode(s);
 assert.equal(api.uploadMime({name:'proof.eml',type:''},bytes('From: owner@example.com\r\nSubject: Damage\r\n\r\nPhotos attached'), 'Claim evidence'),'message/rfc822');
 assert.throws(()=>api.uploadMime({name:'fake.jpg',type:'image/jpeg'},bytes('<script>alert(1)</script>'),'Claim evidence'),/valid/);
 assert.throws(()=>api.uploadMime({name:'email.eml',type:''},bytes('From: a@example.com\n\nHi'),'Contact photo'),/valid/);
});
