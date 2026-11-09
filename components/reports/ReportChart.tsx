'use client';
import {useId} from 'react';
import {ChartColumnIncreasing,X} from 'lucide-react';
import type {ChartKind,ChartPoint} from '@/lib/reports/types';

const palette=['#007d79','#6860ad','#b36a18','#3476a3','#ae5573','#4b8261','#8d6952','#548897'];
const num=(v:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
const short=(v:number)=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v);
const clip=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
const pointId=(p:ChartPoint)=>p.label+'|'+(p.series||'')+'|'+(p.x??'')+'|'+p.value;
function extent(v:number[]){let lo=Math.min(0,...v),hi=Math.max(0,...v);if(lo===hi){hi=lo+1;}return {lo,hi};}
function labelOf(p:ChartPoint,unit:string){return [p.series,p.label,p.x!==undefined?'x: '+num(p.x):'',num(p.value)+(unit?' '+unit:'')].filter(Boolean).join(' · ');}
export default function ReportChart({points,kind,unit='',title,onSelect,selected}:{points:ChartPoint[];kind:ChartKind;unit?:string;title:string;onSelect:(p:ChartPoint|null)=>void;selected:ChartPoint|null}){
 const titleId=useId(),p=points.filter(q=>Number.isFinite(q.value)),id=selected?pointId(selected):'';
 const key=(e:React.KeyboardEvent<SVGElement>,q:ChartPoint)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(q);}};
 const hit=(q:ChartPoint)=>({tabIndex:0,role:'button','aria-label':labelOf(q,unit),'aria-pressed':pointId(q)===id,onClick:()=>onSelect(q),onKeyDown:(e:React.KeyboardEvent<SVGElement>)=>key(e,q),className:'rpt-hit'});
 if(kind==='table')return null;
 if(!p.length)return <div className="rpt-chart-empty"><ChartColumnIncreasing size={28}/><strong>No Chart Data for This Selection</strong><span>Check the report period and the records included below.</span></div>;
 let visual:React.ReactNode,extra='',legend:React.ReactNode=null;
 if(kind==='pie'){
  const positive=p.filter(q=>q.value>0),sum=positive.reduce((a,q)=>a+q.value,0);
  if(p.some(q=>q.value<0))return <div className="rpt-chart-empty"><strong>This Breakdown Includes Negative Values</strong><span>Choose a bar chart or use the data table to see credits and debits.</span></div>;
  if(!sum)return <div className="rpt-chart-empty"><strong>No Positive Values to Compare</strong><span>The table below includes the recorded zero values.</span></div>;
  const slices=positive.slice(0,7);if(positive.length>7)slices.push({label:'Remaining '+(positive.length-7)+' Categories',value:positive.slice(7).reduce((a,q)=>a+q.value,0)});
  let a=-Math.PI/2;const cx=118,cy=109,r=88,inner=53;
  const xy=(angle:number,rad:number)=>[cx+Math.cos(angle)*rad,cy+Math.sin(angle)*rad].join(' ');
  visual=<div className="rpt-donut"><svg viewBox="0 0 236 218" role="group" aria-labelledby={titleId}><title id={titleId}>{title+' — share of total'}</title>{slices.map((q,i)=>{const from=a;a+=q.value/sum*Math.PI*2;const end=Math.min(a,from+Math.PI*2-.00001),large=(end-from)>Math.PI?1:0;const path='M '+xy(from,r)+' A '+r+' '+r+' 0 '+large+' 1 '+xy(end,r)+' L '+xy(end,inner)+' A '+inner+' '+inner+' 0 '+large+' 0 '+xy(from,inner)+' Z';return <path key={i} d={path} fill={palette[i%palette.length]} stroke="var(--rp-surface)" strokeWidth="2" {...hit(q)}><title>{labelOf(q,unit)}</title></path>;})}<text x={cx} y={cy-1} textAnchor="middle" className="rpt-plot-total">{short(sum)}</text><text x={cx} y={cy+19} textAnchor="middle" className="rpt-axis">Total</text></svg><div className="rpt-pie-key">{slices.map((q,i)=><button key={i} type="button" onClick={()=>onSelect(q)} aria-pressed={pointId(q)===id}><i style={{background:palette[i%palette.length]}}/><span>{q.label}</span><b>{num(q.value/sum*100)}%</b></button>)}</div></div>;
 }else if(kind==='bar'){
  const shown=p.slice(0,12),{lo,hi}=extent(shown.map(q=>q.value)),left=160,right=530,w=right-left,x=(v:number)=>left+(v-lo)/(hi-lo)*w,h=shown.length*28+35;
  if(p.length>shown.length)extra='Showing the first '+shown.length+' of '+p.length+' values. All reported values are available below.';
  visual=<div className="rpt-chart-scroll"><svg className="rpt-bars" viewBox={'0 0 630 '+h} style={{maxHeight:Math.max(130,h+8)}} role="group" aria-labelledby={titleId}><title id={titleId}>{title+' — bar chart'}</title>{[0,.25,.5,.75,1].map((n,i)=><g key={i}><path d={'M '+(left+n*w)+' 4 V '+(h-23)} className="rpt-gridline"/><text x={left+n*w} y={h-6} textAnchor="middle" className="rpt-axis">{short(lo+n*(hi-lo))}</text></g>)}{shown.map((q,i)=>{const y=i*28+13;return <g key={i} {...hit(q)}><title>{labelOf(q,unit)}</title><rect x={0} y={y-11} width="630" height="25" fill="transparent"/><text x={left-9} y={y+5} textAnchor="end" className="rpt-bar-label">{clip([q.series,q.label].filter(Boolean).join(' · '),23)}</text><rect x={Math.min(x(0),x(q.value))} y={y-7} width={Math.max(1,Math.abs(x(q.value)-x(0)))} height="15" rx="3" fill={pointId(q)===id?palette[1]:palette[0]}/><text x={right+10} y={y+5} className="rpt-bar-value">{num(q.value)}</text></g>})}</svg></div>;
 }else{
  const scatter=kind==='scatter',src=scatter?p.filter(q=>Number.isFinite(q.x)):p;
  if(!src.length)return <div className="rpt-chart-empty"><strong>No Paired Measurements</strong><span>A scatter plot needs two numeric values for each record.</span></div>;
  const cap=scatter?250:420,points=src.slice(-cap);if(src.length>cap)extra='Showing the last '+cap+' recorded values. The table retains the full result.';
  const series=[...new Set(points.map(q=>q.series||''))],labels=[...new Set(points.map(q=>q.label))],ys=extent(points.map(q=>q.value)),xVals=scatter?points.map(q=>q.x!):[];
  const months=!scatter&&labels.every(label=>/^\d{4}-(0[1-9]|1[0-2])$/.test(label)),month=(label:string)=>Number(label.slice(0,4))*12+Number(label.slice(5))-1;
  const monthVals=months?labels.map(month):[],domain=(label:string)=>months?month(label):labels.indexOf(label);
  const xLo=scatter?Math.min(...xVals):months?Math.min(...monthVals):0,xHi=scatter?Math.max(...xVals):months?Math.max(...monthVals):Math.max(1,labels.length-1);
  const x=(v:number)=>xHi===xLo?345:68+(v-xLo)/(xHi-xLo)*526,y=(v:number)=>172-(v-ys.lo)/(ys.hi-ys.lo)*144;
  const pos=(q:ChartPoint)=>x(scatter?q.x!:domain(q.label));
  const maxTick=6,indices=labels.map((_,i)=>i).filter(i=>i===0||i===labels.length-1||i%Math.max(1,Math.ceil(labels.length/maxTick))===0).filter((i,idx,all)=>!(idx===all.length-2&&labels.length>maxTick&&labels.length-1-i<Math.ceil(labels.length/maxTick)/2));
  visual=<div className="rpt-chart-scroll"><svg viewBox="0 0 646 214" className="rpt-trend" role="group" aria-labelledby={titleId}><title id={titleId}>{title+' — '+(scatter?'scatter plot':'line chart')}</title>{[0,.25,.5,.75,1].map((n,i)=>{const v=ys.lo+(ys.hi-ys.lo)*n;return <g key={i}><path d={'M 64 '+y(v)+' H 603'} className="rpt-gridline"/><text x="56" y={y(v)+4} textAnchor="end" className="rpt-axis">{short(v)}</text></g>})}{(scatter?Array.from({length:xLo===xHi?1:5},(_,i)=>({text:short(xLo+i/4*(xHi-xLo)),position:x(xLo+i/4*(xHi-xLo))})):indices.map(i=>({text:clip(labels[i],12),position:x(domain(labels[i]))}))).map((t,i)=><text x={t.position} y="195" key={i} textAnchor="middle" className="rpt-axis">{t.text}</text>)}{series.map((s,i)=>{const list=points.filter(q=>(q.series||'')===s),color=palette[i%palette.length];return <g key={s}>{!scatter&&<path fill="none" stroke={color} strokeWidth="2.8" d={list.map((q,j)=>((j&&domain(q.label)===domain(list[j-1].label)+1)?'L':'M')+pos(q)+' '+y(q.value)).join(' ')}/>} {list.map((q,j)=><g key={j} {...hit(q)}><title>{labelOf(q,unit)}</title><circle cx={pos(q)} cy={y(q.value)} r={8} fill="transparent"/><circle cx={pos(q)} cy={y(q.value)} r={pointId(q)===id?5.6:scatter?4:3.5} stroke="var(--rp-surface)" strokeWidth="1" fill={color} fillOpacity={scatter ? 0.8 : 1}/></g>)}</g>})}</svg></div>;
  if(series.some(Boolean))legend=<div className="rpt-series-key">{series.map((s,i)=><span key={s}><i style={{background:palette[i%palette.length]}}/>{s||'Reported Value'}</span>)}</div>;
 }
 return <div className="rpt-chart">{visual}{legend}{extra&&<small className="rpt-chart-note">{extra}</small>}{selected&&<div className="rpt-selection" role="status"><span><strong>{selected.label}</strong> {selected.series&&selected.series+' · '}{selected.x!==undefined?'x: '+num(selected.x)+' · ':''}{num(selected.value)} {unit}</span><button type="button" aria-label="Clear Selected Chart Value" onClick={()=>onSelect(null)}><X size={15}/></button></div>}</div>;
}
