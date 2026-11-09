import test from 'node:test';
import assert from 'node:assert/strict';
import {driveSignals,recentDriveSignal} from '../../lib/home/pulse-drive.ts';
const now=new Date('2026-11-02T18:00:00Z'),v={person:'viewer',id:'u',role:'Employee',department:'Dispatch',access:[{module:'Company Drive',tab:'browse',level:'View'}]};
const folder=(id,parent='',grants={},inherit=true,more={})=>({id,parent,grants,kind:'folder',name:id,inherit,...more});
const file=(id,parent,at='2026-11-02T15:00:00Z',more={})=>({id,name:id,parent,kind:'file',updatedAt:at,updatedBy:'Uploader',...more});
const nodes=[folder('root','',{viewer:'View'}),folder('private','root',{},false),folder('subshare','private',{viewer:'View'}),folder('denied','root',{viewer:'None'}),
 folder('trashed','root',{},true,{deletedAt:'2026-11-02'}),folder('deep','trashed',{viewer:'View'}),folder('seed',''),
 file('sunday at midnight','root','2026-11-01T05:00:00.000Z'),file('last Saturday','root','2026-11-01T04:59:59.999Z'),file('latest','subshare'),
 file('private document','private'),file('tomorrow','root','2026-11-03T00:00:00Z'),file('restricted','denied'),file('removed ancestor','deep'),file('deleted','root',undefined,{deletedAt:'2026-11-02'}),
 file('bad date','root','not a date')];
test('recent files count real visible changes since Austin Sunday; hidden paths and file storage metadata stay private',()=>{
 const s=recentDriveSignal(v,nodes,false,now);
 assert.equal(s.count,2);assert.deepEqual(s.items.map(i=>i.id),['latest','sunday at midnight']);
 assert.deepEqual(s.items[0].target,{module:'Company Drive',section:'latest'});assert.equal(s.items[0].calendar,false);
 assert.doesNotMatch(JSON.stringify(s),/private document|restricted|subshare|removed ancestor/);
 const mgr=recentDriveSignal(v,nodes,true,now);
 assert.equal(mgr.count,4);assert(!mgr.items.find(i=>i.id==='removed ancestor'||i.id==='deleted'));
});
test('without active membership and module permission no Home data is loaded',async()=>{
 assert.deepEqual(await driveSignals({...v,access:[]},[{kind:'person',id:v.person,status:'Active'}],now),[]);
 assert.deepEqual(await driveSignals(v,[{kind:'person',id:v.person,status:'Terminated'}],now),[]);
});
