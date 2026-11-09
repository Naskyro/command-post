import test from 'node:test';
import assert from 'node:assert/strict';
import {getPayCatalog,revisePayChoice,resolvePayChoices,savedPayComponents,vacancyPayLabel,vacancyCatalogId} from '../../lib/hr/vacancy-choices.ts';
import {prepareHiring} from '../../lib/hr/hiring.ts';
const v={owner:true,person:'owner',name:'Owner',id:'owner',department:'Dispatch'},dept={id:'dispatch',kind:'department',name:'Dispatch',status:'Active'};
const data={title:'Coordinator',departmentId:dept.id,status:'Open',jobDescription:'Work with dispatch.',rate:18,targetCloseDate:'2027-01-10'};
const at='2026-11-01T13:14:16.000Z',later='2026-11-07T11:15:16.000Z';
const create=(rows,body,prior=[],date=at)=>prepareHiring({action:'saveVacancy',id:'vacancy',version:prior[0]?.version||0,data:body},v,rows,prior,date).record;
const withCatalog=choices=>[dept,{id:vacancyCatalogId,kind:'hrVacancyChoices',version:1,choices}];
test('select, save, then edit and fill a vacancy with custom mixed pay; snapshots survive rename and retirement',()=>{
 const first=revisePayChoice(getPayCatalog([]),{action:'add',label:'Yard Sale Commission',unit:'Percentage'},'custom-percent');
 const vacancy=create(withCatalog(first),{...data,payChoiceIds:['hourly','custom-percent'],payType:'Forged Primary'});
 assert.equal(vacancy.data.payType,'Hourly');assert.equal(vacancyPayLabel(vacancy.data),'Hourly · Yard Sale Commission');assert.equal(vacancy.data.openedAt,at);
 const second=revisePayChoice(first,{action:'rename',id:'custom-percent',label:'Auction Commission'},'');
 const third=revisePayChoice(second,{action:'retire',id:'custom-percent'},'');
 const edit=create(withCatalog(third),{...data,status:'Filled',payChoiceIds:['hourly','custom-percent','bonus']},[vacancy],later);
 assert.equal(edit.data.openedAt,at);assert.equal(edit.data.filledAt,later);assert.equal(edit.version,2);assert.equal(vacancyPayLabel(edit.data),'Hourly · Yard Sale Commission · Bonus');
 assert.throws(()=>create(withCatalog(third),{...data,payChoiceIds:['custom-percent']}),/available pay/);
 const restored=revisePayChoice(third,{action:'restore',id:'custom-percent'},'');
 assert.equal(vacancyPayLabel(create(withCatalog(restored),{...data,payChoiceIds:['custom-percent']}).data),'Auction Commission');
});
test('legacy vacancies remain editable; real statuses and staff-entered historical terms cannot be replaced by client snapshots',()=>{
 const legacy=create([dept],{...data,payType:'Salary exempt'});assert.deepEqual(savedPayComponents(legacy.data).map(c=>c.id),['salary-exempt']);
 const edit=create([dept],{...data,payChoiceIds:['salary-exempt','per-tow']},[legacy]);
 assert.equal(edit.data.payType,'Salary exempt');assert.equal(vacancyPayLabel(edit.data),'Salary Exempt · Per Tow');
 for(const invalid of [{payComponents:[{}]},{filledAt:'2000-01-01'},{status:'Open-ish'},{payChoiceIds:['unknown']},{payChoiceIds:['hourly','hourly']},{payChoiceIds:['pending','bonus']}])assert.throws(()=>create([dept],{...data,...invalid}));
 assert.throws(()=>revisePayChoice(getPayCatalog([]),{action:'add',unit:'Terms',label:'HOURLY'},'new'),/already/);
 assert.throws(()=>resolvePayChoices(['fake'],getPayCatalog([]),[]),/available/);
});
