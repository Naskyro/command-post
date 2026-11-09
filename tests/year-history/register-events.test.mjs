import test from 'node:test';
import assert from 'node:assert/strict';
import {registerEntries,ccrArchiveTarget} from '../../lib/year-history/register-events.ts';
import {filterYear} from '../../lib/year-history/model.ts';
import {canOpenYearHistory} from '../../lib/year-history/access.ts';
import {annualCsv,yearMetrics} from '../../lib/year-history/summary.ts';
const ccr='Compliance, Claims & Recovery',at=(y,m,d)=>Date.UTC(y,m-1,d,15),iso=(...p)=>new Date(at(...p)).toISOString();
const edition=(version,status,updatedAt)=>({section:'recovery',id:'c1',version,status,title:'Truck Repair Recovery',createdAt:iso(2023,3,1),updatedAt,amountCents:80000,ownerName:'PRIVATE-PERSON',reference:'PRIVATE-TXN',history:[{note:'PRIVATE-NOTE'}],files:[{name:'PRIVATE-EVIDENCE'}]});
test('a reopen survives outer year lookups while a later audit note never shifts the closure or converts a tracked loss into an accounting receipt',()=>{
 const revisions=[edition(1,'Open',iso(2023,3,1)),edition(2,'Closed',iso(2024,4,2)),edition(3,'Closed',iso(2024,6,4)),edition(4,'Gathering Records',iso(2025,5,1)),edition(5,'Closed','2027-01-01T03:30:00Z'),edition(6,'Closed',iso(2027,3,1))];
 const rows=registerEntries(revisions.reverse()),byYear=(view,year)=>filterYear(rows,{module:ccr,view,year},'2028-06-01').total;
 assert.equal(rows.length,1);assert.equal(rows[0].closedDate,'2026-12-31');assert.equal(rows[0].amountCents,undefined);assert.equal(rows[0].kind,'Recovery Case');
 assert.equal(byYear('open-at-close',2023),1);assert.equal(byYear('open-at-close',2024),0);assert.equal(byYear('open-at-close',2025),1);assert.equal(byYear('open-at-close',2026),0);
 assert.equal(byYear('archive',2026),1);assert.equal(byYear('archive',2027),0);assert.equal(byYear('activity',2027),1);assert.equal(yearMetrics(rows,ccr,'archive',2026).at(-1).value,1);assert.doesNotMatch(JSON.stringify(rows)+annualCsv(rows),/PRIVATE-|80000/);
 const incomplete=registerEntries([revisions.at(-1),edition(6,'Closed',iso(2027,3,1))]);assert.equal(incomplete[0].closedDate,undefined);assert.deepEqual(incomplete[0].openPeriods,[]);
});
test('register-only access permits archive navigation but supplies no permission to another module; archive rows target their original source',()=>{
 const employee={person:'p',id:'p',role:'Employee',owner:false,access:[{module:ccr,tab:'tdlr',level:'View'}]};
 assert.equal(canOpenYearHistory(employee,ccr),true);assert.equal(canOpenYearHistory(employee,'Finance'),false);assert.equal(canOpenYearHistory({...employee,onboardingOnly:true},ccr),false);
 assert.deepEqual(ccrArchiveTarget('register:tdlr:case1'),{tab:'tdlr',id:'case1'});assert.deepEqual(ccrArchiveTarget('claim:z'),{tab:'damage',id:'claim:z'});assert.deepEqual(ccrArchiveTarget('asset-claim:z'),{tab:'damage',id:'asset-claim:z'});assert.deepEqual(ccrArchiveTarget('appearance:court:event'),{tab:'hearings',id:'court'});assert.equal(ccrArchiveTarget('register:Finance:id'),null);
});
