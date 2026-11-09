'use client';
import {useId,useMemo,useRef,useState} from 'react';
import {Activity,ArrowDownRight,ArrowRight,ArrowUpRight,BarChart3,ChartNoAxesCombined,ChevronDown,Clock3,LineChart,Minus,ScatterChart,Table2,UsersRound,Truck,Wallet,Wrench,SlidersHorizontal} from 'lucide-react';
import {axisBounds,lineSegments,numeric} from '@/lib/home/chart-math';
import type {HomeFinancialAnalytics} from '@/lib/reports/finance-home-types';
import type {HomeWorkAnalytics} from '@/lib/home/work-analytics';
import type {HomeTarget} from '@/lib/home/widgets';
import type {HomePulse,PulsePreferences} from '@/lib/home/pulse-types';
import './home-analytics.css';

type Mode='line'|'bar'|'scatter'|'table';
type Metric={id:string;label:string;color:string;dash?:string;definition?:string};
type Row={key:string;label:string;short:string;note?:string;values:Record<string,number|null>};
export type HomeChartId='chart-finance'|'chart-time'|'chart-workload'|'chart-orders'|'chart-hires'|'chart-tows';
type Sources='finance'|'work'|'plan'|'orders'|'hires'|'tows';
type CardView={mode:Mode;range:6|12};
const sources:Record<HomeChartId,Sources>={'chart-finance':'finance','chart-time':'work','chart-workload':'plan','chart-orders':'orders','chart-hires':'hires','chart-tows':'tows'};
const chartTitles:Record<Sources,string>={finance:'Financial Performance',work:'My Time Trends',plan:'Scheduled Workload',orders:'Work Orders Over Time',hires:'Hiring Over Time',tows:'Property Tow Activity'};
const chartModules:Record<Sources,string>={finance:'Finance',work:'Timeclock',plan:'Work Calendar',orders:'Work Orders',hires:'People & HR',tows:'Account Management'};
const sourceIcons={finance:Wallet,work:Clock3,plan:Activity,orders:Wrench,hires:UsersRound,tows:Truck};
type Props={pulse:HomePulse;preferences:PulsePreferences;finance?:HomeFinancialAnalytics|null;work?:HomeWorkAnalytics|null;chartId?:HomeChartId;chartView?:Partial<CardView>;onChartViewChange?:(view:CardView)=>Promise<void>;onArrange?:()=>void;onOpen:(t:HomeTarget)=>void};

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const usdExact=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
const decimals=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const dayRE=/^\d{4}-\d{2}-\d{2}$/;
const dateLabel=(s:string,opts:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...opts}).format(new Date((s.length===7?s+'-01':s)+'T12:00:00Z'));
const monthLabel=(s:string)=>dateLabel(s,{month:'short',year:'numeric'});
const dayLabel=(s:string)=>dateLabel(s,{month:'short',day:'numeric'});
const colors=['var(--ha-teal)','var(--ha-violet)','var(--ha-amber)'];
const orderMetrics:Metric[]=[{id:'opened',label:'Opened',color:colors[0]},{id:'completed',label:'Completed',color:colors[1],dash:'7 4'}];
const fMetrics:Metric[]=[{id:'revenue',label:'Operating Receipts',color:colors[0]},{id:'spending',label:'Spending',color:colors[1],dash:'7 4'},{id:'netCash',label:'Net Cash Flow',color:colors[2],dash:'2 5'}];
function amount(value:number|null|undefined,kind:Sources,exact=false){return numeric(value)?kind==='finance'?(exact?usdExact:usd).format(value):decimals.format(value)+(kind==='work'?' h':''):'—';}
function daysFrom(d:string,n:number){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);}
function planRows(pulse:HomePulse,preferences:PulsePreferences){
 const acc=new Map<string,{tasks:Set<string>;shifts:Set<string>}>();
 for(const s of pulse.signals){if(preferences[s.id]?.mode==='hidden')continue;for(const i of s.items){if(i.calendar===false)continue;const stamp=i.due||(i.calendar?i.at:'');if(!stamp)continue;const dt=dayRE.test(stamp)?stamp:Number.isNaN(Date.parse(stamp))?'':new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date(stamp));if(!dt||dt<pulse.today)continue;const bucket=acc.get(dt)||{tasks:new Set<string>(),shifts:new Set<string>()};const key=s.module+'|'+i.id;(s.id==='my_shifts'?bucket.shifts:bucket.tasks).add(key);acc.set(dt,bucket);}}
 return Array.from({length:14},(_,i)=>{const key=daysFrom(pulse.today,i),b=acc.get(key);return {key,label:dateLabel(key,{weekday:'short',month:'short',day:'numeric'}),short:dateLabel(key,{weekday:'short'}),values:{tasks:b?.tasks.size??0,shifts:b?.shifts.size??0}};});
}
const icons={line:LineChart,bar:BarChart3,scatter:ScatterChart,table:Table2}, chartNames={line:'Line',bar:'Bars',scatter:'Scatter',table:'Table'};
function DataTable({rows,metrics,kind,period}:{rows:Row[];metrics:Metric[];kind:Sources;period:string}){
 return <div className="ha-table" role="region" aria-label="Chart Values" tabIndex={0}><table><caption className="sr-only">Underlying chart values by {period.toLowerCase()}; a dash means no recorded data.</caption><thead><tr><th scope="col">{period}</th>{metrics.map(m=><th scope="col" key={m.id}>{m.label}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.key}><th scope="row">{r.label}{r.note&&<small className="ha-row-note">{r.note}</small>}</th>{metrics.map(m=><td key={m.id}>{amount(r.values[m.id],kind,true)}</td>)}</tr>)}</tbody></table></div>;
}
function Graph({rows,metrics,kind,mode,index,onInspect,period}:{rows:Row[];metrics:Metric[];kind:Sources;mode:Mode;index:number;onInspect:(i:number)=>void;period:string}){
 const W=628,H=219,L=58,R=12,T=14,B=37,inner=W-L-R,depth=H-T-B;
 const uid=useId().replace(/:/g,''),isScatter=mode==='scatter',only=metrics[0],other=metrics[1],isBar=mode==='bar';
 const vals=(m:Metric)=>rows.map(r=>r.values[m.id]);
 const have=rows.some(r=>isScatter?only&&other&&numeric(r.values[only.id])&&numeric(r.values[other.id]):metrics.some(m=>numeric(r.values[m.id])));
 if(!have)return <div className="ha-empty"><ChartNoAxesCombined size={28}/><strong>{isScatter?'No Matched Periods':'No Recorded Values in This Range'}</strong><span>{isScatter?'Each point needs a recorded value on both axes.':kind==='orders'?'Work orders need a recorded opening or completion date to appear here.':'Try the longer range or check the source records.'}</span></div>;
 const scatterRows=isScatter?rows.filter(r=>numeric(r.values[only.id])&&numeric(r.values[other.id])):[];
 const yr=axisBounds(isScatter?scatterRows.map(r=>r.values[other.id]):metrics.flatMap(vals),kind!=='finance'&&kind!=='work');
 const xr=axisBounds(isScatter?scatterRows.map(r=>r.values[only.id]):[]);
 const x=(i:number)=>L+(i+.5)*inner/rows.length,y=(v:number)=>T+depth*(yr.max-v)/(yr.max-yr.min);
 const sx=(v:number)=>L+(v-xr.min)*inner/(xr.max-xr.min);
 const tick=(n:number)=>(kind==='finance'?(n<0?'−$':'$')+compact.format(Math.abs(n)):decimals.format(n));
 const activate=(e:React.KeyboardEvent<SVGGElement>,i:number)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onInspect(i);}};
 return <div className="ha-plot">
 {isScatter&&<div className="ha-axis-top">Y · {other.label}</div>}
 <svg role="group" aria-label={isScatter?other.label+' by '+only.label:chartNames[mode]+' chart by '+period.toLowerCase()} viewBox={'0 0 '+W+' '+H} preserveAspectRatio="xMidYMid meet">
  <title>{isScatter?other.label+' by '+only.label:metrics.map(x=>x.label).join(' and ')+' by '+period.toLowerCase()}</title>
  <defs><linearGradient id={'Fill'+uid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={only.color} stopOpacity={.19}/><stop offset="100%" stopColor={only.color} stopOpacity={0}/></linearGradient></defs>
  {yr.ticks.map((t,i)=><g key={i}><line x1={L} x2={W-R} y1={y(t)} y2={y(t)} className={'ha-gridline '+(t===0?'zero':'')}/><text x={L-8} y={y(t)+3.5} textAnchor="end" className="ha-axis">{tick(t)}</text></g>)}
  {isScatter?xr.ticks.map((t,i)=><g key={i}><line x1={sx(t)} x2={sx(t)} y1={T} y2={H-B} className="ha-gridline"/><text x={sx(t)} y={H-B+18} textAnchor="middle" className="ha-axis">{tick(t)}</text></g>):rows.map((r,i)=>(rows.length<=7||i===rows.length-1||i===0||i%2===0)&&<text key={r.key} x={x(i)} y={H-B+21} textAnchor="middle" className="ha-axis">{r.short}</text>)}
  {isScatter?<>{rows.map((r,i)=>numeric(r.values[only.id])&&numeric(r.values[other.id])&&<g key={r.key} className="ha-point-button" role="button" tabIndex={0} aria-label={r.label+': '+only.label+' '+amount(r.values[only.id],kind,true)+', '+other.label+' '+amount(r.values[other.id],kind,true)} onFocus={()=>onInspect(i)} onMouseEnter={()=>onInspect(i)} onClick={()=>onInspect(i)} onKeyDown={e=>activate(e,i)}><title>{r.label}</title><circle cx={sx(r.values[only.id]!)} cy={y(r.values[other.id]!)} r={11} fill="transparent"/><circle cx={sx(r.values[only.id]!)} cy={y(r.values[other.id]!)} r={i===index?7:5} fill={i===index?other.color:only.color} stroke="var(--p-card)" strokeWidth={1.6}/></g>)}<text x={L+inner/2} y={H-1} textAnchor="middle" className="ha-axis">X · {only.label}</text></>:<>
  {mode==='line'&&metrics.map((m,j)=>{const segments=lineSegments(rows,(r,i)=>numeric(r.values[m.id])?{x:x(i),y:y(r.values[m.id]!)}:null);return <g key={m.id}>{segments.map((p,k)=>{const path=p.map(a=>a.x+','+a.y).join(' ');return <g key={k}>{j===0&&p.length>1&&<polygon points={p[0].x+','+y(0)+' '+path+' '+p[p.length-1].x+','+y(0)} fill={'url(#Fill'+uid+')'}/>}<polyline points={path} stroke={m.color} strokeWidth="2.7" fill="none" strokeDasharray={m.dash} strokeLinecap="round" strokeLinejoin="round"/>{p.map((q,qi)=><circle key={qi} cx={q.x} cy={q.y} r={2.8} fill="var(--p-card)" stroke={m.color} strokeWidth={1.5}/>)}</g>})}</g>})}
  {isBar&&rows.map((r,i)=>{const cluster=inner/rows.length*.68,w=cluster/metrics.length;return <g key={r.key}>{metrics.map((m,j)=>{const value=r.values[m.id];return numeric(value)?<rect key={m.id} x={x(i)-cluster/2+j*w} y={Math.min(y(value),y(0))} width={Math.max(w-1.3,1)} height={Math.max(1,Math.abs(y(value)-y(0)))} rx="2" fill={m.color}/>:null;})}</g>;})}
  {index>=0&&<line x1={x(index)} x2={x(index)} y1={T} y2={H-B} className="ha-crosshair"/>}
  {rows.map((r,i)=><g className="ha-slot" key={r.key} role="button" tabIndex={0} aria-label={r.label+': '+metrics.map(m=>m.label+' '+amount(r.values[m.id],kind,true)).join(', ')} onFocus={()=>onInspect(i)} onMouseEnter={()=>onInspect(i)} onClick={()=>onInspect(i)} onKeyDown={e=>activate(e,i)}><rect x={L+i*inner/rows.length} y={T} height={depth} width={inner/rows.length} fill="transparent"/></g>)}
  </>}
 </svg></div>;
}
export default function HomeAnalytics(props:Props){
 const finance=props.finance??props.pulse.analytics,work=props.work??props.pulse.workAnalytics;
 // A card cannot switch to an unrelated source if a grant is revoked or a module is offline.
 if((props.chartId==='chart-finance'&&!finance)||(props.chartId==='chart-time'&&!work)||(props.chartId==='chart-orders'&&!props.pulse.orderAnalytics)||(props.chartId==='chart-hires'&&!props.pulse.businessTrends?.hires)||(props.chartId==='chart-tows'&&!props.pulse.businessTrends?.tows))return null;
 return <AnalyticsCard key={props.chartId||'explore'} {...props} finance={finance} work={work}/>;
}
function AnalyticsCard({pulse,preferences,finance,work,chartId,chartView,onChartViewChange,onArrange,onOpen}:Props){
 const orders=pulse.orderAnalytics;
 const [source,setSource]=useState<Sources>(()=>finance?.months.some(m=>m.transactionCount!==null)?'finance':work?.weeks.some(w=>w.recorded!==null||w.scheduled!==null)?'work':'plan');
 const fallback:Mode=chartId==='chart-workload'?'bar':'line';
 const [localView,setLocalView]=useState<CardView>(()=>({mode:chartView?.mode??fallback,range:chartView?.range??6}));
 const [pendingView,setPendingView]=useState<CardView|null>(null),saving=useRef(false);
 const [viewError,setViewError]=useState(''),[focus,setFocus]=useState(''),[targetMetric,setMetric]=useState(''),[showDefs,setDefs]=useState(false);
 const committed:CardView=onChartViewChange?{mode:chartView?.mode??fallback,range:chartView?.range??6}:localView;
 const {mode:requestedMode,range}=pendingView??committed;
 const kind:Sources=chartId?sources[chartId]:source==='finance'&&!finance?(work?'work':'plan'):source==='work'&&!work?(finance?'finance':'plan'):source==='orders'&&!orders?'plan':source;
 const business=kind==='hires'?pulse.businessTrends?.hires:kind==='tows'?pulse.businessTrends?.tows:null;
 const businessMetrics:Metric[]=business?[{id:'value',label:business.unit,color:colors[0]},...(business.secondaryUnit?[{id:'secondary',label:business.secondaryUnit,color:colors[1],dash:'7 4'}]:[])]:[];
 async function changeView(view:CardView){
  if(saving.current)return;setFocus('');setViewError('');
  if(!onChartViewChange){setLocalView(view);return;}
  saving.current=true;setPendingView(view);
  try{await onChartViewChange(view);}catch(e){setViewError(e instanceof Error?e.message:'Could not save this chart view. Try again.');}
  finally{saving.current=false;setPendingView(null);}
 }
 const shiftFeed=pulse.signals.some(s=>s.id==='my_shifts'&&preferences[s.id]?.mode!=='hidden');
 const ownedWork:Metric[]=useMemo(()=>[...(work?.recordAccess?[{id:'recorded',label:'Recorded Hours',color:colors[0]},{id:'approved',label:'Approved Hours',color:colors[2],dash:'2 5'}]:[]),...(work?.scheduleAccess?[{id:'scheduled',label:'Published Hours',color:colors[1],dash:'7 4'}]:[])],[work?.recordAccess,work?.scheduleAccess]);
 const allMetrics=kind==='finance'?fMetrics:kind==='work'?ownedWork:kind==='orders'?orderMetrics:business?businessMetrics:[{id:'tasks',label:'Deadlines & Coverage',color:colors[0]},...(shiftFeed?[{id:'shifts',label:'My Shifts',color:colors[1],dash:'7 4'}]:[])];
 const allRows=useMemo<Row[]>(()=>{
  if(kind==='finance'&&finance)return finance.months.map(m=>({key:m.month,label:monthLabel(m.month),short:dateLabel(m.month,{month:'short'}),note:!m.transactionCount?'No entries':m.month===finance.asOf.slice(0,7)?'Month to date':!m.complete?'Partial coverage':undefined,values:{revenue:m.revenue,spending:m.spending,netCash:m.netCash}} as Row));
  if(kind==='work'&&work)return work.weeks.map(w=>({key:w.week,label:'Week of '+dayLabel(w.week),short:dayLabel(w.week),values:{recorded:w.recorded,approved:w.approved,scheduled:w.scheduled}} as Row));
  if(kind==='orders'&&orders)return orders.weeks.map(w=>({key:w.week,label:'Week of '+dayLabel(w.week),short:dayLabel(w.week),note:w.opened===null&&w.completed===null?'No dated history':w.partial?(orders.asOf<daysFrom(w.week,7)&&orders.asOf>=w.week?'Week to date':'Partial history'):undefined,values:{opened:w.opened,completed:w.completed}}));
  if(business)return business.months.map(m=>({key:m.month,label:monthLabel(m.month),short:dateLabel(m.month,{month:'short'}),note:m.value===null&&m.secondary===null?'No dated entries':m.month===business.asOf.slice(0,7)?'Month to date':undefined,values:{value:m.value,secondary:m.secondary}}));
  return planRows(pulse,preferences);
 },[kind,finance,work,orders,business,pulse,preferences]);
 const rows=kind==='plan'?allRows.slice(0,range===6?7:14):allRows.slice(-range);
 const scatter=kind==='finance'?[fMetrics[0],fMetrics[1]]:kind==='work'?[ownedWork.find(m=>m.id==='scheduled')||ownedWork[0],ownedWork.find(m=>m.id==='recorded')||ownedWork[1]].filter((x,i,arr)=>!!x&&arr.findIndex(a=>a?.id===x.id)===i):allMetrics;
 const permitsScatter=(kind==='finance'||kind==='work')&&scatter.length>=2;
 const mode=requestedMode==='scatter'&&!permitsScatter?'line':requestedMode;
 const chosen=allMetrics.find(x=>x.id===targetMetric),metrics=mode==='scatter'?scatter:chosen?[chosen]:allMetrics;
 const activeData=focus?rows.find(r=>r.key===focus):undefined;
 const picked=activeData||(kind==='plan'?(rows.find(r=>metrics.some(m=>(r.values[m.id]??0)>0))||rows[0]):[...rows].reverse().find(r=>mode==='scatter'?metrics.every(m=>numeric(r.values[m.id])):metrics.some(m=>numeric(r.values[m.id]))))||rows.at(-1);
 const index=picked?rows.indexOf(picked):-1;
 const title=chartTitles[kind], Badge=sourceIcons[kind];
 const period=business||kind==='finance'?'Month':kind==='plan'?'Day':'Week';
 const sourceTabs=[...(finance?[['finance','Finance']]:[]),...(work?[['work','My Time']]:[]),...(orders?[['orders','Work Orders']]:[]),['plan','Workload']];
 const target=kind==='finance'&&finance&&finance.reportable?{module:'Finance',tab:'Reports & Taxes',section:'report:'+(mode==='scatter'?finance.reportIds.scatter:chosen?.id==='spending'?finance.reportIds.spending:chosen?.id==='netCash'?finance.reportIds.netCash:finance.reportIds.revenue)}:kind==='work'&&work?{module:'Timeclock',tab:work.historyTab}:kind==='orders'&&orders?{module:'Work Orders',tab:'orders'}:kind==='hires'?{module:'People & HR',tab:'reports',section:'report:hires'}:kind==='tows'?{module:'Account Management',tab:'reports'}:undefined;
 const changeDefaults=(next:Sources)=>{setSource(next);setFocus('');setMetric('');setLocalView(v=>({...v,mode:'line'}));setDefs(false);setViewError('');};
 const latestCompared=finance?.comparisons.find(c=>c.currentMonth&&c.previousMonth),scope=kind==='finance'?(latestCompared?.currentMonth&&latestCompared?.previousMonth?monthLabel(latestCompared.currentMonth)+' vs. '+monthLabel(latestCompared.previousMonth):'No comparable month pair'):kind==='work'?(work?.scheduleAccess?'Recorded time and published schedules are separate.':'Recorded time in your own file.'):'Dated entries on your Command calendar.';
 const totals=(kind==='orders'||business)?Object.fromEntries(allMetrics.map(m=>{const values=rows.map(r=>r.values[m.id]).filter(numeric);return [m.id,values.length?values.reduce((a,b)=>a+b,0):null];})):null;
 const orderCoverage=orders?.coverageFrom?'Recorded history begins '+dateLabel(orders.coverageFrom,{month:'short',day:'numeric',year:'numeric'})+'.':'No dated work order history is available.';
 const missingOrders=[orders?.undatedOpened?orders.undatedOpened+' undated '+(orders.undatedOpened===1?'opening':'openings'):'',orders?.undatedCompleted?orders.undatedCompleted+' undated '+(orders.undatedCompleted===1?'completion':'completions'):''].filter(Boolean).join(' and ');
 return <section className="ha-panel" aria-label={chartId?'Dashboard Analytics: '+title:'Dashboard Analytics'}>
  <header className="ha-header"><div className="ha-title"><span className="ha-symbol">{chartId?<Badge size={22}/>:<ChartNoAxesCombined size={23}/>}</span><div><span className="ha-cap">{chartId?chartModules[kind]+' / Analytics':'Analytics'}</span><h2>{title}</h2></div></div>
   {!chartId&&<div className="ha-source" role="group" aria-label="Analytics Source">{sourceTabs.map(([id,label])=><button type="button" key={id} aria-pressed={kind===id} onClick={()=>changeDefaults(id as Sources)}>{id==='finance'?<Wallet size={14}/>:id==='work'?<Clock3 size={14}/>:id==='orders'?<Wrench size={14}/>:<Activity size={14}/>} {label}</button>)}</div>}</header>
  {viewError&&<div className="ha-save-error" role="alert">{viewError} Your previous chart view is still saved.</div>}
  <div className="ha-body"><div className="ha-main"><div className="ha-options"><div className="ha-charttypes" role="group" aria-label="Chart Type">{(['line','bar','scatter','table'] as Mode[]).filter(m=>m!=='scatter'||permitsScatter).map(m=>{const Icon=icons[m];return <button type="button" key={m} aria-label={chartNames[m]+' View'} aria-pressed={mode===m} disabled={!!pendingView} onClick={()=>{if(mode!==m)void changeView({mode:m,range});}}><Icon size={15}/><span>{chartNames[m]}</span></button>;})}</div>
   <label className="ha-range"><span className="sr-only">Analytics Date Range</span><select value={range} disabled={!!pendingView} onChange={e=>void changeView({mode,range:e.target.value==='12'?12:6})}>{[6,12].map(n=><option key={n} value={n}>{kind==='plan'?'Next '+(n===6?7:14)+' Days':'Last '+n+(period==='Month'?' Months':' Weeks')}</option>)}</select><ChevronDown size={14}/></label></div>
   <div className="ha-legend" role="group" aria-label="Series Filter">{(mode==='scatter'?scatter:allMetrics).map(m=><button type="button" key={m.id} aria-pressed={mode==='scatter'||!chosen||chosen.id===m.id} disabled={mode==='scatter'} title={mode==='scatter'?m.label:'Show only '+m.label+' or return to all series'} onClick={()=>{setMetric(chosen?.id===m.id?'':m.id);setFocus('');}}><span style={{background:m.color}}/>{m.label}</button>)}</div>
   {mode==='table'?<DataTable rows={rows} metrics={metrics} kind={kind} period={period}/>:<><Graph rows={rows} metrics={metrics} mode={mode} kind={kind} index={index} onInspect={i=>setFocus(rows[i].key)} period={period}/>
   {picked&&<div className="ha-readout"><b>{picked.label}{picked.note?' · '+picked.note:''}</b>{metrics.map(m=><span key={m.id}><i style={{background:m.color}}/>{m.label} <strong>{amount(picked.values[m.id],kind,true)}</strong></span>)}</div>}</>}
  </div><aside className="ha-side"><div className="ha-side-top"><span className="ha-cap">{kind==='finance'?'Month Comparison':totals?'Period Totals':kind==='work'?'Week Detail':'Day Detail'}</span><strong>{kind==='finance'?scope:kind==='orders'&&rows.length?dayLabel(rows[0].key)+' – '+dayLabel(orders!.asOf):business&&rows.length?monthLabel(rows[0].key)+' – '+monthLabel(rows[rows.length-1].key):picked?.label||period}</strong></div>
  {allMetrics.map(m=>{const c=kind==='finance'?finance?.comparisons.find(x=>x.key===m.id):undefined;
   const previous=c?.previous??null,value=kind==='finance'?c?.current:totals?totals[m.id]:picked?.values[m.id];
   const Direction=c?.direction==='up'?ArrowUpRight:c?.direction==='down'?ArrowDownRight:Minus;
   return <div className="ha-summary" key={m.id}><span className="ha-summary-name"><i style={{background:m.color}}/>{m.label}</span><strong>{amount(value,kind)}</strong>
   {kind==='finance'&&<span className="ha-delta" data-state={c?.assessment||'neutral'} title={c&&numeric(previous)?'Previous period: '+amount(previous,kind,true):undefined} aria-label={c&&c.direction!=='unknown'?m.label+': '+c.direction+', '+c.assessment:'No comparable data'}><Direction size={15}/>{c&&c.direction!=='unknown'?(c.direction==='flat'?'No Change':numeric(c.percent)?Math.abs(c.percent).toLocaleString('en-US',{maximumFractionDigits:1})+'%':numeric(c.change)?amount(Math.abs(c.change),kind):'—'):'No comparison'}</span>}</div>})}
  {target&&<button type="button" className="ha-reportlink" onClick={()=>onOpen(target)}>{kind==='finance'?'Open Finance Report':kind==='orders'?'Open Work Orders':kind==='hires'?'Open Hiring Trend':kind==='tows'?'Open Property Results':'Open Timeclock'}<ArrowRight size={15}/></button>}</aside></div>
  <footer className="ha-footer"><span>{kind==='finance'&&finance?(finance.through?'Bank entries through '+dateLabel(finance.through,{month:'short',day:'numeric',year:'numeric'})+'. ':'No dated bank entries. ')+'Gaps indicate missing records.':kind==='work'?'Published hours are planned; recorded hours come from timesheets. Gaps indicate no entries.':kind==='orders'?orderCoverage+(missingOrders?' Not plotted: '+missingOrders+'.':''):business?business.note:'Counts cover deadlines, hearings, coverage gaps and shifts visible on your dashboard.'}</span><div className="ha-foot-actions"><button type="button" onClick={()=>setDefs(!showDefs)} aria-expanded={showDefs}>How It’s Counted <ChevronDown size={14}/></button>{onArrange&&<button type="button" className="ha-arrange" aria-label={'Arrange '+title+' on Home'} onClick={onArrange}><SlidersHorizontal size={14}/>Arrange on Home</button>}</div></footer>
  {showDefs&&<div className="ha-defs">{kind==='finance'&&finance?<><p>{finance.source}</p>{fMetrics.map(m=><p key={m.id}><b>{m.label}:</b> {finance.definitions[m.id as keyof typeof finance.definitions]}</p>)}<p>Arrows compare consecutive recorded months after both have ended. Lower spending is marked favorable for cost control. A percentage requires a positive baseline. Net cash flow is not profit.</p></>:kind==='work'?<p>Weeks start Sunday in Austin. Recorded hours include corrections reflected in your timesheet. Approved hours are the approved portion of those hours. Published shifts span their actual times, including overnight shifts; upcoming hours are planned rather than hours already worked.</p>:kind==='orders'?<p>Weeks begin Sunday in Austin. Each work order counts once when opened and once when first completed. Due dates and later edits do not count as activity. The current week is still in progress. Weeks before the earliest known event are blank; zero means no dated event in that week.</p>:business?<p>{kind==='hires'?'Counts use recorded employment start dates in the personnel files you can access.':'Confirmed tows are plotted by tow date. Records with only a received date are shown separately by that date.'} A dash means no dated observation. This month is still in progress.</p>:<p>Each dated entry is counted once per module and day. This view shows planned workload rather than performance. Hidden dashboard items are excluded.</p>}</div>}
 </section>;
}
