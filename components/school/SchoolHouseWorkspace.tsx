'use client';
import {useEffect,useState} from 'react';
import {GraduationCap,PlayCircle,Compass,Award,Trophy,BookOpen,CheckCheck,PenTool,Users,ClipboardCheck,Medal,FilePenLine,Archive,Inbox,Tags} from 'lucide-react';
import ModuleRail from '@/components/shared/ModuleRail';
import SopWorkspace from '@/components/sop/SopWorkspace';
import SchoolWorkspace from './SchoolWorkspace';
import {canAccess} from '@/lib/finance/access';
import type {Viewer} from '@/lib/finance/model';
import './school-shell.css';

const policyTabs=new Set(['library','assigned','workflow','archive','inbox','topics']);
const learningTabs=[['learning','Learning Home',GraduationCap],['assigned-learning','Assigned Learning',PlayCircle],['courses','Explore Courses',Compass],['history','Scores & Certificates',Award],['leaderboard','Leaderboard',Trophy]] as const;
const teachingTabs=[['studio','Course Studio',PenTool],['assignments','Assign Learning',Users],['scores','Team Progress',ClipboardCheck],['achievements','External Learning',Medal]] as const;
const workshopTabs=[['workflow','Policy Workshop',FilePenLine],['archive','Version Archive',Archive],['inbox','Request Inbox',Inbox],['topics','Policy Topics',Tags]] as const;

export default function SchoolHouseWorkspace({viewer,initialTab='learning',initialPolicy=''}:{viewer?:Viewer;initialTab?:string;initialPolicy?:string}){
 const [tab,setTab]=useState(initialTab),[policy,setPolicy]=useState(initialPolicy);
 const allowed=(key:string)=>canAccess(viewer,'SOP Library',['archive','topics'].includes(key)?'workflow':key)||(['library','assigned'].includes(key)&&viewer?.companyPolicyReader===true);
 const available=[...learningTabs,...teachingTabs,...workshopTabs].filter(([key])=>allowed(key));
 const fallback=available.some(([key])=>key==='learning')?'learning':allowed('library')?'library':available[0]?.[0]||'library';
 const active=allowed(tab)?tab:fallback;
 useEffect(()=>{setTab(initialTab);setPolicy(initialPolicy)},[initialTab,initialPolicy]);
 useEffect(()=>{const handler=(e:Event)=>{const d=(e as CustomEvent<{tab?:string;section?:string}>).detail;setTab(d.tab||'library');setPolicy(d.section||'')};window.addEventListener('sop-search-open',handler);return()=>window.removeEventListener('sop-search-open',handler)},[]);
 function navigate(next:string){setTab(next);setPolicy('');window.scrollTo({top:0,behavior:'smooth'})}
 const section=(entries:typeof learningTabs|typeof teachingTabs|typeof workshopTabs)=><nav>{entries.filter(([key])=>allowed(key)).map(([key,label,Icon])=><button type="button" key={key} aria-current={active===key?'page':undefined} onClick={()=>navigate(key)}><Icon size={17}/>{label}</button>)}</nav>;
 return <div className="school-house"><ModuleRail label="School House Sections">
 <div className="school-rail-brand"><GraduationCap size={25}/><span>Your Next Chapter</span></div>
 {learningTabs.some(([key])=>allowed(key))&&<><p className="school-rail-label">Learn & Grow</p>{section(learningTabs)}</>}
 {(allowed('library')||allowed('assigned'))&&<><p className="school-rail-label">Policy Library</p><nav>{allowed('library')&&<button aria-current={active==='library'?'page':undefined} onClick={()=>navigate('library')}><BookOpen size={17}/>Published SOPs</button>}{allowed('assigned')&&<button aria-current={active==='assigned'?'page':undefined} onClick={()=>navigate('assigned')}><CheckCheck size={17}/>Acknowledgments</button>}</nav></>}
 {teachingTabs.some(([key])=>allowed(key))&&<><p className="school-rail-label">Teach & Lead</p>{section(teachingTabs)}</>}
 {workshopTabs.some(([key])=>allowed(key))&&<details className="school-rail-workshop" open={policyTabs.has(active)&&!['library','assigned'].includes(active)||undefined}><summary>Policy Management</summary>{section(workshopTabs)}</details>}
 </ModuleRail>
 {policyTabs.has(active)?<SopWorkspace key={'policy:'+active} embedded initialTab={active} initialPolicy={policy}/>:<SchoolWorkspace initialTab={active} initialCourseId={policy} onNavigate={navigate}/>}
 </div>
}
