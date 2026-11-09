import type {ReportColumn as Column,ReportRow as Row,ReportResult as Result,ReportFilters} from './types';
import {displayPersonName} from '../people/display-name.ts';
import type {FinRecord} from '../finance/model';
export const str=(v:unknown):string=>typeof v==='string'?v.trim():'';
export const unknown='Not Reported';
export const objects=(v:unknown):Record<string,unknown>[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)):[];
export const day=(v:unknown):string=>{const s=str(v);if(!s)return '';if(/^\d{4}-\d\d-\d\d$/.test(s)){const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s?s:'';}const d=new Date(s);if(!Number.isFinite(d.valueOf()))return '';return d.toLocaleDateString('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'});};
export const range=(d:string,f:ReportFilters)=>!((f.from||f.to)&&!d)&&(!f.from||d>=f.from)&&(!f.to||d<=f.to);
export const delta=(first:string,second:string)=>Math.round((Date.parse(second+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000);
export const interval=(first:string,second:string)=>first&&second&&first<=second?delta(first,second):null;
export const person=(p:FinRecord):Row=>({employee:displayPersonName(p)||'Unnamed Employee',department:str(p.department)||unknown});
export function artifact(x:Record<string,unknown>){return !!(x.deletedAt||x.isSample||x.sample||x.trainingExample||x.isExample||x.isDemo||x.demo);}
export const col=(key:string,label:string,format?:Column['format']):Column=>({key,label,...(format?{format}:{})});
export const emp=[col('employee','Employee'),col('department','Department')];
export function list(rows:Row[],columns:Column[],note?:string):Result{return {columns,rows,chart:[],note,metric:{label:'Matching Records',value:String(rows.length)}};}
export function counts(detail:Row[],key:string,label:string,columns:Column[],opts:{trend?:boolean;measure?:string;note?:string;anonymous?:boolean}={}):Result{
 const bins=new Map<string,number>();for(const r of detail){const k=String(r[key]??unknown);bins.set(k,(bins.get(k)||0)+1);}
 const rows=[...bins].map(([label,count])=>({label,count})).sort((a,b)=>opts.trend?a.label.localeCompare(b.label):b.count-a.count||a.label.localeCompare(b.label));
 return {columns:[col('label',label),col('count',opts.measure||'Count','number')],rows,chart:rows.map(r=>({label:r.label,value:r.count})),note:opts.note,metric:{label:opts.measure||'Records',value:String(detail.length)},...(!opts.anonymous?{details:{columns,rows:detail}}:{})};
}
export function plot(rows:Row[],columns:Column[],key:string,labelKey:string,note:string,detail?:{columns:Column[],rows:Row[]}):Result{
 return {...list(rows,columns,note),chart:rows.filter(r=>typeof r[key]==='number'&&Number.isFinite(r[key])).map(r=>({label:String(r[labelKey]),value:r[key] as number})),...(detail?{details:detail}:{})};
}
export function monthly(rows:Row[],dateKey:string,cols:Column[],measure:string,note?:string){return counts(rows.filter(r=>str(r[dateKey])).map(r=>({...r,month:str(r[dateKey]).slice(0,7)})),'month','Month',cols,{trend:true,measure,note});}
export function median(values:number[]){if(!values.length)return null;const n=[...values].sort((a,b)=>a-b),half=Math.floor(n.length/2);return n.length%2?n[half]:(n[half-1]+n[half])/2;}
