import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineCourtDirectory,changeCourtDirectory,savedChoice} from '../../lib/ccr/court-directory.ts';
test('listed courts and judges can change without reattributing historical case names',()=>{
 const d=baselineCourtDirectory();assert.equal(d.choices.filter(c=>c.kind==='court').length,7);
 let a=changeCourtDirectory(d,{action:'add',kind:'judge',label:'Visiting Judge',courtId:'jp4',version:0,reason:'Visiting appointment'},'visitor');
 const filed={assignedJudge:'Visiting Judge',assignedJudgeId:'visitor'};
 a=changeCourtDirectory(a,{action:'edit',id:'visitor',kind:'judge',label:'Updated Name',courtId:'cc2',version:1,reason:'Name and assignment updated'},'x');
 assert.equal(filed.assignedJudge,'Visiting Judge');assert.ok(savedChoice(a.choices.at(-1),filed.assignedJudge));
 assert.throws(()=>changeCourtDirectory(a,{action:'add',kind:'judge',label:'Visiting Judge',version:2,reason:'Entry'},'other'));
 a=changeCourtDirectory(a,{action:'archive',kind:'judge',id:'visitor',version:2,reason:'Term ended'},'x');assert.equal(a.choices.at(-1).active,false);
 assert.equal(changeCourtDirectory(a,{action:'restore',kind:'judge',id:'visitor',version:3,reason:'New assignment'},'x').choices.at(-1).active,true);
 assert.throws(()=>changeCourtDirectory(a,{action:'archive',kind:'court',id:'jp4',version:0,reason:'Wrong revision'},'x'));assert.throws(()=>changeCourtDirectory(a,{action:'edit',kind:'judge',id:'visitor',version:3,label:'Changed'},'x'));
});
