'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowUpRight,CalendarDays,Check,CheckCircle2,ChevronDown,ChevronRight,Circle,Columns3,CornerDownRight,Flag,List,ListChecks,MessageSquare,Plus,Search,SlidersHorizontal,SquareStack,Wrench,X} from 'lucide-react';
import ResponsiveSearchInput from '@/components/shared/ResponsiveSearchInput';
import {auditDay} from '@/lib/shared/audit-format';
import {businessToday} from '@/lib/year-history/model';
import type {Row} from '@/lib/accounts/model';
import {actionDate,checklistProgress,isFinished,isWaiting} from '@/lib/accounts/work';
import {workGroups,parsePrefs,defaultPrefs,cleanFilters,filteredQueue,groupQueue,canQuickEdit,nameOf,readableStatus,typeLabel,dueLabels,taskKind,label,queueMatchesDue,type Filters,type Group,type WorkView} from '@/lib/accounts/queue-workspace';
import QueueItemPanel from './QueueItemPanel';
import './queue-workspace.css';
type Props={rows:Row[];all:Row[];staff:{id:string;name:string;department:string}[];viewerId:string;editable:(r:Row)=>boolean;operationsEditor:boolean;canOpenAssets:boolean;onOpen:(r:Row)=>void;onAccount?:(id:string)=>void;onNew?:()=>void;onRequest?:()=>void;onSave:(r:Row)=>Promise<unknown>};
const views=[['List',List],['Board',Columns3],['Agenda',CalendarDays]] as const;
const calcDay=(s:string)=>new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
const dateLabel=(r:Row,day:string)=>{const d=actionDate(r);return d===day?'Today':auditDay(d)||'No Date';};
const initials=(s:string)=>s.split(/\s+/).slice(0,2).map(w=>w[0]).join('');
export default function AccountWorkQueue({rows,all,staff,viewerId,editable,operationsEditor,canOpenAssets,onOpen,onAccount,onNew,onRequest,onSave}:Props){
 const today=businessToday(),[prefs,setPrefs]=useState(defaultPrefs),[loaded,loadPrefs]=useState(false),[f,set]=useState<Filters>(cleanFilters),[filters,setFilters]=useState(false),[folded,fold]=useState<string[]>([]),[limits,limit]=useState<Record<string,number>>({}),[panel,show]=useState<{r:Row;start:string}>(),[drag,setDrag]=useState(''),[over,setOver]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(''),saveLock=useRef(false);
 const key='command:account-management:work-queue:v2:'+viewerId;
 useEffect(()=>{let p=defaultPrefs;try{p=parsePrefs(localStorage.getItem(key))}catch{}setPrefs(p);loadPrefs(true);},[key]);
 function preferences(p:typeof prefs){setPrefs(p);try{if(loaded)localStorage.setItem(key,JSON.stringify(p));}catch{}fold([]);limit({});}
 function change<K extends keyof Filters>(k:K,v:Filters[K]){set(o=>({...o,[k]:v}));limit({});fold([]);}
 const names=useMemo(()=>new Map([...all,...staff].map(r=>[r.id,r.name])),[all,staff]),staffName=(r:Row)=>names.get(String(r.assignee))||'Unassigned',property=(r:Row)=>names.get(String(r.accountId))||'No Linked Property';
 const visible=useMemo(()=>filteredQueue(rows,f,viewerId,today,names),[rows,f,viewerId,today,names]),scopeRows=useMemo(()=>filteredQueue(rows,{...f,status:'Active Work',due:''},viewerId,today,names),[rows,f,viewerId,today,names]);
 const closedRows=useMemo(()=>filteredQueue(rows,{...f,status:'Completed',due:'',allYears:true},viewerId,today,names),[rows,f,viewerId,today,names]);
 const comments=useMemo(()=>{const m=new Map<string,number>();for(const c of all)if(c.kind==='comment'&&!c.deletedAt)m.set(String(c.parentId),(m.get(String(c.parentId))||0)+1);return m;},[all]);
 const group=prefs.view==='Board'?prefs.boardGroup:prefs.view==='Agenda'?'Day':prefs.listGroup,board=prefs.view==='Board',groups=groupQueue(visible,group,today,names,board),defaultLimit=board?7:22;
 const properties=[...new Set(rows.map(r=>String(r.accountId||'')))].filter(Boolean).sort((a,b)=>String(names.get(a)||'').localeCompare(String(names.get(b)||'')));
 const persons=[...new Map([...staff.map(s=>[s.id,s.name] as const),...rows.filter(r=>r.assignee&&names.has(String(r.assignee))).map(r=>[String(r.assignee),String(names.get(String(r.assignee)))] as const)]).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
 const types=[...new Set(rows.map(r=>String(r.type||'')))].filter(Boolean).sort(),statuses=[...new Set(rows.map(readableStatus).concat(['Open','In Progress','Waiting','Completed','Cancelled']))].sort();
 const extra=Number(!!f.person)+Number(!!f.property)+Number(!!f.type)+Number(!!f.origin)+Number(!!f.priority)+Number(!!f.due)+Number(f.status!=='Active Work')+Number(f.allYears);
 const haveFilters=!!(extra||f.search||f.scope!=='All'),collapsed=groups.length>0&&groups.every(g=>folded.includes(g.key));
 function clear(){set(cleanFilters);fold([]);limit({});}
 function detail(r:Row,start=''){setError('');show({r,start});}
 function flip(k:string){fold(b=>b.includes(k)?b.filter(v=>v!==k):[...b,k]);}
 function duePick(v:string){set(o=>({...o,due:o.due===v&&o.status==='Active Work'?'':v,status:'Active Work'}));fold([]);limit({});}
 function applyView(v:WorkView){preferences({...prefs,view:v});}
 const source=(r:Row)=>!!r.derived||!!r.assetRequest,can=(r:Row)=>canQuickEdit(r,editable,operationsEditor);
 function target(r:Row,k:string){if(!can(r)||isFinished(r)||group!=='Status'||!board||readableStatus(r)===k)return '';const map:Record<string,string>={'Open':'Open','In Progress':'In progress','Waiting':'Waiting','Completed':'Completed','Cancelled':'Cancelled',...(r.kind==='workOrder'?{'Requested':'Requested','Scheduled':'Scheduled','Ready for Review':'Ready for review'}:{})};return r.kind==='workOrder'&&k==='Open'?'':map[k]||'';}
 async function drop(k:string){const r=visible.find(x=>x.id===drag);setDrag('');setOver('');if(!r||saveLock.current)return;const status=target(r,k);if(!status)return;
  // These statuses can require a wait contact, a scheduled date, a checklist or an outcome. Keep the source row until the transition is actually saved.
  if(['Waiting','Completed','Cancelled','Scheduled'].includes(status)||r.kind==='workOrder'&&!r.assignee){detail(r,status);return;}
  saveLock.current=true;setSaving(r.id);setError('');try{await onSave({...r,status});}catch(e){setError(e instanceof Error?e.message:'Status change was not saved.');}finally{saveLock.current=false;setSaving('');}
 }
 function quick(r:Row){const done=isFinished(r),cl=can(r)&&!done&&!saving;return cl?<button type="button" className="qwb-complete" aria-label={'Complete '+nameOf(r)} title={'Complete '+nameOf(r)} onClick={()=>detail(r,'Completed')}><Circle size={17}/><Check size={11}/></button>:<span className="qwb-marker" title={source(r)?'Updated from the source record':done?readableStatus(r):'View Only'}>{source(r)?<CornerDownRight size={15}/>:done?<CheckCircle2 size={16}/>:<Circle size={14}/>}</span>;}
 function row(r:Row){
 const d=actionDate(r),late=!!d&&d<today&&!isFinished(r),count=comments.get(r.id)||0,progress=checklistProgress(r),nm=staffName(r),pc=property(r);
 return <article className={'qwb-item'+(board?' qwb-card':'')+(saving===r.id?' qwb-saving':'')} key={r.id} draggable={board&&group==='Status'&&can(r)&&!isFinished(r)&&!saving}
 onDragStart={e=>{if(!can(r)||!board||group!=='Status'){e.preventDefault();return;}e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',r.id);setDrag(r.id);}} onDragEnd={()=>{setDrag('');setOver('')}}>
 <div className="qwb-item-main">{quick(r)}<div><button className="qwb-title" type="button" onClick={()=>detail(r)}>{nameOf(r)}</button>{r.accountId&&(onAccount?<button type="button" className="qwb-property" onClick={()=>onAccount(String(r.accountId))}>{pc}</button>:<small>{pc}</small>)}{source(r)&&<small className="qwb-source">{taskKind(r)}</small>}</div></div>
 <span className="qwb-item-state"><span>{readableStatus(r)}</span>{r.priority&&r.priority!=='Normal'&&<small className={'qwb-priority '+(r.priority==='Urgent'?'urgent':'')}><Flag size={11}/>{label(r.priority)}</small>}</span>
 <button className={'qwb-date'+(late?' late':'')} type="button" title={(isWaiting(r)?'Reminder':'Due Date')+': '+(auditDay(d)||'Unscheduled')} onClick={()=>detail(r)}><CalendarDays size={14}/>{dateLabel(r,today)}</button>
 <span className="qwb-owner"><i aria-hidden="true">{r.assignee?initials(nm):'–'}</i>{nm}</span>
 <button type="button" className="qwb-thread" aria-label={'Details and Comments for '+nameOf(r)} title="Details & Comments" onClick={()=>detail(r)}>{progress.total?<><ListChecks size={14}/>{progress.done}/{progress.total}</>:<><MessageSquare size={14}/>{count||''}</>}</button>
 </article>;
 }
 const signal=(title:string,num:number,active:boolean,handler:()=>void)=><button type="button" aria-pressed={active} className={title==='Overdue'?'qwb-urgent':''} onClick={handler}><b>{num}</b>{title}</button>;
 return <section className="qwb" aria-label="Work Queue Workspace">
  <header className="qwb-top"><div><span className="qwb-kicker"><ListChecks size={15}/>ACCOUNT MANAGEMENT</span><h1>Work Queue</h1></div><div className="qwb-actions">{onRequest&&<button type="button" onClick={onRequest}><Wrench size={15}/>Request Operations</button>}{onNew&&<button type="button" onClick={onNew} className="qwb-primary"><Plus size={16}/>New Task</button>}</div></header>
  <div className="qwb-subnav"><nav aria-label="Work Queue Views">{views.map(([v,I])=><button type="button" key={v} aria-pressed={prefs.view===v} onClick={()=>applyView(v)}><I size={16}/>{v}</button>)}</nav><div className="qwb-signals">{signal('Overdue',scopeRows.filter(r=>queueMatchesDue(r,today,'Overdue')).length,f.status==='Active Work'&&f.due==='Overdue',()=>duePick('Overdue'))}{signal('Due Today',scopeRows.filter(r=>queueMatchesDue(r,today,'Due Today')).length,f.status==='Active Work'&&f.due==='Due Today',()=>duePick('Due Today'))}{signal('Completed',closedRows.length,f.status==='Completed',()=>{set(o=>({...o,due:'',status:o.status==='Completed'?'Active Work':'Completed'}));fold([]);limit({});})}</div></div>
  <div className="qwb-toolbar"><div className="qwb-scopes" aria-label="Task Ownership">{(['All','Mine','Requested'] as const).map((s,i)=><button type="button" key={s} aria-pressed={s===f.scope} onClick={()=>change('scope',s)}>{['All Tasks','My Tasks','Requested by Me'][i]}</button>)}</div>
   <div className="qwb-controls"><label className="qwb-search" data-inline-control=""><Search size={15}/><ResponsiveSearchInput type="search" placeholder="Search Tasks" compactPlaceholder="Search" aria-label="Search Tasks or Properties" value={f.search} onChange={e=>change('search',e.target.value)}/></label><button type="button" aria-expanded={filters} aria-controls="account-task-filters" onClick={()=>setFilters(!filters)}><SlidersHorizontal size={15}/>Filters{extra>0&&<b>{extra}</b>}</button></div></div>
  {filters&&<div className="qwb-filtergrid" id="account-task-filters">
  <label>Property<select value={f.property} onChange={e=>change('property',e.target.value)}><option value="">All Properties</option><option value="__none">No Linked Property</option>{properties.map(id=><option key={id} value={id}>{names.get(id)||'Linked Property'}</option>)}</select></label>
  <label>Assignee<select value={f.person} onChange={e=>change('person',e.target.value)}><option value="">Anyone</option><option value="__none">Unassigned</option>{persons.map(([id,n])=><option value={id} key={id}>{n}</option>)}</select></label>
  <label>Status<select value={f.status} onChange={e=>change('status',e.target.value)}>{['Active Work','All Statuses',...statuses].map(k=><option key={k}>{k}</option>)}</select></label>
  <label>Action Date<select value={f.due} onChange={e=>change('due',e.target.value)}><option value="">Any Date</option>{dueLabels.map(d=><option key={d}>{d}</option>)}</select></label>
  <label>Work Type<select value={f.type} onChange={e=>change('type',e.target.value)}><option value="">All Types</option>{types.map(t=><option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
  <label>Record Type<select value={f.origin} onChange={e=>change('origin',e.target.value)}><option value="">All Records</option>{['Asset Request','Property Reminder','Task','Work Order'].map(p=><option key={p}>{p}</option>)}</select></label>
  <label>Priority<select value={f.priority} onChange={e=>change('priority',e.target.value)}><option value="">Any Priority</option>{['High','Normal','Urgent'].map(p=><option key={p}>{p}</option>)}</select></label>
  {f.status==='All Statuses'&&<label className="qwb-includeyears"><input type="checkbox" checked={f.allYears} onChange={e=>change('allYears',e.target.checked)}/>Include Prior-Year Closures</label>}
  </div>}
  <div className="qwb-grouptools"><div><strong>{visible.length}</strong> {visible.length===1?'Item':'Items'}{f.status!=='All Statuses'&&<span> · {f.status}</span>}{haveFilters&&<button type="button" onClick={clear}><X size={12}/>Reset Filters</button>}</div><div>{prefs.view!=='Agenda'&&<label><SquareStack size={13}/><span>Group by</span> <select aria-label="Group Tasks By" value={group} onChange={e=>preferences({...prefs,[board?'boardGroup':'listGroup']:e.target.value as Group})}>{workGroups.map(s=><option key={s}>{s}</option>)}</select></label>}{groups.length>0&&<button onClick={()=>fold(collapsed?[]:groups.map(g=>g.key))} type="button">{collapsed?'Expand All':'Collapse All'}</button>}</div></div>
  {board&&group==='Status'&&visible.some(r=>!isFinished(r)&&can(r))&&<p className="qwb-board-hint">Drag a card between status columns, or open the task to change its status.</p>}
  {error&&<p role="alert" className="qwb-error">{error}</p>}
  {!visible.length?<div className="qwb-empty"><ListChecks size={24}/><strong>{haveFilters?'No Matching Work':'No Active Work'}</strong>{haveFilters?<button type="button" onClick={clear}>Reset Filters</button>:<p>New tasks and property reminders will appear here.</p>}</div>:
  <div className={board?'qwb-board':'qwb-sections'}>{groups.map(g=>{const isClosed=folded.includes(g.key),cap=limits[g.key]||defaultLimit,src=visible.find(r=>r.id===drag),allowed=src&&target(src,g.key),heading=group==='Day'&&g.key!=='Undated'?calcDay(g.key):g.title;
   return <section key={g.key} className={'qwb-group'+(over===g.key?' qwb-drop':'')+(isClosed?' qwb-folded':'')} onDragOver={e=>{if(allowed){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(g.key)}}} onDrop={e=>{if(allowed){e.preventDefault();void drop(g.key)}}} onDragLeave={e=>{if(over===g.key&&(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget)))setOver('')}}>
   <button type="button" className="qwb-grouphead" aria-expanded={!isClosed} onClick={()=>flip(g.key)}>{isClosed?<ChevronRight size={15}/>:<ChevronDown size={15}/>}<b>{heading}</b><span>{g.rows.length}</span></button>{!isClosed&&<>{!board&&<div className="qwb-columns" aria-hidden="true"><b>Task / Property</b><b>Status</b><b>Action Date</b><b>Assignee</b><b/></div>}{g.rows.slice(0,cap).map(row)}{!g.rows.length&&<p className="qwb-noitems">No items in this section.</p>}{g.rows.length>cap&&<button type="button" className="qwb-more" onClick={()=>limit(prev=>({...prev,[g.key]:cap+defaultLimit}))}>Show More <span>({g.rows.length-cap})</span></button>}</>}</section>;
  })}</div>}
  {panel&&<QueueItemPanel r={panel.r} start={panel.start} all={all} names={names} staff={staff} canOpenAssets={canOpenAssets} mayEdit={can(panel.r)} onClose={()=>show(undefined)} onOpen={onOpen} onAccount={onAccount} onSave={onSave}/>}
 </section>
}
