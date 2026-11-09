'use client';
import {useMemo,useState,type ReactNode} from 'react';
import {Activity,ArrowRight,ArrowUpRight,BookOpenCheck,BriefcaseBusiness,Building2,CalendarDays,CalendarRange,ChartNoAxesColumn,CheckCircle2,ChevronDown,ChevronLeft,ChevronRight,ChevronUp,Clock3,FileClock,Gavel,Layers3,ListChecks,Pin,RefreshCw,ShieldAlert,SlidersHorizontal,Users,Wallet,Wrench,X} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import HomeAnalytics from './HomeAnalytics';
import HomeLearning from './HomeLearning';
import {greeting} from '@/lib/home/layout';
import {availableHomeSections,defaultHomeLayout,type DashboardChartView,type DashboardLayout,type HomeSectionId} from '@/lib/home/dashboard-layout';
import {selectDashboardSignals,type HomePulse,type PulsePreferences,type PulseSignal,type PulseItem} from '@/lib/home/pulse-types';
import type {HomeData,HomeTarget} from '@/lib/home/widgets';
import {auditStamp} from '@/lib/shared/audit-format';
import './command-dashboard.css';

type Props={readOnly?:boolean;layout?:DashboardLayout;availableSections?:HomeSectionId[];onChartViewChange?:(id:HomeSectionId,next:DashboardChartView)=>Promise<void>;data:Pick<HomeData,'viewer'|'title'|'timeZone'>;pulse:HomePulse;preferences:PulsePreferences;onChange:(next:PulsePreferences)=>Promise<void>;onOpen:(target:HomeTarget)=>void;onRefresh:()=>void;onCustomize:()=>void;refreshing:boolean;now:number};
const ct='America/Chicago';
const dayOnly=/^\d{4}-\d{2}-\d{2}$/;
const weekNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const dayFormat=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'});
const shortDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
const forDay=(key:string)=>new Date(key+'T12:00:00Z');
const shiftDay=(key:string,offset:number)=>{const d=forDay(key);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const weekStart=(key:string)=>shiftDay(key,-forDay(key).getUTCDay());
const localDayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:ct,year:'numeric',month:'2-digit',day:'2-digit'});
const clockFmt=new Intl.DateTimeFormat('en-US',{timeZone:ct,hour:'numeric',minute:'2-digit'});
function localDay(date?:string){if(!date)return '';if(dayOnly.test(date))return date;const d=new Date(date);return Number.isNaN(+d)?'':localDayFmt.format(d);}
function smallDay(date:string){return shortDate.format(forDay(date));}
const period=(a:string,b:string)=>smallDay(a)+' – '+smallDay(b);
const showModule=(s:string)=>s==='Accounts'?'Account Hub':s==='SOP Library'?'School House':s;
const levelNames={critical:'Critical',warning:'Needs Attention',info:'Update',neutral:'Routine'} as const;
const nf=new Intl.NumberFormat('en-US');
function display(s:PulseSignal){return s.displayValue??nf.format(s.count);}
function category(s:PulseSignal){const q=(s.id+' '+s.module+' '+s.title).toLowerCase();if(/trespass|safety|ctw|suspension/.test(q))return {Icon:ShieldAlert,hue:'berry'};if(/court|hearing|lawsuit|claim|recovery|lawsuit/.test(q))return {Icon:Gavel,hue:'iris'};if(/policy|policies|sop|signature|learning|training|exam/.test(q))return {Icon:BookOpenCheck,hue:'indigo'};if(/shift|timeclock/.test(q))return {Icon:Clock3,hue:'aqua'};if(/people|employee|hiring/.test(q))return {Icon:Users,hue:'indigo'};if(/finance|budget|tax|bill|payroll/.test(q))return {Icon:Wallet,hue:'green'};if(/order|repair/.test(q))return {Icon:Wrench,hue:'orange'};if(/property|properties|account/.test(q))return {Icon:Building2,hue:'aqua'};if(/sales|follow-up/.test(q))return {Icon:BriefcaseBusiness,hue:'iris'};return {Icon:Layers3,hue:'indigo'};}
type Entry={id:string;day:string;stamp:string;signal:PulseSignal;item:PulseItem;timed:boolean};
function planned(signals:PulseSignal[],prefs:PulsePreferences){const all:Entry[]=[],found=new Set<string>();
 for(const s of signals){if(prefs[s.id]?.mode==='hidden')continue;for(const item of s.items){if(item.calendar===false)continue;const stamp=item.due||(item.calendar?item.at:undefined),day=localDay(stamp);if(!stamp||!day)continue;const id=s.module+'|'+item.id+'|'+day;if(found.has(id))continue;found.add(id);all.push({id,day,stamp,signal:s,item,timed:!dayOnly.test(stamp)});}}
 return all.sort((a,b)=>a.day.localeCompare(b.day)||(a.timed===b.timed?0:a.timed?1:-1)||(a.timed&&b.timed?+new Date(a.stamp)-+new Date(b.stamp):0)||a.item.title.localeCompare(b.item.title));
}
function oneDue(s:PulseSignal){return s.items.flatMap(i=>i.due?[i.due]:[]).map(localDay).filter(Boolean).sort()[0];}
function dueLabel(d:string,today:string){if(d===today)return 'Due Today';if(d<today)return 'Overdue · '+smallDay(d);if(d===shiftDay(today,1))return 'Due Tomorrow';return 'Due '+smallDay(d);}
function ModeLabel({mode}:{mode:string}){return <span className="cmd-pulse-mode">{mode==='pinned'?<><Pin size={12}/>Pinned</>:mode==='scheduled'?<><CalendarRange size={13}/>Scheduled</>:<><Activity size={13}/>Automatic</>}</span>;}
function Blank({icon:Icon=CheckCircle2,label,sub}:{icon?:typeof CheckCircle2;label:string;sub?:string}){return <div className="cmd-pulse-blank"><Icon size={22}/><div><strong>{label}</strong>{sub&&<span>{sub}</span>}</div></div>;}
export default function CommandDashboard({readOnly=false,data,pulse,preferences,layout,availableSections,onChartViewChange,onChange,onOpen,onRefresh,onCustomize,refreshing,now}:Props){
 const [weekOffset,setWeek]=useState(0),[dayPick,setDayPick]=useState(''),[fullQueue,setFullQueue]=useState(false),[queueLevel,setQueueLevel]=useState(''),[fullDay,setFullDay]=useState(false),[view,setView]=useState('All'),[expanded,setExpanded]=useState(false),[brief,setBrief]=useState<string|null>(null),[updating,setUpdating]=useState(''),[saveError,setSaveError]=useState('');
 const [criticalOpen,setCriticalOpen]=useState(false);
 const allowed=availableSections??availableHomeSections(data.viewer,pulse),personal=layout??defaultHomeLayout(allowed);
 const shown=personal.order.filter(id=>allowed.includes(id)&&!personal.hidden.includes(id));
 const {visible,priorities,pinned,scheduled}=selectDashboardSignals(pulse.signals,preferences,pulse.today,personal.signalOrder);
 const critical=priorities.filter(s=>s.tone==='critical');
 const signalForBrief=brief?pulse.signals.find(x=>x.id===brief):undefined;
 const tracks=useMemo(()=>planned(pulse.signals,preferences),[pulse.signals,preferences]);
 const start=shiftDay(weekStart(pulse.today),weekOffset*7),days=Array.from({length:7},(_,i)=>shiftDay(start,i)),agenda=tracks.filter(e=>e.day>=start&&e.day<=days[6]),selected=days.includes(dayPick)?dayPick:days.includes(pulse.today)?pulse.today:agenda[0]?.day||start,daily=agenda.filter(e=>e.day===selected),peak=Math.max(1,...days.map(d=>agenda.filter(e=>e.day===d).length));
 const signalPool=visible;
 const explicit=new Set(personal.signalOrder);
 const metrics:PulseSignal[]=[];
 // The user's explicit order takes precedence over the automatic module rotation.
 for(const s of signalPool){if(metrics.length<4&&explicit.has(s.id))metrics.push(s);}
 for(const s of pinned){if(metrics.length<4&&!metrics.includes(s))metrics.push(s);}
 for(const distinct of [true,false])for(const s of signalPool){if(metrics.length===4)break;if(!metrics.some(x=>x.id===s.id)&&(!distinct||!metrics.some(x=>x.module===s.module)))metrics.push(s);}
 const countBy=(s:PulseSignal)=>preferences[s.id]?.mode||'auto';
 const signals=view==='Pinned'?pinned:view==='Scheduled'?scheduled:visible;
 const list=expanded?signals:signals.slice(0,6), levels=(['critical','warning','info','neutral'] as const).map(tone=>({tone,n:priorities.filter(s=>s.tone===tone).length})).filter(l=>l.n);
 const activeLevel=levels.some(l=>l.tone===queueLevel)?queueLevel:'', relevant=activeLevel?priorities.filter(s=>s.tone===activeLevel):priorities,queue=fullQueue?relevant:relevant.slice(0,4);
 const currentWeek=weekStart(pulse.today),lastSync=auditStamp(pulse.asOf);
 const earliestWeek=weekStart(tracks[0]?.day&&tracks[0].day<pulse.today?tracks[0].day:pulse.today),nextWeek=shiftDay(currentWeek,7),lastEventDay=tracks[tracks.length-1]?.day||nextWeek,latestWeek=weekStart(lastEventDay>nextWeek?lastEventDay:nextWeek);
 const navigate=(s:PulseSignal,item?:PulseItem)=>{const target=item?.target||s.target;if(target.module==='Home'){setBrief(s.id);return;}onOpen(target);};
 async function pin(s:PulseSignal){if(readOnly||updating)return;setUpdating(s.id);setSaveError('');try{await onChange({...preferences,[s.id]:{mode:countBy(s)==='pinned'?'auto':'pinned'}});}catch(e){setSaveError(e instanceof Error?e.message:'Could not save your preference. Please try again.');}finally{setUpdating('');}}
 function changeWeek(n:number){setDayPick('');setFullDay(false);setWeek(n);}
 const syncTime=lastSync?lastSync.split(' ').slice(1).join(' '):'';
 const contents:Partial<Record<HomeSectionId,()=>ReactNode>>={
  learning:()=>pulse.learning?<HomeLearning learning={pulse.learning} onOpen={onOpen} onCustomize={readOnly?undefined:onCustomize}/>:null,
  glance:()=>(metrics.length>0&&<section className="cmd-pulse-metrics" aria-label="At a Glance" style={{'--tile-count':metrics.length} as React.CSSProperties}>
   {metrics.map(s=>{const {Icon,hue}=category(s);return <button type="button" key={s.id} onClick={()=>navigate(s)} className="cmd-pulse-metric" data-hue={hue}>
    <div className="cmd-pulse-metric-top"><span className="cmd-pulse-ico"><Icon size={17}/></span><span>{showModule(s.module)}</span>{countBy(s)==='pinned'?<Pin className="cmd-pulse-edge" size={14} aria-label="Pinned"/>:<ArrowUpRight className="cmd-pulse-edge" size={14}/>}</div>
    <strong>{display(s)}</strong><b>{s.title}</b>{s.dateLabel&&<small>{s.dateLabel}</small>}
    </button>})}
  </section>),
  priority:()=>(<section className="cmd-pulse-panel cmd-pulse-priorities" aria-labelledby="cmd-priority-head"><header className="cmd-pulse-panel-head"><span className="cmd-pulse-section-icon"><ListChecks size={19}/></span><h2 id="cmd-priority-head">Priority Queue</h2>{priorities.length>0&&<span className="cmd-pulse-total">{priorities.length}</span>}</header>
    {levels.length>0&&<div className="cmd-pulse-mix"><div className="cmd-pulse-mixbar" aria-hidden="true">{levels.map(l=><i key={l.tone} data-level={l.tone} style={{flex:l.n,opacity:activeLevel&&activeLevel!==l.tone ? .3 : 1}}/>)}</div><div className="cmd-pulse-mixkeys" role="group" aria-label="Filter Priorities by Urgency">{levels.map(l=><button type="button" key={l.tone} data-level={l.tone} aria-pressed={activeLevel===l.tone} aria-label={'Filter '+l.n+' '+levelNames[l.tone]+' Topics'} onClick={()=>{setQueueLevel(activeLevel===l.tone?'':l.tone);setFullQueue(false)}}><i/>{l.n} {levelNames[l.tone]}</button>)}{activeLevel&&<button type="button" onClick={()=>setQueueLevel('')} className="cmd-pulse-reset">Clear</button>}</div></div>}
    {queue.length?<><div className="cmd-pulse-priority-list">{queue.map(s=>{const due=oneDue(s),example=s.items[0];return <button key={s.id} type="button" onClick={()=>navigate(s)} className="cmd-pulse-priority" data-tone={s.tone}>
     <span className="cmd-pulse-prio-mark" aria-hidden="true"/><span className="cmd-pulse-prio-copy"><span className="cmd-pulse-kicker">{showModule(s.module)}</span><strong>{s.title}</strong><small>{example?.title||s.description}</small></span><span className="cmd-pulse-prio-status"><span className="cmd-pulse-badge"><span/>{levelNames[s.tone]}</span><small>{due?dueLabel(due,pulse.today):s.dateLabel}</small></span><ChevronRight size={15}/></button>})}</div>
     {relevant.length>4&&<button className="cmd-pulse-show" type="button" onClick={()=>setFullQueue(!fullQueue)} aria-expanded={fullQueue}>{fullQueue?'Show Fewer Priorities':'View All '+relevant.length+' Priorities'}{fullQueue?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>}</>
     :<Blank label={pulse.unavailable.length?'No Priorities in the Available Updates':'No Priorities Requiring Attention'} sub="New issues will appear here as they are recorded."/>}</section>),
  calendar:()=>(<section className="cmd-pulse-panel cmd-pulse-calendar" aria-labelledby="cmd-calendar-head"><header className="cmd-pulse-panel-head"><span className="cmd-pulse-section-icon"><CalendarDays size={18}/></span><h2 id="cmd-calendar-head">My Work Calendar</h2><div className="cmd-pulse-controls"><button type="button" className="cmd-pulse-icon" aria-label="Previous Week" disabled={start<=earliestWeek} onClick={()=>changeWeek(weekOffset-1)}><ChevronLeft size={16}/></button><button type="button" className="cmd-pulse-icon" aria-label="Next Week" disabled={start>=latestWeek} onClick={()=>changeWeek(weekOffset+1)}><ChevronRight size={16}/></button></div></header>
    <div className="cmd-pulse-calendar-inner"><div className="cmd-pulse-cal-label"><strong>{period(start,days[6])}</strong>{weekOffset===0?<span>This Week</span>:<button type="button" onClick={()=>changeWeek(0)}>This Week</button>}</div>
    <div className="cmd-pulse-weekplot" role="group" aria-label="Scheduled Items by Day">{days.map((day,i)=>{const n=agenda.filter(e=>e.day===day).length;return <button type="button" key={day} className="cmd-pulse-day" data-selected={day===selected} data-today={day===pulse.today} aria-pressed={day===selected} aria-label={dayFormat.format(forDay(day))+', '+n+' scheduled '+(n===1?'item':'items')} onClick={()=>{setDayPick(day);setFullDay(false)}}><span>{weekNames[i].slice(0,3)}</span><strong>{Number(day.slice(-2))}</strong><span className="cmd-pulse-chart-track"><i style={{height:n?Math.round(n/peak*100)+'%':0}}/></span><span className="cmd-pulse-daycount" aria-hidden="true">{n}</span></button>})}</div>
    <div className="cmd-pulse-day-head"><span>{dayFormat.format(forDay(selected))}</span><span>{daily.length} {daily.length===1?'Item':'Items'}</span></div>
    {daily.length?<div className="cmd-pulse-agenda">{(fullDay?daily:daily.slice(0,3)).map(e=><button type="button" key={e.id} onClick={()=>navigate(e.signal,e.item)}><time dateTime={e.stamp}>{e.timed?clockFmt.format(new Date(e.stamp))+' CT':e.signal.id.startsWith('court_')&&e.item.id.startsWith('hearing:')?'Hearing':e.item.due?'Due':'Scheduled'}</time><span><strong>{e.item.title}</strong><small>{showModule(e.signal.module)}</small></span><ChevronRight size={14}/></button>)}{daily.length>3&&<button type="button" className="cmd-pulse-show" onClick={()=>setFullDay(!fullDay)} aria-expanded={fullDay}>{fullDay?'Show Fewer':'View All '+daily.length+' Items'}</button>}</div>:<p className="cmd-pulse-day-empty">No items for this day in your dashboard updates.</p>}
    </div></section>),
  signals:()=>(<section className="cmd-pulse-panel cmd-pulse-monitor" aria-labelledby="cmd-monitor-head"><header className="cmd-pulse-panel-head"><span className="cmd-pulse-section-icon"><ChartNoAxesColumn size={18}/></span><h2 id="cmd-monitor-head">My Dashboard</h2><div className="cmd-pulse-tabs" role="group" aria-label="Filter Dashboard Cards">{['All','Pinned','Scheduled'].map(tab=><button key={tab} type="button" aria-pressed={tab===view} onClick={()=>{setView(tab);setExpanded(false)}}>{tab}</button>)}</div></header>
   {list.length?<><div className="cmd-pulse-watchgrid">{list.map(s=>{const {Icon,hue}=category(s),mode=countBy(s);return <article className="cmd-pulse-watch" data-hue={hue} key={s.id}><div className="cmd-pulse-watchbody"><button type="button" className="cmd-pulse-watchlink" onClick={()=>navigate(s)}><div className="cmd-pulse-watch-head"><span className="cmd-pulse-ico"><Icon size={16}/></span><span>{showModule(s.module)}</span></div><div className="cmd-pulse-watch-stat"><strong>{display(s)}</strong><b>{s.title}</b></div></button>{!readOnly&&<button type="button" className="cmd-pulse-pin" disabled={!!updating} aria-pressed={mode==='pinned'} aria-label={(mode==='pinned'?'Unpin ':'Pin ')+s.title} title={(mode==='pinned'?'Unpin ':'Pin ')+s.title} onClick={()=>void pin(s)}><Pin size={15}/></button>}</div><div className="cmd-pulse-watchfoot"><ModeLabel mode={mode}/><button type="button" aria-label={'Open '+s.title} onClick={()=>navigate(s)}><ArrowRight size={14}/></button></div></article>})}</div>{signals.length>6&&<button type="button" className="cmd-pulse-show" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show Fewer Cards':'See All '+signals.length+' Cards'}{expanded?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>}</>:<Blank icon={view==='Pinned'?Pin:SlidersHorizontal} label={view==='Pinned'?'No Pinned Cards':view==='Scheduled'?'No Cards Scheduled for Today':'No Dashboard Cards to Show'} sub={readOnly?undefined:view==='Pinned'?'Pin a card to keep it here every day.':'Choose cards and display days in Customize Dashboard.'}/>}</section>)
 };
 function section(id:HomeSectionId){
  switch(id){
   case 'chart-finance':case 'chart-time':case 'chart-workload':case 'chart-orders':case 'chart-hires':case 'chart-tows':
    return <HomeAnalytics onArrange={readOnly?undefined:onCustomize} chartId={id} chartView={personal.chartViews?.[id]} onChartViewChange={!readOnly&&onChartViewChange?(next=>onChartViewChange(id,next)):undefined} pulse={pulse} preferences={preferences} finance={pulse.analytics} work={pulse.workAnalytics} onOpen={onOpen}/>;
   default:return contents[id]?.();
  }
 }
 const rowSections=shown.filter(id=>id!=='glance'||metrics.length>0);
 const isPair=(a:HomeSectionId,b?:HomeSectionId)=>(a==='priority'&&b==='calendar')||(a==='calendar'&&b==='priority');
 return <div className="cmd-pulse">
  <header className="cmd-pulse-hero">
   <div className="cmd-pulse-hero-copy"><div className="cmd-pulse-eyebrow"><span className="cmd-pulse-marker"/><span>Command</span><span className="cmd-pulse-separator">/</span>Home</div>
   <h1>{greeting(data.viewer.name,now,ct)}</h1>
   <div className="cmd-pulse-week"><CalendarDays size={15}/><span>{period(currentWeek,shiftDay(currentWeek,6))}, {forDay(pulse.today).getUTCFullYear()}</span>{data.title&&<><i/><span>{data.title}</span></>}</div></div>
   <div className="cmd-pulse-head-actions"><div><button className="cmd-pulse-icon light" type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh Dashboard" title="Refresh Dashboard"><RefreshCw size={17} className={refreshing?'cmd-spin':''}/></button>{!readOnly&&<button className="cmd-pulse-custom" type="button" onClick={onCustomize}><SlidersHorizontal size={16}/>Customize Dashboard</button>}</div>{syncTime&&<span title={lastSync} aria-live="off">Updated {syncTime}</span>}</div>
  </header>
  {pulse.unavailable.length>0&&<div role="status" className="cmd-pulse-error"><FileClock size={16}/><span>Some updates could not be loaded: {pulse.unavailable.map(showModule).join(', ')}.</span><button type="button" onClick={onRefresh} disabled={refreshing}>Retry</button></div>}
  {saveError&&<div role="alert" className="cmd-pulse-error"><span>{saveError}</span><button type="button" aria-label="Dismiss Error" onClick={()=>setSaveError('')}><X size={15}/></button></div>}
  {critical.length>0&&<button type="button" className="cmd-pulse-critical" aria-haspopup="dialog" aria-label={'Review Critical Alerts: '+critical.map(s=>s.title).join(', ')} onClick={()=>setCriticalOpen(true)}><ShieldAlert size={16}/><strong>Critical Now</strong><span>{critical[0].title}{critical.length>1?' · +'+(critical.length-1)+' more':''}</span><ChevronRight size={14}/></button>}
  {rowSections.length?<div className="cmd-pulse-arranged">{rowSections.map((id,index)=><div key={id} data-home-section={id} className={isPair(id,rowSections[index-1])||isPair(id,rowSections[index+1])?'cmd-pulse-half':'cmd-pulse-full'}>{section(id)}</div>)}</div>:<div className="cmd-pulse-empty-layout"><Layers3 size={22}/><div><strong>Your Home Is Clear</strong>{!readOnly&&<p>Use Customize Dashboard to add a chart, your calendar, or the sections you want to see here.</p>}</div>{!readOnly&&<button type="button" onClick={onCustomize}>Choose Sections</button>}</div>}
  <Dialog open={criticalOpen} onOpenChange={setCriticalOpen}><DialogContent className="cmd-pulse-brief" aria-describedby={undefined}><DialogTitle>Critical Alerts</DialogTitle><div className="cmd-pulse-brief-list">{critical.length?critical.map(s=><article key={s.id}><small>{showModule(s.module)}</small><strong>{s.title}</strong><p>{s.items[0]?.title||s.description}</p><button type="button" onClick={()=>{setCriticalOpen(false);navigate(s);}}>Review {s.title} <ArrowRight size={14}/></button></article>):<p>No critical alerts at this time.</p>}</div></DialogContent></Dialog>
  <Dialog open={!!signalForBrief} onOpenChange={open=>{if(!open)setBrief(null)}}><DialogContent className="cmd-pulse-brief" aria-describedby={undefined}><DialogTitle>{signalForBrief?.title||'Operational Brief'}</DialogTitle>{signalForBrief&&<><p>{signalForBrief.description}</p><div className="cmd-pulse-brief-list">{signalForBrief.items.length?signalForBrief.items.map(item=><article key={item.id}><strong>{item.title}</strong>{item.detail&&<p>{item.detail}</p>}{(item.at||item.due)&&<small>{auditStamp(item.due||item.at)}</small>}{item.target&&item.target.module!=='Home'&&<button type="button" onClick={()=>{setBrief(null);onOpen(item.target!)}}>Open Record <ArrowUpRight size={14}/></button>}</article>):<p>No current entries.</p>}</div></>}</DialogContent></Dialog>
 </div>;
}
