import {FinRecord,PayLine,money} from '@/lib/finance/model';
import type {ReportColumn,ReportResult,ReportRow} from '@/lib/reports/types';

function legacyReport(rows:Record<string,unknown>[],omit:string[]):ReportResult{
 const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!omit.includes(k));
 const columns:ReportColumn[]=keys.map(key=>({key,label:key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,v=>v.toUpperCase()),format:rows.some(r=>typeof r[key]==='number')?'number':'text'}));
 return {columns,rows:rows.map(r=>Object.fromEntries(keys.map(k=>{const v=r[k];return [k,v==null?null:typeof v==='number'||typeof v==='string'?v:typeof v==='object'?JSON.stringify(v):String(v)];})) as ReportRow),chart:[]};
}
function download(bytes:Uint8Array,type:string,name:string){const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function exportExcel(title:string,rows:Record<string,unknown>[]){
 const {makeReportXlsx}=await import('@/lib/reports/files');const bytes=await makeReportXlsx(title,legacyReport(rows,['lines','version']),{area:'Finance'});download(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',title+'.xlsx');
}
export async function exportPdf(title:string,rows:Record<string,unknown>[]){
 const {makeReportPdf}=await import('@/lib/reports/files');const bytes=await makeReportPdf(title,legacyReport(rows,['version','id','kind']),{area:'Finance'});download(bytes,'application/pdf',title+'.pdf');
}
export async function exportPaystub(line:PayLine,run:FinRecord,records:FinRecord[]){
 const year=String(run.date).slice(0,4);const prior=records.filter(r=>r.kind==='payrun'&&r.id!==run.id&&String(r.date).startsWith(year)&&String(r.date)<String(run.date)&&r.status==='Released').flatMap(r=>(r.lines as Record<string,unknown>[])||[]).filter(l=>l.person===line.person);
 const rows:Record<string,unknown>[]=[{employee:line.name,period:line.period+' through '+line.periodEnd,payday:run.date,status:run.status==='Released'?'Released for payment':'Draft payroll statement',hours:line.hours,overtimeHours:line.overtime,grossWages:money(line.gross),taxes:money(line.withheld),deductions:money(line.deducted),taxableTruckCredit:money(line.noncash),reimbursements:money(line.reimbursed),netWages:money(line.net),totalPayment:money(line.payment),recordedYtdGross:money(prior.reduce((s,l)=>s+Number(l.gross||0),line.gross)),recordedYtdTax:money(prior.reduce((s,l)=>s+Number(l.withheld||0),line.withheld))}];
 rows.push({federalIncomeTax:money(line.taxDetail?.federal),socialSecurity:money(line.taxDetail?.socialSecurity),medicare:money(line.taxDetail?.medicare),stateLocalWithholding:money(line.taxDetail?.stateTax)});
 for(const c of line.compensationLines||[])rows.push({type:'Compensation Component',label:c.name,amount:money(c.amount)});
 for(const r of line.details||[]){rows.push({type:r.kind,label:r.name||r.description||r.type,category:r.category,amount:money(r.appliedAmount??r.amount),source:r.source});}
 rows.push({note:'YTD includes Command Post released runs. Historical payroll must be reconciled before year-end reporting.'});await exportPdf(`Paystub - ${line.name} - ${run.date}`,rows);
}
