import test from 'node:test';
import assert from 'node:assert/strict';
import {employmentDates} from '../../lib/hr/employment-dates.ts';

test('current service and next anniversary use original hire dates and calendar boundaries',()=>{
 const input={startDate:'2023-07-17',status:'Active',asOf:'2026-10-27'};
 const result=employmentDates(input);
 assert.equal(result.hireDate,'2023-07-17');
 assert.equal(result.tenureLabel,'3 Years, 3 Months, 10 Days');
 assert.equal(result.completedYears,3);
 assert.equal(result.tenureThroughDate,'2026-10-27');
 assert.equal(result.nextAnniversaryDate,'2027-07-17');
 assert.equal(result.nextAnniversaryLabel,'4-Year Anniversary');
 assert.equal(result.anniversaryNote,null);
 assert.deepEqual(input,{startDate:'2023-07-17',status:'Active',asOf:'2026-10-27'});
 assert.equal(employmentDates({startDate:'2020-10-27',status:'Leave',asOf:'2026-10-27'}).nextAnniversaryDate,'2026-10-27');
 assert.equal(employmentDates({startDate:'2026-10-27',status:'Onboarding',asOf:'2026-10-27'}).tenureLabel,'Less Than 1 Day');
 assert.equal(employmentDates({startDate:'2026-10-27',status:'Onboarding',asOf:'2026-10-27'}).nextAnniversaryDate,'2027-10-27');
});

test('leap-day anniversaries and month-end tenure clamp to valid calendar dates',()=>{
 const leap=employmentDates({startDate:'2024-02-29',status:'Active',asOf:'2025-02-28'});
 assert.equal(leap.tenureLabel,'1 Year');
 assert.equal(leap.nextAnniversaryDate,'2025-02-28');
 assert.equal(leap.nextAnniversaryLabel,'1-Year Anniversary');
 assert.match(leap.anniversaryNote,/February 28/);
 assert.equal(employmentDates({startDate:'2024-02-29',status:'Active',asOf:'2028-02-28'}).nextAnniversaryDate,'2028-02-29');
 assert.equal(employmentDates({startDate:'2026-01-31',status:'Active',asOf:'2026-02-28'}).tenureLabel,'1 Month');
 assert.equal(employmentDates({startDate:'2026-01-31',status:'Active',asOf:'2026-03-01'}).tenureLabel,'1 Month, 1 Day');
 assert.equal(employmentDates({startDate:'2024-03-09',status:'Active',asOf:'2024-03-11'}).tenureLabel,'2 Days');
});

test('former service stops at the recorded departure and never assumes continuing service',()=>{
 const base={startDate:'2022-04-10',status:'Former',asOf:'2026-10-27'};
 const ended=employmentDates({...base,endDate:'2024-07-12',separationDate:'2024-08-01'});
 assert.equal(ended.tenureLabel,'2 Years, 3 Months, 2 Days');
 assert.equal(ended.tenureThroughDate,'2024-07-12');
 assert.equal(ended.nextAnniversaryDate,null);
 assert.equal(ended.nextAnniversaryLabel,null);
 assert.equal(employmentDates({...base,separationDate:'2024-07-12'}).tenureLabel,ended.tenureLabel);
 assert.equal(employmentDates(base).tenureLabel,null);
 assert.equal(employmentDates({...base,endDate:'2021-04-10'}).tenureLabel,null);
 assert.equal(employmentDates({...base,endDate:'2027-04-10'}).tenureLabel,null);
});

test('missing, invalid, future, and unknown-status dates do not generate false service claims',()=>{
 for(const startDate of [undefined,'','2026-02-30','2026-2-01','not a date']){
  const result=employmentDates({startDate,status:'Active',asOf:'2026-10-27'});
  assert.equal(result.hireDate,null);
  assert.equal(result.tenureLabel,null);
  assert.equal(result.nextAnniversaryDate,null);
 }
 const future=employmentDates({startDate:'2026-11-01',status:'Onboarding',asOf:'2026-10-27'});
 assert.equal(future.hireDate,'2026-11-01');
 assert.equal(future.isFutureStart,true);
 assert.equal(future.tenureLabel,null);
 assert.equal(future.nextAnniversaryDate,null);
 assert.equal(employmentDates({startDate:'2020-01-01',status:'Active',asOf:'2026-02-30'}).tenureLabel,null);
 assert.equal(employmentDates({startDate:'2020-01-01',status:'Unknown',asOf:'2026-10-27'}).tenureLabel,null);
 assert.equal(employmentDates({startDate:'2020-01-01',status:'Active',workerType:'Owner',asOf:'2026-10-27'}).completedYears,6);
});
