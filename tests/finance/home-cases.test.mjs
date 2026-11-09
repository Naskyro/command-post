import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {caseSignalProjection,casesSignals} from '../../lib/home/pulse-cases.ts';
import {prepareMatter,hearingInstant,CCR} from '../../lib/ccr/docket-model.ts';
const owner={id:'auth-owner',person:'exec',name:'Reviewer',owner:true,department:'Leadership',role:'Owner'};
const staff=(access=[])=>({...owner,owner:false,person:'staff',role:'Employee',department:'Operations',access});
const grant=(module,tab,level='View')=>({module,tab,level});
const date=new Date('2026-11-01T06:30:00Z'),body={title:'Fixture matter',number:'X',type:'Lawsuit',status:'Open',filedOn:'2026-10-31',dueFor:'Evidence',dueOn:'2026-11-02',statement:'',version:0,appearances:[{id:'a',label:'A',date:'2026-11-01',status:'Scheduled'},{id:'b',label:'B',date:'2026-11-08',status:'Scheduled'},{id:'c',label:'Old date',date:'2026-11-02',status:'Continued'},{id:'d',label:'Cancelled date',date:'2026-11-08',status:'Cancelled'}]};
test('recorded appearances respect Sunday week boundaries, continuances, and precise CCR grants',async()=>{
 const m=prepareMatter(body,undefined,owner,date),r=caseSignalProjection(staff([grant(CCR,'hearings')]),[{id:'c',name:'Secret',kind:'claim'}],[m],'2026-11-01');
 assert.deepEqual(Object.fromEntries(r.map(s=>[s.id,s.count])),{new_lawsuits:1,court_this_week:1,court_next_week:1,court_deadlines:1});
 assert.equal(r.find(s=>s.id==='court_this_week').tone,'critical');assert.equal(r.find(s=>s.id==='court_next_week').items[0].due,'2026-11-08');assert.equal(r.find(s=>s.id==='court_next_week').items[0].calendar,true);assert.equal(r.find(s=>s.id==='new_lawsuits').items[0].target.section,'matter:'+m.id);
 assert.equal(JSON.stringify(r).includes('Secret'),false);assert.deepEqual(await casesSignals(staff(),[],date),[]);assert.deepEqual(caseSignalProjection(staff([grant(CCR,'damage')]),[],[m],'2026-11-01').map(s=>s.id),['major_claims','open_damage_claims']);
});
test('new orders use their original event date, pending excludes completed orders, and priority assignments are personal',()=>{
 const make=(id,other)=>({id,name:id,kind:'workOrder',status:'Requested',...other});
 const rows=[make('mine',{assignee:'staff',firstRecorded:'2026-10-26T00:10:00Z',updatedAt:'2026-11-01T05:00:00Z',priority:'High',dueDate:'2026-11-01'}),make('other',{assignee:'another',requestedAt:'2026-11-01T05:10:00Z',priority:'Urgent'}),make('finished',{status:'Completed',firstRecorded:'2026-10-30T14:00:00Z'}),make('demo',{sample:true}),make('missing',{assignee:'staff',updatedAt:'2026-11-01T05:00:00Z'})];
 const r=caseSignalProjection(staff([grant('Work Orders','orders')]),rows,[],'2026-11-01');
 assert.deepEqual(Object.fromEntries(r.map(s=>[s.id,s.count])),{work_new:2,work_pending:3,work_urgent:1});assert.equal(r.find(s=>s.id==='work_urgent').items[0].title,'mine');
});
test('major and overdue open claims escalate without treating every dollar amount as major or revealing allegations',()=>{
 const c=(id,other)=>({kind:'claim',id,name:id,status:'Investigating',allegation:'PERSONAL',...other});const r=caseSignalProjection(owner,[c('flagged',{claimPriority:'Major'}),c('follow',{nextFollowUp:'2026-10-31'}),c('low',{requestedAmount:99999}),c('gone',{claimPriority:'Major',status:'Paid'})],[],'2026-11-01').find(s=>s.id==='major_claims');
 assert.equal(r.count,2);assert.equal(r.tone,'critical');assert(!JSON.stringify(r).includes('PERSONAL'));
});
test('court records support append-only disposition updates, date validation and view/edit separation',()=>{
 const m=prepareMatter(body,undefined,owner,date);assert.throws(()=>prepareMatter(body,undefined,staff([grant(CCR,'hearings')]),date),/access/);
 assert.throws(()=>prepareMatter({...body,appearances:[{...body.appearances[0],date:'2026-02-30'}]},undefined,owner,date),/date/);
 assert.throws(()=>prepareMatter({...m,appearances:[]},m,owner,date),/Cancelled/);
 assert.throws(()=>prepareMatter({...m,version:0},m,owner,date),/changed/);
 assert.throws(()=>prepareMatter({...m,status:'Closed',statement:''},m,owner,date),/disposition/);
 const closed=prepareMatter({...m,status:'Closed',statement:'Matter resolved per ruling.',newOutcome:{result:'PTE Won',on:'2026-11-01'}},m,owner,date),final=prepareMatter({...closed,statements:[],statement:'Additional detail.'},closed,owner,date);
 assert.deepEqual(final.statements.map(s=>s.text),['Matter resolved per ruling.','Additional detail.']);assert.equal(final.statements[1].byId,owner.id);
});
test('docket migration preserves each version and returns one current revision for every matter',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../../drizzle/0018_ccr_court_docket.sql',import.meta.url),'utf8'));
 const insert=db.prepare('INSERT OR IGNORE INTO ccr_docket_versions VALUES(?,?,?,?)');
 assert.equal(insert.run('one',1,'original','t1').changes,1);assert.equal(insert.run('one',2,'amended','t2').changes,1);assert.equal(insert.run('one',2,'overwrite','t3').changes,0);
 assert.equal(db.prepare('select count(*) as n from ccr_docket_versions').get().n,2);assert.equal(db.prepare('select payload from ccr_docket_versions order by version desc limit 1').get().payload,'amended');db.close();
});

test('recorded Austin hearing time follows daylight saving; date alone stays all-day',()=>{
 const m=prepareMatter({...body,appearances:[{...body.appearances[1],time:'09:30'}]},undefined,owner,date);
 const signal=caseSignalProjection(owner,[],[m],'2026-11-01').find(s=>s.id==='court_next_week');
 assert.equal(signal.items[0].due,'2026-11-08T15:30:00.000Z');
 assert.equal(hearingInstant('2026-07-15','09:30'),'2026-07-15T14:30:00.000Z');
 assert.throws(()=>hearingInstant('2026-03-08','02:30'),/does not exist/);
 assert.throws(()=>hearingInstant('2026-11-01','01:30'),/twice/);
});
