import type {ChartKind, ReportColumn, ReportFilters, ReportResult} from './types';
import {auditDay, auditStamp} from '../shared/audit-format.ts';
export type ReportFileMeta={area:string;filters?:ReportFilters;visual?:ChartKind;generated?:string;confidential?:string;extra?:[string,string][]};
const pretty=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const currency=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
export function displayValue(col:ReportColumn,value:string|number|null|undefined){
 if(value===undefined||value===null)return '';
 if(typeof value==='number')return Number.isFinite(value)?(col.format==='money'?currency.format(value):col.format==='percent'?pretty.format(value)+'%':pretty.format(value)):'';
 if(col.format==='date')return auditStamp(value)||value;
 return value;
}
const filterLabels:Record<keyof ReportFilters,string>={from:'From',to:'Through',group:'Group',person:'Employee',department:'Department'};
export function reportMetadata(meta:ReportFileMeta):[string,string][]{
 return [['Module',meta.area==='hr'?'People & HR':meta.area==='finance'?'Finance':meta.area],['Generated',auditStamp(meta.generated||new Date().toISOString())],...Object.entries(meta.filters||{}).filter(([,v])=>!!v).map(([k,v])=>[filterLabels[k as keyof ReportFilters]||k,['from','to'].includes(k)?auditDay(v)||v:v] as [string,string]),...(meta.extra||[])];
}
export async function makeReportPdf(title:string,result:ReportResult,meta:ReportFileMeta):Promise<Uint8Array>{
 return (await import('./file-pdf')).renderReportPdf(title,result,meta);
}
export async function makeReportXlsx(title:string,result:ReportResult,meta:ReportFileMeta):Promise<Uint8Array>{
 return (await import('./file-xlsx')).renderReportXlsx(title,result,meta);
}
