'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowUpRight,CalendarClock,CalendarDays,CheckCheck,ChevronRight,ClipboardCheck,FileBadge,FileWarning,FolderOpen,Gavel,Landmark,LayoutList,LockKeyhole,RefreshCw,Scale,Users,Wallet} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {canAccess} from '@/lib/finance/access';
import type {Viewer} from '@/lib/finance/model';
import {requestJson} from '@/lib/shared/client';
import {auditDay} from '@/lib/shared/audit-format';
import {dayPlus,deskNames,overviewAccess,type Desk,type NextItem,type Overview} from '@/lib/ccr/overview';
import CourtOutcomeDirectory from './CourtOutcomeDirectory';
import './overview.css';

const deskIcons:Record<Desk,LucideIcon>={legal:Scale,hearings:Gavel,damage:FileWarning,tdlr:Landmark,recovery:Wallet,calendar:CalendarClock,licenses:FileBadge,evidence:ClipboardCheck};
const deskCaptions:Record<Desk,string>={legal:'Open Legal Notices',hearings:'Open Court Matters',damage:'All Property, Asset and Intake Claims',tdlr:'Open Agency Responses',recovery:'Open Recovery Files',calendar:'Open Obligations',licenses:'Open Credential and Testing Records',evidence:'Open Inspection and Evidence Records'};
const dateText=(day:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...options}).format(new Date(day+'T12:00:00Z'));
const cash=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(cents/100);
const timeText=(t?:string)=>{if(!t||!/^\d\d:\d\d$/.test(t))return '';const [h,m]=t.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?'am':'pm')+' CT';};
type Window='priority'|'overdue'|'week'|'all'|'day';
const tabText:Record<Exclude<Window,'day'>,string>={priority:'Priority',overdue:'Past Due',week:'Next 7 Days',all:'All Actions'};
function matches(i:NextItem,filter:Window,now:string,day:string){
 if(filter==='day')return i.due===day;
 if(filter==='overdue')return !!i.pastDue||!!i.due&&i.due<now;
 if(filter==='week')return !!i.due&&i.due>=now&&i.due<dayPlus(now,7);
 if(filter==='priority')return i.kind==='review'||!!i.due&&i.due<=now;
 return true;
}
const ready=(desk:Overview['desks'][number])=>desk.open!==null;
const damageSummary=(data:Overview)=>data.totalClaims===null?'Damage claim data unavailable':`${data.desks.find(d=>d.desk==='damage')?.open??'—'} confirmed open · ${data.unverifiedClaims??'—'} outcome unverified · ${data.completedClaims??'—'} completed`;
export type OverviewProps={viewer:Viewer;onOpen:(tab:string,id?:string)=>void};
export default function CcrOverview({viewer,onOpen}:OverviewProps){
 const identity=JSON.stringify([viewer.person,viewer.owner,viewer.onboardingOnly,viewer.access]),[gen,reload]=useState(0),[state,setState]=useState<{key:string;data?:Overview;err?:string}>({key:''}),[filter,setFilter]=useState<Window>('priority'),[selectedDay,setDay]=useState(''),[limit,setLimit]=useState(6);
 const panel=useRef<HTMLElement>(null),authorized=overviewAccess(viewer),key=identity+'#'+gen;
 useEffect(()=>{let active=true;if(authorized)requestJson<Overview>('/api/ccr/overview').then(data=>{if(active)setState({key,data});}).catch(e=>{if(active)setState({key,err:(e as Error).message});});return()=>{active=false};},[key,authorized]);
 const data=state.key===key?state.data:undefined,err=state.key===key?state.err:'',waiting=!data&&!err,days=data?Array.from({length:7},(_,i)=>dayPlus(data.today,i)):[],desks=data?.desks||[],items=data?.items||[],anyKnown=desks.some(ready),partial=desks.some(s=>!ready(s));
 const count=(d:Desk)=>desks.find(s=>s.desk===d)?.open,openDesk=(d:Desk)=>onOpen(d);
 function choose(w:Window,d='',reveal=false){setFilter(w);setDay(d);setLimit(6);if(reveal){panel.current?.scrollIntoView({block:'nearest'});panel.current?.focus({preventScroll:true});}}
 const filtered=data?items.filter(i=>matches(i,filter,data.today,selectedDay)):[];
 const metric=(icon:LucideIcon,label:string,value:number|string|null,sub:string,action:()=>void)=>{const Icon=icon;return <button type="button" className="cco-metric" onClick={action}><span><Icon size={15}/>{label}</span><strong>{value??'—'}</strong><small>{value===null?'Source Unavailable':sub}</small><ArrowUpRight className="cco-advance" size={15}/></button>;};
 if(!authorized)return null;
 return <section className="cco" aria-label="Compliance Command Center"><header className="cco-hero"><div className="cco-title"><div><span className="cco-kicker"><Scale size={14}/> Case Operations</span><h1>Command Center</h1></div><div className="cco-private"><LockKeyhole size={13}/>Confidential</div>{['hearings','tdlr','damage'].some(tab=>canAccess(viewer,'Compliance, Claims & Recovery',tab))&&<a href="/ccr/source-desk" className="cco-private">Source Filing Desk <ArrowUpRight size={14}/></a>}</div>
 {data&&desks.length>0&&<div className="cco-metrics">
 {anyKnown&&metric(CalendarClock,'Past-Due Actions',(partial?'≥ ':'')+items.filter(i=>i.pastDue||i.due&&i.due<data.today).length,'Across Your Case Desks',()=>choose('overdue','',true))}
 {count('hearings')!==undefined&&metric(Gavel,'Court Appearances',data.appearances,'Scheduled · Next 7 Days',()=>onOpen('hearings'))}
 {count('damage')!==undefined&&metric(FileWarning,'Damage Claims',data.totalClaims,damageSummary(data),()=>onOpen('damage'))}
 {count('recovery')!==undefined&&metric(Wallet,'Open Recoveries',count('recovery')??null,data.recoveryKnown?cash(data.recoveryAmount||0)+' Tracked Incident Value':'Recovery Files in Progress',()=>onOpen('recovery'))}
 {count('hearings')===undefined&&count('tdlr')!==undefined&&metric(Landmark,'TDLR Complaints',count('tdlr')??null,'Open Agency Responses',()=>onOpen('tdlr'))}
 {count('damage')===undefined&&count('calendar')!==undefined&&metric(CalendarDays,'Open Obligations',count('calendar')??null,'Compliance Calendar',()=>onOpen('calendar'))}
 {count('recovery')===undefined&&count('licenses')!==undefined&&metric(FileBadge,'Licenses & Testing',count('licenses')??null,'Open Credential Records',()=>onOpen('licenses'))}
 </div>}</header>
 {data&&count('hearings')!==undefined&&<CourtOutcomeDirectory compact counts={data.courtOutcomes} onSelect={s=>onOpen('hearings',s==='all'?undefined:'outcome:'+s)}/>}
 {waiting?<div className="cco-loading" role="status"><RefreshCw size={17}/>Loading your case desks…</div>:err?<div className="cco-error" role="alert"><AlertCircle size={20}/><div><b>Couldn’t Load the Command Center</b><p>{err}</p></div><button onClick={()=>reload(n=>n+1)}>Retry</button></div>:data&&<>
 {partial&&<div role="status" className="cco-error"><AlertCircle size={17}/><span>Unavailable: {desks.filter(d=>!ready(d)).map(d=>deskNames[d.desk]).join(', ')}. Counts and dates cover the remaining desks.</span><button onClick={()=>reload(n=>n+1)}>Retry</button></div>}
 {!desks.length?<div className="cco-restricted"><LockKeyhole size={24}/><h2>No Case Desks Assigned</h2><p>Your Command Center shows casework from the sections you can access.</p>{canAccess(viewer,'Compliance, Claims & Recovery','people')&&<button type="button" onClick={()=>onOpen('people')}><Users size={15}/>Open Personnel Review</button>}</div>:<>
 <div className="cco-heading"><div><span className="cco-eyebrow">Operations Brief</span><h2>Work Requiring Attention</h2></div><span className="cco-asof"><CalendarDays size={14}/>{dateText(data.today,{month:'short',day:'numeric',year:'numeric'})}<button type="button" onClick={()=>reload(n=>n+1)} aria-label="Refresh Command Center" title="Refresh Command Center"><RefreshCw size={15}/></button></span></div>
 <div className="cco-grid"><section className="cco-panel" aria-label="Action Queue" tabIndex={-1} ref={panel}><div className="cco-panelhead"><span className="cco-icon"><LayoutList size={19}/></span><div><h3>Action Queue</h3><p>Deadlines, appearances, and reviews</p></div></div>
 <div className="cco-windows" aria-label="Filter Action Queue">{(Object.keys(tabText) as Exclude<Window,'day'>[]).map(w=><button type="button" key={w} aria-pressed={filter===w} onClick={()=>choose(w)}>{tabText[w]}</button>)}{filter==='day'&&<button type="button" aria-pressed="true" onClick={()=>choose('week')} title="Show All Seven Days">{dateText(selectedDay,{month:'short',day:'numeric'})} ×</button>}</div>
 {filtered.length?<div>{filtered.slice(0,limit).map(i=>{const I=deskIcons[i.desk],past=i.pastDue||i.due&&i.due<data.today;return <button type="button" className="cco-queue-row" key={i.id} onClick={()=>onOpen(i.desk,i.sourceId)}><span className="cco-record-icon"><I size={17}/></span><span className="cco-row-copy"><b>{i.title}</b><span>{i.action} · {deskNames[i.desk]}</span></span><span className={'cco-date '+(past?'late':i.due===data.today?'today':'')}>{past&&<span>Past Due</span>}{i.due?<time dateTime={i.due}>{i.due===data.today?'Today':auditDay(i.due)}{i.time&&' · '+timeText(i.time)}</time>:'Review Needed'}</span><ChevronRight size={14}/></button>})}{filtered.length>limit&&<button type="button" className="cco-more" onClick={()=>setLimit(n=>n+12)}>Show More ({filtered.length-limit})</button>}</div>:<div className="cco-empty"><span>{!anyKnown?<AlertCircle size={23}/>:<CheckCheck size={23}/>}</span><div><b>{!anyKnown?'Case Data Unavailable':filter==='day'?'No Actions on This Date':filter==='priority'?'No Immediate Actions':filter==='overdue'?'No Past-Due Actions':filter==='week'?'No Actions in the Next 7 Days':'No Open Actions Recorded'}</b><p>{!anyKnown?'Refresh to check your case desks.':partial?'This view covers the desks that could be loaded.':filter==='priority'?'No open review or recorded deadline is due today or overdue.':'There are no matching recorded deadlines or reviews.'}</p></div></div>}
 <div className="cco-week"><span className="cco-eyebrow">Next Seven Days</span><div className="cco-days">{days.map(d=>{const n=items.filter(i=>i.due===d).length;return <button type="button" key={d} disabled={!anyKnown} aria-pressed={filter==='day'&&d===selectedDay} title={'Show Actions on '+auditDay(d)} aria-label={dateText(d,{weekday:'long',month:'long',day:'numeric'})+' · '+(anyKnown?n+' scheduled actions':'data unavailable')} onClick={()=>choose('day',d)}><small>{dateText(d,{weekday:'short'})}</small><b>{Number(d.slice(-2))}</b><i className={n?'has':''} aria-hidden/></button>})}</div></div>
 </section><section className="cco-panel" aria-label="Casework by Section"><div className="cco-panelhead"><span className="cco-icon"><FolderOpen size={19}/></span><div><h3>Casework by Section</h3><p>Select a desk to see its records</p></div></div><div className="cco-desks">{desks.map(({desk,open})=>{const I=deskIcons[desk],total=desk==='damage'?data.totalClaims:open,unit=desk==='damage'?'total':'open',max=Math.max(1,...desks.map(r=>(r.desk==='damage'?data.totalClaims:r.open)||0));return <button type="button" key={desk} onClick={()=>openDesk(desk)} title={deskCaptions[desk]}><I size={16}/><span className="cco-desk-copy"><strong>{deskNames[desk]}</strong>{desk==='damage'&&total!==null&&<small>{damageSummary(data)}</small>}<span className="cco-track"><i style={{width:((total??0)*100/max)+'%'}}/></span></span><b aria-label={total===null?'Source Unavailable':total+' '+(desk==='damage'?'total claims':'open')}>{total??'—'}<small>{unit}</small></b><ChevronRight size={13}/></button>})}</div></section></div>
 </>}</>}</section>;
}
