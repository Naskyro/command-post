import type {FinRecord} from './model';

export const assetTypes=['Laptop','Tablet / iPad','Desktop computer','Printer / copier','Tow truck','Company vehicle','Building','Desk','Filing cabinet','Refrigerator / appliance','Tools','Equipment','Furniture','Other'];
export const isCurrentAsset=(r:FinRecord)=>r.kind==='asset'&&!['Sold','Disposed','Lost','Archived'].includes(String(r.status));
const numeric=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function assetValues(r:FinRecord){
 const cost=numeric(r.cost)?Number(r.cost):null;
 const depreciation=numeric(r.depreciation)?Number(r.depreciation):null;
 const book=cost!==null&&depreciation!==null?Math.max(0,cost-depreciation):null;
 const current=numeric(r.amount)?Number(r.amount):book;
 return {cost,depreciation,book,current};
}
export function assetTotals(records:FinRecord[]){
 const assets=records.filter(isCurrentAsset);const values=assets.map(assetValues);
 const sum=(key:'cost'|'depreciation'|'book'|'current')=>values.reduce((n,v)=>n+(v[key]??0),0);
 // Bank accounts and invoice/debt receivables are separate from physical assets.
 const cash=records.filter(r=>r.kind==='account'&&r.accountType==='Asset'&&r.institution!=='Vehicle'&&r.status!=='Sold').reduce((n,r)=>n+Number(r.amount||0),0);
 const companyDebts=records.filter(r=>r.kind==='debt'&&r.direction!=='Owed to company'&&!['Paid','Archived'].includes(String(r.status))).reduce((n,r)=>n+Number(r.amount||0),0);
 const receivables=records.filter(r=>r.kind==='invoice'&&!['Draft','Voided','Cancelled'].includes(String(r.status))).reduce((n,r)=>n+Math.max(0,Number(r.amount||0)-Number(r.paid||0)),0)+records.filter(r=>r.kind==='debt'&&r.direction==='Owed to company'&&r.status!=='Paid').reduce((n,r)=>n+Number(r.amount||0),0);
 const bills=records.filter(r=>r.kind==='bill'&&!['Paid','Voided','Cancelled'].includes(String(r.status))).reduce((n,r)=>n+Math.max(0,Number(r.amount||0)-Number(r.paid||0)),0);
 return {count:assets.length,cost:sum('cost'),depreciation:sum('depreciation'),book:sum('book'),value:sum('current'),unvalued:values.filter(v=>v.current===null).length,undepreciated:values.filter(v=>v.depreciation===null).length,cash,receivables,liabilities:companyDebts+bills,netWorth:sum('current')+cash+receivables-companyDebts-bills};
}
export function validateAsset(r:FinRecord){
 if(!String(r.name||'').trim())throw new Error('Enter the asset name.');
 for(const key of ['cost','amount','depreciation','soldAmount'])if(r[key]!==''&&r[key]!==undefined&&r[key]!==null&&(!numeric(r[key])||Number(r[key])<0))throw new Error('Asset amounts must be zero or greater.');
 if(numeric(r.cost)&&numeric(r.depreciation)&&Number(r.depreciation)>Number(r.cost))throw new Error('Depreciation cannot exceed the purchase cost.');
 if(r.purchasePrecision==='Exact date'&&!/^\d{4}-\d{2}-\d{2}$/.test(String(r.purchaseDate||'')))throw new Error('Enter the purchase date.');
 if(r.purchasePrecision==='Month / year'&&!/^\d{4}-\d{2}$/.test(String(r.purchaseMonth||'')))throw new Error('Enter the purchase month and year.');
 if(r.purchasePrecision==='Year only'&&!/^\d{4}$/.test(String(r.purchaseYear||'')))throw new Error('Enter the purchase year.');
}
