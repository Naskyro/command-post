import type {ReportResult,ReportRow,CustomView,ReportColumn} from './types';
export function buildCustomView(report:ReportResult,view:CustomView={}):ReportResult {
 const keys=new Map(report.columns.map(c=>[c.key,c]));
 if(view.groupBy&&keys.has(view.groupBy)){
  const sum=view.aggregation==='sum',measure=keys.get(view.measure||'');
  if(sum&&(!measure||!['number','money','percent'].includes(measure.format||'')))throw Error('Choose a numeric measure to sum.');
  const groups=new Map<string,{count:number;sum:number;known:number}>();
  for(const row of report.rows){
   const label=String(row[view.groupBy]??'Unspecified'),v=groups.get(label)??{count:0,sum:0,known:0};v.count++;
   const n=measure&&row[measure.key];if(typeof n==='number'&&Number.isFinite(n)){v.sum+=n;v.known++;}groups.set(label,v);
  }
  const valueKey=view.groupBy==='value'?'groupTotal':'value';
  const cols:ReportColumn[]=[keys.get(view.groupBy)!,{key:valueKey,label:sum?'Total '+measure!.label:'Result Rows',format:sum?measure!.format:'number'}];
  const rows:ReportRow[]=[...groups].map(([label,v])=>({[view.groupBy!]:label,[valueKey]:sum?(v.known?Math.round(v.sum*100)/100:null):v.count})).sort((a,b)=>Number(b[valueKey]??-Infinity)-Number(a[valueKey]??-Infinity)||String(a[view.groupBy!]).localeCompare(String(b[view.groupBy!])));
  return {columns:cols,rows,chart:rows.flatMap(r=>typeof r[valueKey]==='number'?[{label:String(r[view.groupBy!]),value:Number(r[valueKey])}]:[]),note:[sum?'Totals include recorded numeric values only.':'Counts refer to rows in the selected report.',report.note].filter(Boolean).join(' ')};
 }
 const cols=view.columns?.length?view.columns.map(key=>keys.get(key)).filter((v):v is ReportColumn=>!!v):report.columns;
 const subset=cols.length!==report.columns.length;
 return {...report,columns:cols,rows:report.rows.map(row=>Object.fromEntries(cols.map(c=>[c.key,row[c.key]??null]))),...(subset?{details:undefined}:{}),...(subset?{chart:(()=>{const measure=cols.find(c=>['number','money','percent'].includes(c.format||'')),group=cols.find(c=>c!==measure);return measure&&group?report.rows.flatMap(row=>typeof row[measure.key]==='number'?[{label:String(row[group.key]??'Unspecified'),value:Number(row[measure.key])}]:[]):[]})(),metric:undefined}: {})};
}
