import test from 'node:test';
import assert from 'node:assert/strict';
import {auditStamp,auditStampDetail,auditDay,auditDayBoundary} from '../../lib/shared/audit-format.ts';
test('audit dates in Austin handle the stored UTC example, explicit offsets and midnight on the prior calendar day',()=>{
 assert.equal(auditStamp('2026-11-01T05:10:00.174Z'),'11-01-2026 12:10am CT');
 assert.equal(auditStamp('2026-11-01T00:10:00.174-05:00'),'11-01-2026 12:10am CT');
 assert.equal(auditStamp('2026-01-01T02:30:00.000Z'),'12-31-2025 08:30pm CT');
 assert.equal(auditDay(new Date('2026-01-01T02:30:00Z')),'12-31-2025');
 assert.equal(auditStamp(0),'12-31-1969 06:00pm CT');
});
test('spring transition skips 2am; autumn repeated hour is distinguishable in audit detail',()=>{
 assert.equal(auditStamp('2026-03-08T07:59:00Z'),'03-08-2026 01:59am CT');
 assert.equal(auditStamp('2026-03-08T08:00:00Z'),'03-08-2026 03:00am CT');
 assert.equal(auditStampDetail('2026-11-01T06:30:00.004Z'),'11-01-2026 01:30:00.004am CDT');
 assert.equal(auditStampDetail('2026-11-01T07:30:00.004Z'),'11-01-2026 01:30:00.004am CST');
 assert.equal(auditDayBoundary('2026-03-08'),'2026-03-08T06:00:00.000Z');
 assert.equal(auditDayBoundary('2026-03-08',true),'2026-03-09T05:00:00.000Z');
 assert.equal(auditDayBoundary('2026-11-01'),'2026-11-01T05:00:00.000Z');
 assert.equal(auditDayBoundary('2026-11-01',true),'2026-11-02T06:00:00.000Z');
});
test('calendar dates remain dates; no assumption is made for missing, malformed, or timezone-less event values',()=>{
 assert.equal(auditStamp('2028-02-29'),'02-29-2028');
 assert.equal(auditDay('2026-11-01'),'11-01-2026');
 for(const value of [null,undefined,{},NaN,'','foo','2026-02-29','2026-04-31T00:00:00Z','2026-11-01T01:30','2026-11-01T00:00:00+25:05','09:15',new Date('invalid')])assert.equal(auditStamp(value),'');
 assert.equal(auditDayBoundary('2026-02-29'),'');
});

test('rendered Departments has separate actor and Austin time cells, retains machine-readable instant, and never invents a setup actor',async()=>{
 const {build}=await import('esbuild'),{createRequire}=await import('node:module');
 const {default:React}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
 const built=await build({entryPoints:['components/people/DepartmentSettings.tsx'],write:false,bundle:true,platform:'node',format:'cjs',logLevel:'silent',external:['react','react/jsx-runtime'],loader:{'.css':'empty'}});
 const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
 const viewer={id:'admin',person:'admin',owner:true},department={id:'operations',kind:'department',name:'Operations',status:'Active',updatedBy:'Jerson Arauz',updatedAt:'2026-11-01T05:10:00.174Z'};
 const render=(rows)=>renderToStaticMarkup(React.createElement(mod.exports.default,{records:rows,viewer,onSaved:async()=>{}}));
 const table=render([department]),body=table.match(/<tbody>(.*?)<\/tbody>/s)[1];
 assert.match(table,/<th[^>]*>Changed By<\/th><th[^>]*>Last Changed<\/th>/);
 assert.match(body,/<td [^>]*class="admin-actor-column"[^>]*>.*?Jerson Arauz.*?<\/td><td [^>]*class="admin-time-column"[^>]*><time /);
 assert.match(body,/dateTime="2026-11-01T05:10:00.174Z"/i);
 assert.match(body,/title="11-01-2026 12:10:00.174am CDT"/);
 assert.ok(body.replace(/<[^>]+>/g,'').includes('11-01-2026 12:10am CT'));
 assert.doesNotMatch(render([{...department,updatedBy:'Initial Setup',updatedAt:'not an instant'}]),/Initial Setup|not an instant/);
});
