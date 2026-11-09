'use client';
import {useState} from 'react';
import {Link2,ChartColumn,Archive,CalendarClock,ChevronRight,ClipboardCheck,FileBadge,FileWarning,HandCoins,LayoutDashboard,LockKeyhole,Scale,ShieldCheck,UserRoundCheck} from 'lucide-react';
import DocumentDestination from './DocumentDestination';
import {canAccess} from '@/lib/finance/access';
import type {destinations as documentRoutes} from './DocumentDestination';
import type {Viewer} from '@/lib/finance/model';
import {ccrModule,ccrSections,directoryTab,directoryPath,type CcrTab} from '@/lib/ccr/navigation';
import ModuleRail from '@/components/shared/ModuleRail';
import CcrReports from './CcrReports';
import {sectionOutcome,type OutcomeFilter} from '@/lib/ccr/court-outcomes';
import CourtDocket from './CourtDocket';
import YearArchive from '@/components/reports/YearArchive';
import CcrOverview from './CcrOverview';
import DamageClaimsWorkspace from './DamageClaimsWorkspace';
import RegisterWorkspace from './RegisterWorkspace';
import PersonnelReview from './PersonnelReview';
import SourceFileShelf from '@/components/shared/SourceFileShelf';
import './workspace.css';
const icons={command:LayoutDashboard,reports:ChartColumn,calendar:CalendarClock,people:UserRoundCheck,licenses:FileBadge,hearings:Scale,damage:FileWarning,tdlr:ClipboardCheck,recovery:HandCoins,legal:Scale,'year-history':Archive} as const;
function DirectoryLink({tab,outcome}:{tab:'hearings'|'damage';outcome:OutcomeFilter}){
 const [state,setState]=useState<'ready'|'copied'|'manual'>('ready');
 const href=directoryPath(tab,outcome),label=tab==='hearings'?'Court Docket':'Damage Claims';
 async function copy(){
  try{await navigator.clipboard.writeText(new URL(href,window.location.origin).href);setState('copied');}
  catch{setState('manual');}
 }
 return <><button type="button" className="ccru-launch" onClick={()=>void copy()} title={'Copy the '+label+' page link'}><Link2 size={15} aria-hidden="true"/><span aria-live="polite">{state==='copied'?'Page Link Copied':'Copy Page Link'}</span></button>{state==='manual'&&<a href={href} className="ccru-launch" title="Use the link menu to copy the address">{label} Permalink</a>}</>;
}
export default function CcrWorkspace({viewer,requestedTab,record,onNavigate}:{viewer:Viewer;requestedTab?:string;record?:string;onNavigate:(module:string,tab?:string,section?:string)=>void}){
 const sections=ccrSections(viewer),section=sections.find(t=>t.id===requestedTab)||sections[0],tab=section?.id,groups=[...new Set(sections.map(t=>t.group))];
 const raw=section?.id===requestedTab?record||'':'', uploadIntent=raw.startsWith('upload:'), id=uploadIntent?raw.slice(7):raw;
 const destinations=sections.filter(s=>s.id!=='reports'&&s.id!=='command'&&s.id!=='year-history'&&canAccess(viewer,ccrModule,s.id,true)&&(s.id!=='people'||canAccess(viewer,'People & HR'))).map(s=>s.id as keyof typeof documentRoutes);
 const canStartUpload=(t:string)=>destinations.some(d=>d===t);
 const wantsUpload=!!tab&&uploadIntent&&canStartUpload(tab);
 function startUpload(t:string,target=''){if(canStartUpload(t))onNavigate(ccrModule,t,'upload:'+target);}
 function open(tab:string,target?:string){if(sections.some(t=>t.id===tab))onNavigate(ccrModule,tab,target);}
 if(directoryTab(ccrModule,requestedTab)&&!sections.some(s=>s.id===requestedTab)&&sections.length)return <section className="ccrx-noaccess" role="status"><LockKeyhole size={23}/><h2>Section Access Required</h2><p>Your account has not been assigned access to this CCR section.</p><button type="button" className="ccru-launch" onClick={()=>open(sections[0].id)}>Go to {sections[0].title}</button></section>;
 if(!section||!tab)return <section className="ccrx-noaccess"><LockKeyhole size={23}/><h2>No CCR Sections Assigned</h2><p>Your site administrator can assign section access in Admin.</p></section>;
 const page=()=>{switch(tab){
  case 'reports':return <CcrReports key={id} viewer={viewer} initialReport={id} onOpen={open}/>;
  case 'command':return <CcrOverview viewer={viewer} onOpen={open}/>;
  case 'hearings':return <CourtDocket onReport={sections.some(s=>s.id==='reports')?()=>open('reports','hearing-analysis'):undefined} uploadOnOpen={wantsUpload} initialId={id.startsWith('outcome:')?'':id.replace(/^matter:/,'')} resultFilter={sectionOutcome(raw)} onResultChange={s=>open('hearings',s==='all'?undefined:'outcome:'+s)}/>;
  case 'damage':return <DamageClaimsWorkspace uploadOnOpen={wantsUpload} initialId={id}/>;
  case 'people':return <PersonnelReview uploadOnOpen={wantsUpload} viewer={viewer} onOpen={onNavigate}/>;
  case 'year-history':return <YearArchive module={ccrModule} onReturnToWork={()=>open(sections[0].id)} onOpenRecord={open} canAttachToRecord={canStartUpload} onAttachToRecord={startUpload}/>;
  default:return <RegisterWorkspace key={tab+':'+raw} uploadOnOpen={wantsUpload} tab={tab} initialId={id}/>;
 }};
 return <div className="ccrx" aria-label="Compliance, Claims & Recovery Workspace"><ModuleRail label="CCR Sections">{groups.map(g=><div className="ccrx-rail-group" key={g}><span aria-hidden="true">{g}</span><nav aria-label={g+' Sections'}>{sections.filter(t=>t.group===g).map(t=>{const Icon=icons[t.id as CcrTab];return <button type="button" key={t.id} aria-current={tab===t.id?'page':undefined} onClick={()=>open(t.id)}><Icon size={16} aria-hidden="true"/>{t.title}</button>})}</nav></div>)}</ModuleRail><div className="ccrx-topline"><div className="ccrx-crumb" aria-label="Current Section"><Scale size={16}/><span>Compliance, Claims &amp; Recovery</span><ChevronRight size={14}/><b>{section.title}</b></div><div className="ccrx-actions">{(tab==='hearings'||tab==='damage')&&<DirectoryLink key={tab+sectionOutcome(raw)} tab={tab} outcome={sectionOutcome(raw)}/>} {(tab==='command'||tab==='year-history')&&<DocumentDestination options={destinations} onSelect={startUpload}/>}<span className="ccrx-private" title="Only sections assigned to your account are available."><ShieldCheck size={14}/>Confidential</span></div></div><div className="ccrx-content" key={tab+':'+String(wantsUpload)}>{page()}{(tab==='damage'||tab==='hearings'||tab==='tdlr')&&<SourceFileShelf scope={tab}/>}</div></div>;
}
