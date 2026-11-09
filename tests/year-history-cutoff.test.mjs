import test from 'node:test';
import assert from 'node:assert/strict';
import {businessDate,filterYear,historicalArchiveYear} from '../lib/year-history/model.ts';
import {yearMetrics,annualCsv} from '../lib/year-history/summary.ts';
const base={module:'Work Orders',kind:'Work Order',status:'Open',terminal:false,title:'Gate Repair',openedDate:'2026-12-24',activityDate:'2026-12-27'};
const closed={...base,id:'one',terminal:true,status:'Completed',closedDate:'2027-01-01T05:30:00Z'},active={...base,id:'two'},reopened={...base,id:'three',activityDates:['2027-01-04'],openPeriods:[{start:'2026-12-10',end:'2026-12-17'},{start:'2027-01-04'}]},missing={...base,id:'four',terminal:true,status:'Completed',activityDate:'',openedDate:''};
const all=[closed,active,reopened,missing,closed];
const run=(view,day,year=2026)=>filterYear(all,{module:'Work Orders',view,year},day);
test('Austin turnover is at local midnight and open work is never archived',()=>{
 assert.equal(businessDate(closed.closedDate),'2026-12-31');assert.equal(businessDate('2027-01-01'),'2027-01-01');assert.equal(businessDate('2026-02-31'),'');
 assert.equal(run('archive','2026-12-31').total,0);assert.deepEqual(run('archive','2027-01-01').items.map(r=>r.id),['one']);assert.equal(historicalArchiveYear(active,'2027-01-01'),null);
 assert.deepEqual(run('open-at-close','2027-01-02').items.map(r=>r.id),['two']);assert.deepEqual(run('undated','2027-01-02').items.map(r=>r.id),['four']);
 assert.equal(run('activity','2027-01-10',2026).total,3);assert.equal(run('activity','2027-01-10',2027).items[0].id,'three');
});
test('annual financial movement does not double count invoice workflow dollars, imply profit, or fabricate unknown amounts',()=>{
 const movement={...closed,module:'Finance',category:'cash-in',activityDate:'2026-03-01',amountCents:12345};
 const totals=yearMetrics([movement,{...movement,category:'cash-out',amountCents:-323},{...movement,category:'invoice',amountCents:12345}],'Finance','activity',2026);
 assert.deepEqual(totals.map(x=>x.value),[3,123.45,3.23]);
 assert.equal(yearMetrics([],'Finance','activity',2026).length,1);
 assert.match(annualCsv([{...active,id:'x',title:'=ATTACK()'}]),/"'=ATTACK\(\)"/);
});
