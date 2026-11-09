import type {ReportData,ReportLine,Filters} from './reports';
import {breakdown,reportRate} from './reports';
import type {ReportResult,ReportColumn} from '../reports/types';
import {makeReportPdf,makeReportXlsx,type ReportFileMeta} from '../reports/files';
export async function exportCcrReport(fmt:'xlsx'|'pdf',data:ReportData,rows:ReportLine[],f:Filters){
 const def=data.report,rate=reportRate(def,rows),groups=breakdown(rows,def.money);
 const columns:ReportColumn[]=[{key:'group',label:'Group'},{key:'records',label:def.unit,format:'number'},...(def.money?[{key:'amount',label:'Known Amount',format:'money' as const},{key:'known',label:'Entries With Amount',format:'number' as const}]:[])];
 const details:ReportColumn[]=[{key:'name',label:'Record'},{key:'group',label:'Group'},{key:'status',label:'Status'},{key:'date',label:def.basis,format:'date'},...(def.money?[{key:'amount',label:'Amount',format:'money' as const}]:[])];
 const result:ReportResult={columns,rows:groups.map(g=>({group:g.group,records:g.n,...(def.money?{amount:g.known?g.value/100:null,known:g.known}:{})})),chart:groups.filter(g=>!def.money||g.known).map(g=>({label:g.group,value:g.value/(def.money?100:1)})),details:{columns:details,rows:rows.map(r=>({name:r.name,group:r.group,status:r.status,date:r.day||'Not Recorded',...(def.money?{amount:r.cents==null?null:r.cents/100}:{})}))},metric:rate?{label:rate.label,value:rate.value==null?'No Eligible Decisions':rate.value+'% ('+rate.numerator+' of '+rate.denominator+')'}:undefined,note:def.question+' Periods use '+def.basis+'. Missing dates appear only when there is no date filter.'};
 const meta:ReportFileMeta={area:'Compliance, Claims & Recovery',confidential:'Confidential case information. Share only with authorized recipients.',generated:data.generatedAt,visual:'bar',filters:{from:f.from,to:f.to,group:f.group},extra:[['Matching '+def.unit,String(rows.length)],['Source Date',def.basis],...(f.status?[['Status',f.status] as [string,string]]:[]),...(f.q?[['Search',f.q] as [string,string]]:[])]};
 return fmt==='pdf'?makeReportPdf(def.title,result,meta):makeReportXlsx(def.title,result,meta);
}
