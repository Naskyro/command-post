import type {PortfolioColumn,PortfolioReportResult} from './portfolio-reports-types';
import type {ReportColumn,ReportResult} from '../reports/types';
import {displayValue,type ReportFileMeta} from '../reports/files';
import {auditDay} from '../shared/audit-format.ts';
export type PortfolioFileFormat='pdf'|'xlsx'|'pptx';
export const handling='Internal business information. Share only with personnel authorized to view this portfolio. Do not forward outside Parking & Towing Enforcement without authorization.';
export const fileTypes:Record<PortfolioFileFormat,string>={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
export function exportName(r:PortfolioReportResult,f:PortfolioFileFormat){const base=r.title.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,85)||'Portfolio';return 'PTE-Confidential-'+base+'-'+(auditDay(r.generatedAt)||'Report')+'.'+f;}
const column=(c:PortfolioColumn):ReportColumn=>({...c,format:c.format==='integer'||c.format==='decimal'?'number':c.format});
export function formatPortfolioValue(c:PortfolioColumn,v:string|number|null|undefined){return v==null||v===''?'—':displayValue(column(c),v);}
export type PortfolioExportView={sortKey?:string;sortDir?:1|-1;measure?:string};
type ExportResult=PortfolioReportResult & {chartMeasure?:string};
export function prepareExport(r:PortfolioReportResult,input:unknown):ExportResult{
 if(input==null)return r;
 if(typeof input!=='object'||Array.isArray(input))throw Error('Choose valid report display options.');
 const v=input as PortfolioExportView;
 if(Object.keys(v).some(k=>!['sortKey','sortDir','measure'].includes(k)))throw Error('Unsupported report display option.');
 const c=(key:unknown)=>typeof key==='string'&&r.columns.find(c=>c.key===key);
 if(v.sortKey&&!c(v.sortKey)||v.sortDir!==undefined&&v.sortDir!==1&&v.sortDir!==-1)throw Error('The sort column is unavailable.');
 if(v.measure){const col=c(v.measure);if(!col||['text','date'].includes(col.format))throw Error('The chart measure is unavailable.');}
 const dir=v.sortDir||1, key=v.sortKey;
 const collator=new Intl.Collator('en-US',{sensitivity:'base',numeric:true});
 const rows=!key?r.rows:[...r.rows].sort((a,b)=>{const x=a.values[key],y=b.values[key];if(x==null||x==='')return y==null||y===''?0:1;if(y==null||y==='')return -1;return (typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y)))*dir;});
 return {...r,rows,chartMeasure:v.measure};
}
export function compareRows(r:ExportResult){
 const dimensions=r.columns.filter(c=>['text','date'].includes(c.format)&&c.key!=='status').slice(0,2),measure=r.columns.find(c=>c.key===r.chartMeasure)||r.columns.find(c=>['money','integer','decimal','percent'].includes(c.format)&&!['rank','year','number','index'].includes(c.key)&&r.rows.some(x=>typeof x.values[c.key]==='number'));
 if(!measure)return;
 const points=r.rows.flatMap((x,i)=>typeof x.values[measure.key]==='number'&&Number.isFinite(x.values[measure.key])?[{label:dimensions.map(c=>formatPortfolioValue(c,x.values[c.key])).filter(s=>s!=='—').join(' · ')||'Row '+(i+1),value:Number(x.values[measure.key])}]:[]);
 if(!points.length)return;
 return {measure,points};
}
export function publishedProjection(r:PortfolioReportResult){
 const cols=r.columns.map(column),comparison=compareRows(r),context:[string,string][]=[['Period',r.period],['Portfolio',r.scope],['Report Group',r.category],...r.summary.map(x=>[x.label,x.value] as [string,string])];
 const meta:ReportFileMeta={area:'Account Management',confidential:handling,generated:r.generatedAt,extra:context,visual:comparison?'bar':'table'};
 const result:ReportResult={columns:cols,rows:r.rows.map(x=>Object.fromEntries(cols.map(c=>[c.key,x.values[c.key]??null]))),chart:comparison?.points||[],note:[r.description,comparison?'Comparison: '+comparison.measure.label+'.':'',...r.notes].filter(Boolean).join('\n\n')};
 return {meta,result};
}
