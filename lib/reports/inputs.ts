import type {CustomView,ReportDefinition,ReportFilters,ReportResult,ChartKind} from './types';
import {AppError} from '../shared/errors.ts';
export function queryFilters(input:unknown,def:ReportDefinition):ReportFilters{
 if(input==null)return {};if(typeof input!=='object'||Array.isArray(input))throw new AppError('Choose valid report filters.');
 const out:ReportFilters={};for(const [k,val] of Object.entries(input)){
  if(val===''||val==null)continue;if(!def.filters?.includes(k as keyof ReportFilters)||typeof val!=='string'||val.length>160)throw new AppError('A selected filter is unavailable for this report.');
  const s=val.trim();if(!s)continue;
  if(['from','to'].includes(k)){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T12:00Z'))||new Date(s+'T12:00Z').toISOString().slice(0,10)!==s)throw new AppError('Enter a valid report date.');}
  out[k as keyof ReportFilters]=s;
 }
 if(out.from&&out.to&&out.from>out.to)throw new AppError('The end date must be on or after the start date.');return out;
}
export function queryView(input:Record<string,unknown>,result:ReportResult,base:ChartKind):Required<Pick<CustomView,'visual'|'columns'>>&CustomView{
 const keys=new Map(result.columns.map(c=>[c.key,c])),vis=input.visual??base;
 if(typeof vis!=='string'||!['bar','line','pie','scatter','table'].includes(vis))throw new AppError('Choose a supported visualization.');
 if(input.columns!==undefined&&(!Array.isArray(input.columns)||input.columns.length>100||input.columns.some(k=>typeof k!=='string'||!keys.has(k))))throw new AppError('The report columns have changed. Reopen the report.');
 const columns=Array.isArray(input.columns)&&input.columns.length?[...new Set(input.columns as string[])]:result.columns.map(c=>c.key);
 const groupBy=input.groupBy;
 const v={columns,visual:vis as ChartKind};
 if(!groupBy)return v;
 if(typeof groupBy!=='string'||!keys.has(groupBy))throw new AppError('Choose a grouping field from this report.');
 const aggregation=input.aggregation??'count',measure=input.measure;
 if(aggregation!=='count'&&aggregation!=='sum')throw new AppError('Choose a supported aggregation.');
 if(aggregation==='sum'&&(typeof measure!=='string'||!['money','number','percent'].includes(keys.get(measure)?.format||'')))throw new AppError('Choose a numeric field to total.');
 return {...v,groupBy,aggregation,...(aggregation==='sum'?{measure:measure as string}:{})};
}
export function reportName(v:unknown){if(typeof v!=='string'||v.trim().length<1||v.trim().length>100||/[\x00-\x1f\x7f]/.test(v))throw new AppError('Enter a report name of up to 100 characters.');return v.trim();}
