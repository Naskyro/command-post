import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

test('Finance and Timeclock show Central audit history without changing the payroll effective date or guessing missing actors',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-fin-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));const bundle=join(dir,'test.cjs');
 await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup as html} from 'react-dom/server';import Meta from './components/finance/FinanceAuditMeta';import Calendar from './components/finance/PayrollCalendarSettings';
 export const stamp=(at,by)=>html(<Meta at={at} by={by}/>);export const calendar=(data)=>html(<Calendar company={{kind:'company',id:'company',version:1,payrollPolicies:data}} canEdit={false} onSaved={async()=>{}}/>);`,loader:'tsx',resolveDir:process.cwd()},outfile:bundle,platform:'node',format:'cjs',bundle:true,logLevel:'silent'});
 const {stamp,calendar}=createRequire(import.meta.url)(bundle),early='2026-11-01T06:14:30Z',late='2026-11-01T07:14:31Z';
 assert.match(stamp(early,'Alex'),/11-01-2026 01:14am CT/);assert.match(stamp(early,'Alex'),/CDT/);assert.match(stamp(late,'Alex'),/CST/);
 assert.match(stamp(late,'Alex'),/Edited By: <\/span>Alex/);assert.equal(stamp(null,null),'');assert.doesNotMatch(stamp('invalid','Alex'),/Invalid Date|Last Edited:|undefined/);
 const page=calendar([{effective:'2026-10-25',startDay:0,payDelayDays:5,changedAt:early,changedBy:'Jessie'}]);
 assert.match(page,/<th>Effective Date<\/th>/);assert.match(page,/<th>Changed At<\/th><th>Changed By<\/th>/);
 assert.match(page,/<td>2026-10-25<\/td>/);assert.match(page,/<td><time[^>]*>11-01-2026 01:14am CT<\/time><\/td><td>Jessie<\/td>/);
});
