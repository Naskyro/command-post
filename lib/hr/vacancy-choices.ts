import type {FinRecord} from '../finance/model';
import {AppError} from '../shared/errors.ts';

export type PayChoice={id:string;label:string;unit:string;active:boolean;legacy?:string};
export const vacancyCatalogId='hr-vacancy-pay-choices';
export const rateUnits=['Hour','Week','Tow','Sale','Activity','Percentage','Terms'] as const;
const choice=(id:string,label:string,unit:string,legacy?:string):PayChoice=>({id,label,unit,active:true,...(legacy?{legacy}:{})});
export const standardPayChoices=[
 choice('hourly','Hourly','Hour','Hourly'),choice('hour-commission','Hourly + Commission','Hour','Hourly + commission'),
 choice('salary-commission','Salary + Commission','Week','Salary + commission'),choice('salary-exempt','Salary Exempt','Week','Salary exempt'),
 choice('net-salary','Net Salary','Week','Net salary'),choice('per-tow','Per Tow','Tow','Per tow'),
 choice('pending','Pending Method','Terms','Pending method'),choice('owner','Owner Payment','Terms','Owner payment'),
 choice('salary','Salaried','Week'),choice('commission','Commission','Percentage'),choice('per-sale','Per Sale','Sale'),
 choice('per-activity','Per Activity','Activity'),choice('bonus','Bonus','Terms'),choice('guarantee','Guaranteed Minimum','Terms'),
];
export function getPayCatalog(rows:FinRecord[]):PayChoice[]{const saved=rows.find(r=>r.kind==='hrVacancyChoices'&&r.id===vacancyCatalogId);return Array.isArray(saved?.choices)?saved.choices as PayChoice[]:standardPayChoices;}
export function revisePayChoice(original:PayChoice[],body:Record<string,unknown>,newId:string):PayChoice[]{
 const action=body.action,id=String(body.id||''),row=original.find(c=>c.id===id),label=String(body.label||'').trim();
 if(!['add','rename','retire','restore'].includes(String(action)))throw new AppError('Choose a catalog action.');
 if(action!=='add'&&!row)throw new AppError('This option no longer exists.');
 if(action==='add'||action==='rename'){
  if(!label||label.length>75||/[\r\n·]/.test(label))throw new AppError('Enter a name of 1–75 characters without a line break or middle dot.');
  if(original.some(c=>c.id!==(action==='rename'?id:'')&&c.label.toLowerCase()===label.toLowerCase()))throw new AppError('This name is already in the catalog, including retired options.');
 }
 if(action==='add'){if(original.length>=240)throw new AppError('The pay choice catalog is full.');if(!rateUnits.includes(body.unit as typeof rateUnits[number]))throw new AppError('Select the unit for this arrangement.');return [...original,choice(newId,label,String(body.unit))];}
 return original.map(c=>c.id!==id?c:action==='rename'?{...c,label}:{...c,active:action==='restore'});
}
export function savedPayComponents(data:Record<string,unknown>|undefined):PayChoice[]{
 if(!data)return [];
 if(Array.isArray(data.payComponents))return data.payComponents as PayChoice[];
 const old=standardPayChoices.find(c=>c.legacy===data.payType);return old?[old]:[];
}
export function resolvePayChoices(ids:unknown,catalog:PayChoice[],prior:PayChoice[]):PayChoice[]{
 if(!Array.isArray(ids)||ids.length>12||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new AppError('Select up to 12 different pay components.');
 const selected=ids.map(id=>{const kept=prior.find(c=>c.id===id),current=catalog.find(c=>c.id===id);if(!kept&&!current?.active)throw new AppError('Choose an available pay option.');return {...(kept||current!)};});
 if(selected.length>1&&selected.some(c=>c.id==='pending'))throw new AppError('Pending Method cannot be combined with defined pay.');
 return selected;
}
export function vacancyPayLabel(data:Record<string,unknown>){return savedPayComponents(data).map(c=>c.label).join(' · ')||String(data.payType||'');}
export function displayVacancyRate(data:Record<string,unknown>){
 if(data.rate===undefined||data.rate===null||data.rate==='')return '';
 const n=Number(data.rate);if(!Number.isFinite(n))return '';
 const unit=savedPayComponents(data)[0]?.unit;
 if(unit==='Percentage')return n.toLocaleString('en-US',{maximumFractionDigits:2})+'%';
 const tail=({Week:' / week',Hour:' / hour',Tow:' / tow',Sale:' / sale',Activity:' / activity'} as Record<string,string>)[unit||'']||'';
 return n.toLocaleString('en-US',{style:'currency',currency:'USD'})+tail;
}
