import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {uiTitle,uiChoice} from '../../lib/shared/ui-title.ts';

test('UI headings distinguish short prepositions, names, acronyms, and compound actions',()=>{
 const cases={'leasing office parking':'Leasing Office Parking','parking in front of the leasing office':'Parking in Front of the Leasing Office','enforcement times / general schedule':'Enforcement Times / General Schedule','Revenue per account':'Revenue per Account','drivers’ TDLR licenses and testing':'Drivers’ TDLR Licenses and Testing','monthly check-in':'Monthly Check-In','Sign in to Command':'Sign In to Command','Payroll in QuickBooks':'Payroll in QuickBooks','Commissions & Per-Event Pay':'Commissions & Per-Event Pay','HR-CA policies':'HR-CA Policies'};
 for(const [s,expected] of Object.entries(cases)){assert.equal(uiTitle(s),expected);assert.equal(uiTitle(expected),expected);}
 assert.equal(uiChoice('Do not tow',['Do not tow','Enforced']),'Do Not Tow');
 assert.equal(uiChoice('iPark McAllen West LLC',['Do not tow','Enforced']),'iPark McAllen West LLC');
});

test('published property captions are styled while free-form rules and genuine historical field values survive intact',async()=>{
 const require=createRequire(import.meta.url),dir=await mkdtemp(join(tmpdir(),'cp-ui-captions-')),file=join(dir,'ui.cjs');
 try{
 await build({stdin:{contents:"export {ParkingLayoutSummary} from './components/accounts/ParkingLayoutSummary'; export {layoutFields} from './lib/accounts/property-layout'; export {Field} from './components/people/hr/ui';",resolveDir:process.cwd(),loader:'tsx'},outfile:file,bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'same-react',setup(b){b.onResolve({filter:/^(?:react|react-dom)(?:\/.*)?$/},a=>({path:require.resolve(a.path),external:true}));}}]});
 const {ParkingLayoutSummary,layoutFields,Field}=require(file),raw='call my cell at dusk; do NOT tow the Camaro.',a={kind:'account',id:'demo',name:'iPark McAllen West LLC',version:1,propertyType:'Residential',garageParking:'Yes',garageEnforcement:'Authorized call-in only',garageRules:raw,leasingOfficeParking:'Do not tow',leasingOfficeParkingHours:'after 6pm'};
 const html=renderToStaticMarkup(h(ParkingLayoutSummary,{account:a,onEdit:()=>{}}));
 assert.match(html,/>Leasing Office Parking</);assert.match(html,/>Parking &amp; Enforcement</);assert.match(html,/>Individual \/ Private Garages</);assert.match(html,/>Do Not Tow</);assert.match(html,/>Authorized Call-In Only</);assert.ok(html.includes(raw));assert.equal(a.leasingOfficeParking,'Do not tow');
 assert.equal(layoutFields.find(f=>f.key==='leasingOfficeParking').group,'Leasing office parking');
 const custom='iPark de la Rosa',field=renderToStaticMarkup(h(Field,{field:{key:'contact',label:'assigned contact for site',options:[{value:'original-id',label:custom}]},value:'original-id',onChange:()=>{}}));
 assert.match(field,/>Assigned Contact for Site</);assert.ok(field.includes('value="original-id"'));assert.ok(field.includes(custom));
 }finally{await rm(dir,{force:true,recursive:true});}
});
