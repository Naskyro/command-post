'use client';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';

import {useMemo,useState,type ComponentType,type DragEvent} from 'react';
import {GraduationCap,Building2,Users,ArrowDown,ArrowUp,CalendarDays,ChartColumnIncreasing,ChartNoAxesCombined,Check,ChevronDown,Clock3,EyeOff,GripVertical,Layers3,LayoutDashboard,LayoutList,ListChecks,Minus,Pin,Plus,RotateCcw,Search,SlidersHorizontal,Sparkles,Wrench,X} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {defaultHomeLayout,type DashboardLayout,type HomeSectionId} from '@/lib/home/dashboard-layout';
import {rankSignals,type PulsePreferences,type PulseSignal} from '@/lib/home/pulse-types';
import './dashboard-settings.css';

type Props={open:boolean;onClose:()=>void;signals:PulseSignal[];preferences:PulsePreferences;availableSections:HomeSectionId[];layout:DashboardLayout;onSave:(p:PulsePreferences,l:DashboardLayout)=>Promise<void>;initialTab?:'layout'|'signals'};
type Mode=PulsePreferences[string]['mode'];
type Icon=ComponentType<{size?:number;strokeWidth?:number;'aria-hidden'?:boolean}>;
const section:Record<HomeSectionId,{title:string;source:string;description:string;icon:Icon}>={
 'learning':{title:'My Learning',source:'School House',description:'Assigned courses, progress, overdue training, and permitted instructor reviews.',icon:GraduationCap},
 'glance':{title:'At a Glance',source:'Home',description:'Your most relevant counts across modules.',icon:LayoutDashboard},
 'priority':{title:'Priority Queue',source:'Home',description:'The most urgent issues and upcoming deadlines.',icon:ListChecks},
 'calendar':{title:'My Work Calendar',source:'Home',description:'Your week of shifts, deadlines, and other scheduled work.',icon:CalendarDays},
 'signals':{title:'My Dashboard',source:'Home',description:'Individual tiles you pin, schedule, or let Command prioritize.',icon:Layers3},
 'chart-finance':{title:'Financial Performance',source:'Finance',description:'Compare operating receipts, spending, and net cash flow by month.',icon:ChartNoAxesCombined},
 'chart-time':{title:'My Time Trends',source:'Timeclock',description:'Compare your recorded work hours with scheduled hours by week.',icon:Clock3},
 'chart-workload':{title:'Scheduled Workload',source:'Home Calendar',description:'See which upcoming days have the most scheduled items.',icon:ChartColumnIncreasing},
 'chart-hires':{title:'Hiring Over Time',source:'People & HR',description:'See how many employees started each month, using recorded hire dates.',icon:Users},
 'chart-tows':{title:'Property Tow Activity',source:'Account Management',description:'Compare confirmed tows with calls that only have a received date.',icon:Building2},
 'chart-orders':{title:'Work Orders Over Time',source:'Work Orders',description:'A weekly line chart of orders opened and completed. See whether the team is keeping up.',icon:Wrench},
};
const chartIds:HomeSectionId[]=['chart-orders','chart-finance','chart-time','chart-hires','chart-tows','chart-workload'];
const modes=[{id:'auto',name:'Automatic',icon:Sparkles},{id:'pinned',name:'Pinned',icon:Pin},{id:'scheduled',name:'Scheduled',icon:CalendarDays},{id:'hidden',name:'Hidden',icon:EyeOff}] as const;
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],sortDays=[1,2,3,4,5,6,0];
const strip=(p:PulsePreferences,ids:Set<string>):PulsePreferences=>Object.fromEntries(Object.entries(p).filter(([id,s])=>ids.has(id)&&s.mode!=='auto'));
const moduleName=(name:string)=>name==='Accounts'?'Account Hub':name==='SOP Library'?'School House':name;
function moved<T>(order:T[],id:T,to:T){const next=[...order],a=next.indexOf(id),b=next.indexOf(to);if(a<0||b<0||a===b)return next;next.splice(a,1);next.splice(b,0,id);return next;}
function OrderButton({id,dir,disabled,move}:{id:string;dir:'up'|'down';disabled:boolean;move:()=>void}){const I=dir==='up'?ArrowUp:ArrowDown,label='Move '+id+' '+dir;return <button type="button" className="ps-i-button" disabled={disabled} aria-label={label} title={label} onClick={move}><I size={15}/></button>;}

export default function DashboardSettings(props:Props){return props.open?<SettingsDialog {...props}/>:null;}
function SettingsDialog({onClose,signals,preferences,availableSections,layout,onSave,initialTab}:Props){
 const [draft,setDraft]=useState<PulsePreferences>(()=>({...preferences})),[arrangement,setArrangement]=useState<DashboardLayout>(()=>({...layout,order:[...layout.order],hidden:[...layout.hidden],signalOrder:[...layout.signalOrder]}));
 const [tab,setTab]=useState<'layout'|'signals'>(initialTab||'layout'),[mobilePane,setPane]=useState<'order'|'catalog'>('order'),[module,setModule]=useState(''),[search,setSearch]=useState('');
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[feedback,say]=useState(''),[drag,setDrag]=useState<HomeSectionId|null>(null),[target,setTarget]=useState<HomeSectionId|null>(null);
 const ids=useMemo(()=>new Set(signals.map(s=>s.id)),[signals]),mine=strip(draft,ids);
 const allowed=useMemo(()=>new Set(availableSections),[availableSections]),allowedOrder=arrangement.order.filter(k=>allowed.has(k)),onHome=allowedOrder.filter(k=>!arrangement.hidden.includes(k)),hiddenSections=allowedOrder.filter(k=>arrangement.hidden.includes(k)&&!k.startsWith('chart-')),chartOptions=chartIds.filter(id=>allowed.has(id));
 const options=useMemo(()=>[...new Set(signals.map(s=>s.module))].sort((a,b)=>moduleName(a).localeCompare(moduleName(b))),[signals]);
 const orderedSignals=useMemo(()=>{const pos=new Map(arrangement.signalOrder.map((id,i)=>[id,i]));return [...signals].sort((a,b)=>(pos.get(a.id)??1e6)-(pos.get(b.id)??1e6)||rankSignals(a,b));},[signals,arrangement.signalOrder]);
 const narrowed=!!module||!!search.trim(),shown=orderedSignals.filter(s=>(!module||s.module===module)&&[s.title,moduleName(s.module),s.description].join(' ').toLowerCase().includes(search.toLowerCase().trim()));
 const missingDay=Object.values(mine).some(e=>e.mode==='scheduled'&&!e.days?.length);
 const sameSet=(a:string[],b:string[])=>a.length===b.length&&a.every(k=>b.includes(k)),sameOrder=(a:string[],b:string[])=>a.length===b.length&&a.every((k,i)=>k===b[i]);
 const dirty=!sameOrder(arrangement.order,layout.order)||!sameSet(arrangement.hidden,layout.hidden)||!sameOrder(arrangement.signalOrder,layout.signalOrder)||signals.some(s=>{const a=draft[s.id],b=preferences[s.id];return (a?.mode??'auto')!==(b?.mode??'auto')||(a?.days?.join(',')??'')!==(b?.days?.join(',')??'');});
 function updateSection(id:HomeSectionId,show:boolean){if(!allowed.has(id)||saving)return;setError('');
  setArrangement(old=>{const hidden=old.hidden.filter(k=>k!==id);return show?{...old,order:[...old.order.filter(k=>k!==id),id],hidden}:{...old,hidden:[...hidden,id]};});
  say(section[id].title+(show?' added at the bottom.':' removed from your layout.'));
 }
 function moveSection(id:HomeSectionId,to:HomeSectionId){if(id===to||!onHome.includes(id)||!onHome.includes(to)||saving)return;
  setArrangement(old=>({...old,order:moved(old.order,id,to)}));say(section[id].title+' moved to position '+(onHome.indexOf(to)+1)+'.');setError('');
 }
 function startDrag(e:DragEvent<HTMLElement>,id:HomeSectionId){if(saving){e.preventDefault();return;}setDrag(id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);}
 function clearDrag(){setDrag(null);setTarget(null);}
 function moveSignal(id:string,to:string){if(!to||narrowed||saving)return;const order=orderedSignals.map(s=>s.id),a=order.indexOf(id),b=order.indexOf(to);if(a<0||b<0)return;
  // Preserve automatic ranking for the remaining tiles rather than freezing the whole list.
  setArrangement(old=>({...old,signalOrder:moved(order,id,to).slice(0,Math.max(a+1,b+1,old.signalOrder.length))}));say((signals.find(s=>s.id===id)?.title||'Tile')+' moved to position '+(b+1)+'.');
 }
 function resetLayout(){const next=defaultHomeLayout(availableSections);setArrangement(old=>({...next,signalOrder:old.signalOrder,chartViews:old.chartViews}));setError('');say('Default section order and charts restored.');}
 function changeMode(id:string,mode:Mode){setError('');say('');setDraft(prev=>{const next={...prev};if(mode==='auto')delete next[id];else next[id]=mode==='scheduled'?{mode,days:prev[id]?.days??[1,2,3,4,5]}:{mode};return next;});}
 function toggleDay(id:string,day:number){setError('');setDraft(prev=>{const current=prev[id]?.days??[],result=current.includes(day)?current.filter(d=>d!==day):[...current,day].sort((a,b)=>a-b);return {...prev,[id]:{mode:'scheduled',days:result}};});}
 async function save(){if(saving||missingDay||!dirty)return;setSaving(true);setError('');try{await onSave(mine,arrangement);onClose();}catch(e){setError(e instanceof Error?e.message:'Your dashboard could not be saved. Please try again.');setSaving(false);}}
 return <Dialog open onOpenChange={value=>{if(!value&&!saving)onClose();}}><DialogContent className="pulse-settings" showCloseButton={false}>
  <header className="ps-header"><div className="ps-emblem" aria-hidden="true"><SlidersHorizontal size={20}/></div><div><DialogTitle className="ps-title">Customize Dashboard</DialogTitle><DialogDescription className="ps-description">Choose what appears on your Home page and where it goes.</DialogDescription></div><button type="button" className="ps-close" aria-label="Close Dashboard Settings" onClick={onClose} disabled={saving}><X size={18}/></button></header>
  <div className="ps-pages" role="group" aria-label="Dashboard Settings Views">{([{key:'layout',name:'Layout & Charts',icon:LayoutList},{key:'signals',name:'Individual Tiles',icon:Layers3}] as const).map(v=><button key={v.key} type="button" aria-pressed={tab===v.key} onClick={()=>{setTab(v.key);say('');clearDrag();}}><v.icon size={16}/>{v.name}</button>)}</div>
  {tab==='layout'?<>
   <div className="ps-mobile-pages" role="group" aria-label="Layout Views"><button type="button" aria-pressed={mobilePane==='order'} onClick={()=>setPane('order')}>On Home ({onHome.length})</button><button type="button" aria-pressed={mobilePane==='catalog'} onClick={()=>setPane('catalog')}><Plus size={13}/> Add Charts &amp; Sections</button></div>
   <div className="ps-layout-body" data-pane={mobilePane} aria-busy={saving}>
    <section className="ps-layout-order" aria-label="Sections on Your Home">
     <div className="ps-pane-heading"><div><h3>On Your Home</h3><p>Drag a row or use the arrows to move it.</p></div><span className="ps-count">{onHome.length}</span></div>
     <ol className="ps-section-order">{onHome.map((id,i)=>{const entry=section[id],I=entry.icon;return <li key={id} draggable={!saving} onDragStart={e=>startDrag(e,id)} onDragEnd={clearDrag} data-drag={drag===id} data-drop={target===id&&drag!==id} onDragOver={e=>{if(drag&&drag!==id){e.preventDefault();e.dataTransfer.dropEffect='move';setTarget(id);}}} onDrop={e=>{if(drag){e.preventDefault();moveSection(drag,id);clearDrag();}}}>
      <span className="ps-grip" title={'Drag '+entry.title}><GripVertical size={15}/></span>
      <span className="ps-sec-icon" data-chart={id.startsWith('chart-')} aria-hidden="true"><I size={16}/></span><span className="ps-sec-name"><b>{entry.title}</b><small>{id.startsWith('chart-')?entry.source+' Chart':'Section'}</small></span>
      <div className="ps-order-actions"><OrderButton id={entry.title} dir="up" disabled={saving||i===0} move={()=>moveSection(id,onHome[i-1])}/><OrderButton id={entry.title} dir="down" disabled={saving||i===onHome.length-1} move={()=>moveSection(id,onHome[i+1])}/><button type="button" className="ps-i-button remove" disabled={saving} aria-label={'Remove '+entry.title+' from Home'} title={'Remove '+entry.title+' from Home'} onClick={()=>updateSection(id,false)}><Minus size={15}/></button></div></li>;})}</ol>
     {!onHome.length&&<p className="ps-manage-empty">Your layout is empty. Add a chart or section to start again.</p>}
     <button type="button" className="ps-text-btn" disabled={saving} onClick={resetLayout}><RotateCcw size={13}/>Restore Default Layout</button>
    </section>
    <section className="ps-layout-library" aria-label="Chart and Section Library">
     <div className="ps-pane-heading"><div><h3>Chart Library</h3><p>Choose a chart from your available modules.</p></div></div>
     <div className="ps-chart-list">{chartOptions.map(id=>{const entry=section[id],I=entry.icon,selected=onHome.includes(id);return <div className="ps-choice" key={id}><div className="ps-catalog-top"><span className="ps-kicker"><I size={13}/>{entry.source}</span><button type="button" className="ps-add" disabled={selected||saving} data-added={selected} aria-label={selected?entry.title+' is on Home':'Add '+entry.title+' to Home'} onClick={()=>updateSection(id,true)}>{selected?<Check size={12}/>:<Plus size={12}/>} {selected?'Added':'Add'}</button></div><b>{entry.title}</b><p>{entry.description}</p></div>;})}</div>
     {!chartOptions.length&&<p className="ps-manage-empty">No charts are available with your current module access.</p>}
     {hiddenSections.length>0&&<div className="ps-other"><h3>Available Sections</h3>{hiddenSections.map(id=><div key={id}><span>{section[id].title}</span><button type="button" className="ps-add" aria-label={'Add '+section[id].title+' to Home'} disabled={saving} onClick={()=>updateSection(id,true)}><Plus size={12}/> Add</button></div>)}</div>}
    </section>
   </div>
  </>:<>
   <div className="ps-toolbar"><label className="ps-search"><Search size={16} aria-hidden="true"/><ResponsiveSearchInput value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a tile…" aria-label="Find a Dashboard Item"/></label><label className="ps-module"><select aria-label="Filter by Module" value={module} onChange={e=>setModule(e.target.value)}><option value="">All Modules</option>{options.map(m=><option key={m} value={m}>{moduleName(m)}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label></div>
   <div className="ps-scroll" aria-label="Individual Tile Settings" aria-busy={saving}>
    <div className="ps-list-head"><span>{narrowed?'Matching Tiles':'Display and Order'} · {shown.length}</span>{arrangement.signalOrder.length>0&&<button type="button" className="ps-reset-sort" disabled={saving} onClick={()=>{setArrangement(old=>({...old,signalOrder:[]}));say('Automatic tile order restored.');}}>Reset Tile Order</button>}</div>
    <p className="ps-signal-hint">{narrowed?'Clear the filters to rearrange tiles.':'Move tiles to your preferred order, or leave them ranked by urgency. Pin a tile to keep it visible.'}</p>
    {shown.map((signal,i)=>{const pref=draft[signal.id],mode=pref?.mode??'auto',I=modes.find(m=>m.id===mode)?.icon??Sparkles;return <div key={signal.id} className={'ps-item ps-mode-'+mode}><div className="ps-item-main"><div className="ps-names"><span className="ps-source">{moduleName(signal.module)}</span><b>{signal.title}</b>{signal.description&&<span className="ps-explain">{signal.description}</span>}</div>
     <div className="ps-tile-actions">{!narrowed&&<div className="ps-order-actions"><OrderButton id={signal.title} dir="up" move={()=>moveSignal(signal.id,orderedSignals[i-1]?.id)} disabled={saving||i===0}/><OrderButton id={signal.title} dir="down" move={()=>moveSignal(signal.id,orderedSignals[i+1]?.id)} disabled={saving||i===shown.length-1}/></div>}
     <label className="ps-mode"><I size={15} aria-hidden="true"/><select aria-label={'Display Mode for '+signal.title} value={mode} disabled={saving} onChange={e=>changeMode(signal.id,e.target.value as Mode)}>{modes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><ChevronDown size={13} aria-hidden="true"/></label></div></div>
     {mode==='scheduled'&&<fieldset className="ps-days" disabled={saving}><legend>Show Every Week On</legend>{sortDays.map(day=><button key={day} type="button" aria-label={days[day]+' for '+signal.title} aria-pressed={!!pref.days?.includes(day)} onClick={()=>toggleDay(signal.id,day)}>{days[day].slice(0,3)}</button>)}{!pref.days?.length&&<span className="ps-day-error">Choose at least one day.</span>}</fieldset>}</div>;})}
    {!shown.length&&<div className="ps-empty"><Search size={21}/><b>{signals.length?'No Matching Tiles':'No Dashboard Tiles Available'}</b>{signals.length>0&&<button type="button" onClick={()=>{setSearch('');setModule('');}}>Clear Filters</button>}</div>}
   </div>
  </>}
  <footer className="ps-footer"><div><strong>{dirty?'Unsaved Changes':'Only Your Home Changes'}</strong><p role="status" aria-live="polite">{feedback||(tab==='layout'?'Critical alerts remain visible in every layout.':'Schedules follow Austin time. Critical alerts stay visible.')}</p></div>
   {error&&<p role="alert" className="ps-error">{error}</p>}{missingDay&&tab==='layout'&&<p role="alert" className="ps-error">Select a weekday for your scheduled tiles in Individual Tiles.</p>}
   <div className="ps-footer-actions"><button type="button" className="ps-cancel" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="ps-save" disabled={saving||missingDay||!dirty} onClick={()=>void save()}><Check size={16}/>{saving?'Saving…':'Save Changes'}</button></div></footer>
 </DialogContent></Dialog>;
}
