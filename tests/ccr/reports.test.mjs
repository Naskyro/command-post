import test from 'node:test';import assert from 'node:assert/strict';
import {catalog,permittedReport,permittedReports} from '../../lib/ccr/reports-catalog.ts';
import {buildReport,filteredLines,reportRate,breakdown,csvForReport} from '../../lib/ccr/reports.ts';
import {blankChargeback} from '../../lib/ccr/chargeback.ts';
const desk='Compliance, Claims & Recovery',v={id:'account',person:'p',owner:false,role:'Employee',department:'Field',access:[{module:desk,tab:'reports',level:'View'},{module:desk,tab:'hearings',level:'View'}]},def=id=>catalog.find(r=>r.id===id),now=new Date('2026-11-02T12:00:00Z');
test('report permission alone has no source data and individual desk grants alone cannot run a CCR report',()=>{
 assert.equal(new Set(catalog.map(r=>r.id)).size,catalog.length);assert.ok(catalog.length>=22);assert.deepEqual(new Set(permittedReports(v).map(d=>d.desk)),new Set(['hearings']));assert.deepEqual(permittedReports({...v,access:[v.access[0]]}),[]);assert.throws(()=>permittedReport(v,'costs'));assert.throws(()=>permittedReport({...v,access:[v.access[1]]},'proceeding-type'));assert.throws(()=>permittedReports({...v,onboardingOnly:true}));assert.throws(()=>permittedReports({...v,id:'preview:1'}));
});
const caseOf=(id,result,extra={})=>({id,type:'Tow Hearing',title:id,number:id,status:result?'Closed':'Outcome Unverified',filedOn:'2026-10-05',statements:result?[{text:'SEALED narrative',outcome:{result,on:'2026-10-15',...(result==='Settled'?{stage:'At the Courthouse Before the Hearing'}:{})}}]:[],appearances:[],...extra});
test('only a verified win/loss counts in win rate; latest correction counts once; county case and unknowns never inflate JP totals',()=>{
 const jp='Travis County Justice Court, Precinct 2',county='Travis County Court at Law No. 5';
 const court=[caseOf('w','PTE Won',{courtName:jp}),caseOf('l','PTE Lost',{courtName:jp}),caseOf('s','Settled',{courtName:jp}),caseOf('u','PTE Won',{status:'Outcome Unverified',courtName:jp}),caseOf('a','PTE Won',{courtName:county}),caseOf('n',null)];
 const d=buildReport(def('jp-rulings'),{court},now);assert.equal(d.rows.length,4);assert.deepEqual(reportRate(d.report,d.rows),{label:'PTE Win Rate',numerator:1,denominator:2,value:50});assert.equal(d.rows.filter(r=>!r.day).length,1);assert.equal(JSON.stringify(d).includes('SEALED narrative'),false);
 const c=buildReport(def('county-outcomes'),{court},now);assert.equal(c.rows.length,1);assert.equal(c.rows[0].id,'a');
 court[0].statements.push({text:'Corrected disposition',outcome:{result:'PTE Lost',on:'2026-11-01'}});const corrected=buildReport(def('jp-rulings'),{court},now);assert.equal(reportRate(corrected.report,corrected.rows).value,0);assert.equal(filteredLines(corrected.rows,{from:'2026-11-01',to:'2026-11-01'}).length,1);
 assert.equal(buildReport(def('settlement-timing'),{court},now).rows[0].group,'At the Courthouse Before the Hearing');
});
test('case, records and financial measures keep unknowns separate, do not add postage to cash, and escape the export',()=>{
 const c={...blankChargeback(),processor:'Square',decision:'Cardholder Prevailed',entries:[{kind:'Cash Repayment',day:'2026-11-01',cents:2000},{kind:'Certified Mail Postage',day:'2026-10-31',cents:1000}]};
 const r={section:'recovery',category:'Chargeback',status:'Open',createdAt:'2026-10-01T13:00:00Z',id:'r',title:'=HYPERLINK("x")',chargeback:c};
 const old={...r,id:'old',chargeback:undefined};const bank=buildReport(def('bank-outcomes'),{register:[r,old]},now);assert.equal(reportRate(bank.report,bank.rows).denominator,1);
 const costs=buildReport(def('costs'),{register:[r]},now),cash=buildReport(def('repayments'),{register:[r]},now);assert.equal(breakdown(costs.rows,true)[0].value,1000);assert.equal(breakdown(cash.rows,true)[0].value,2000);assert.equal(costs.rows[0].day,'2026-10-31');assert.match(csvForReport(costs,costs.rows),/CONFIDENTIAL/);assert.match(csvForReport(costs,costs.rows),/"'=HYPERLINK/);
 const unknown=buildReport(def('tow-rulings'),{court:[caseOf('u',null)]},now);assert.equal(reportRate(unknown.report,unknown.rows).value,null);
 const restricted=buildReport(def('court-property'),{court:[caseOf('win','PTE Won',{accountId:'private'})],properties:new Map([['private','Private Property Name']]),propertyNamesAllowed:false},now);assert.equal(restricted.rows[0].group,'Linked Property (Restricted)');assert.ok(!JSON.stringify(restricted).includes('Private Property Name'));
});
test('damage, TDLR, upcoming licenses, and inspection categories use actual event units and skip examples',()=>{
 const records=[{id:'a',kind:'claim',status:'Paid',name:'Test claim',accountId:'A',date:'2026-01-01',paidDate:'2026-02-01',paidAmount:100},{id:'demo',kind:'claim',name:'Demonstration',sample:true}];const d=buildReport(def('damage-paid'),{propertyClaims:records,properties:new Map([['A','Alpha']])},now);assert.equal(d.rows.length,1);assert.equal(d.rows[0].cents,10000);assert.equal(d.rows[0].day,'2026-02-01');assert.equal(d.rows[0].id,'claim:a');
 const reg={id:'t',title:'Agency Case',section:'tdlr',category:'Agency Complaint',status:'Open',dueOn:'',createdAt:'2026-11-01T04:00:00Z'};assert.equal(buildReport(def('tdlr-topic'),{register:[reg]},now).rows[0].group,'Unclassified');assert.equal(buildReport(def('tdlr-topic'),{register:[{...reg,tdlr:{topic:'Signage'}}]},now).rows[0].day,'2026-10-31');
 const licenses=buildReport(def('licenses-due'),{register:[{...reg,section:'licenses',dueOn:'2026-11-04'},{...reg,section:'licenses',status:'Closed'}]},now);assert.equal(licenses.rows.length,1);assert.equal(licenses.rows[0].group,'Next 30 Days');
 const docs=buildReport(def('file-types'),{register:[{...reg,section:'evidence',files:[{at:'2026-11-02T03:30:00Z',documentType:'Inspection Findings',name:'PRIVATE'},{at:'2026-11-02T03:30:00Z',name:'PERSONAL'}]}]},now);assert.equal(docs.rows.length,2);assert.equal(docs.rows[1].group,'Legacy / Unclassified');assert.doesNotMatch(JSON.stringify(docs),/PRIVATE|PERSONAL/);
});
