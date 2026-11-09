import test from 'node:test';
import assert from 'node:assert/strict';
import {queryFilters,queryView} from '../../lib/reports/inputs.ts';
import {buildCustomView} from '../../lib/reports/custom-view.ts';
const report={columns:[{key:'team',label:'Department'},{key:'amount',label:'Amount',format:'money'},{key:'private',label:'Detail'}],rows:[{team:'Dispatch',amount:12.13,private:'later'},{team:'Dispatch',amount:2.24,private:'other'},{team:'Drivers',amount:null,private:'missing'}],details:{columns:[{key:'more',label:'More'}],rows:[{more:'additional'}]},chart:[],metric:{label:'Total',value:'14.37'}};
test('custom totals keep unknown amounts distinct from zero and export only grouped output',()=>{
 const view=queryView({groupBy:'team',aggregation:'sum',measure:'amount',visual:'bar'},report,'table'),custom=buildCustomView(report,view);assert.deepEqual(custom.rows,[{team:'Dispatch',value:14.37},{team:'Drivers',value:null}]);assert.equal(custom.details,undefined);assert.deepEqual(custom.chart,[{label:'Dispatch',value:14.37}]);
});
test('column selection limits exported rows and removes supporting details when summary fields are hidden',()=>{
 const clean=buildCustomView(report,queryView({columns:['team','amount']},report,'bar'));assert.deepEqual(clean.rows[0],{team:'Dispatch',amount:12.13});assert.equal(clean.details,undefined);assert.equal(clean.metric,undefined);
 assert.throws(()=>queryView({columns:['taxNumber']},report,'table'));assert.throws(()=>queryView({groupBy:'team',aggregation:'sum',measure:'private'},report,'table'));
});
test('report filters deny unsupported fields and impossible or reversed dates',()=>{
 const def={filters:['from','to','department']};for(const f of [{from:'2026-02-29'},{from:'2026-01-05',to:'2026-01-04'},{person:'x'}])assert.throws(()=>queryFilters(f,def));
 assert.deepEqual(queryFilters({from:'2024-02-29',department:' Dispatch '},def),{from:'2024-02-29',department:'Dispatch'});
});
