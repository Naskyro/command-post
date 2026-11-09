'use client';
import {useCallback,useEffect,useState} from 'react';
import {Award,BookOpen,ExternalLink,FileDown,GraduationCap,RefreshCw} from 'lucide-react';
import {requestJson} from '@/lib/shared/client';
import type {SchoolAchievement,SchoolAssignment,SchoolCourse} from '@/lib/school/model';
import {Button,Card,Empty,dateLabel} from './ui';
import './personnel-learning.css';

type Completion={courseId:string;title:string;completedAt?:string;score?:number;percent:number};
type PersonnelLearning={achievements:SchoolAchievement[];completions:Completion[];courses:SchoolCourse[];assignments:SchoolAssignment[]};
export default function PersonnelLearningPanel({personId,personName,onOpen,compact=false}:{personId:string;personName:string;onOpen?:(tab:string)=>void;compact?:boolean}){
 const [data,setData]=useState<PersonnelLearning|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[showScores,setShowScores]=useState(false);
 const load=useCallback(async()=>{setBusy(true);try{const result=await requestJson<PersonnelLearning>('/api/school/personnel?personId='+encodeURIComponent(personId));setData(result);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}},[personId]);
 useEffect(()=>{setData(null);void load();},[load]);
 const assigned=data?.courses.filter(c=>data.assignments.some(a=>a.courseId===c.id&&a.personId===personId))||[];
 const completions=data?.completions.filter(c=>!!c.completedAt)||[];
 const external=data?.achievements.filter(a=>!a.voided&&a.type!=='Course Completion')||[];
 return <section className="hr-school-panel" aria-label={'Learning Record for '+personName}>
  <div className="hr-school-head"><div><span><GraduationCap size={18}/>School House</span><h3>{compact?'Onboarding Learning':'Training & Credentials'}</h3></div><div className="hr-school-actions">{onOpen&&<Button onClick={()=>onOpen('assigned-learning')}><BookOpen size={15}/>Open School House</Button>}<Button disabled={busy} onClick={()=>void load()} aria-label="Refresh Training Record"><RefreshCw size={15}/></Button></div></div>
  {error?<p role="alert" className="hr2-error">{error}</p>:!data?<p role="status">Loading the learning record…</p>:<>
   <div className="hr-school-metrics"><div><strong>{assigned.filter(c=>!completions.some(x=>x.courseId===c.id)).length}</strong><span>Assigned Courses</span></div><div><strong>{completions.length}</strong><span>Courses Completed</span></div><div><strong>{external.reduce((n,a)=>n+(Number(a.credits)||0),0)}</strong><span>Recorded CE Credits</span></div></div>
   {assigned.length>0&&<div className="hr-school-list">{assigned.map(c=>{const completion=completions.find(x=>x.courseId===c.id),percent=completion?100:Math.round(c.progress?.percent||0),assignment=data.assignments.find(a=>a.courseId===c.id&&a.personId===personId);return <article key={c.id}><div><strong>{c.title}</strong><small>{completion?'Completed '+dateLabel(completion.completedAt):assignment?.dueAt?'Due '+dateLabel(assignment.dueAt):c.requiredOnboarding?'Onboarding Course':'Assigned Learning'}</small></div><div className="hr-school-progress"><progress max={100} value={percent} aria-label={c.title+' Progress'}/><span>{percent}%</span></div></article>})}</div>}
   {!assigned.length&&!completions.length&&<Empty title="No Learning Records Yet">Assigned courses and verified completions appear here as learning is recorded.</Empty>}
   {!compact&&completions.length>0&&<Card title="Completion Certificates" action={<label className="hr-school-check"><input type="checkbox" checked={showScores} onChange={e=>setShowScores(e.target.checked)}/>Include Exam Score</label>}><div className="hr-school-list">{completions.map(c=><article key={c.courseId}><Award size={22}/><div><strong>{c.title}</strong><small>{dateLabel(c.completedAt)}{showScores&&c.score!==undefined?' · Score '+c.score+'%':''}</small></div><a className="hr2-button" href={'/api/school/certificate?'+new URLSearchParams({courseId:c.courseId,personId,score:showScores?'1':'0'})} download><FileDown size={15}/>PDF</a></article>)}</div></Card>}
   {!compact&&<Card title="External Training, Licenses & CE" description="Achievements recorded outside School House remain part of this personnel record.">{external.length?<div className="hr-school-list">{external.map(a=><article key={a.id}><Award size={22}/><div><strong>{a.title}</strong><small>{[a.type,a.provider,dateLabel(a.completedAt)].filter(Boolean).join(' · ')}</small>{a.expiresAt&&<small>Expires {dateLabel(a.expiresAt)}</small>}{a.note&&<p>{a.note}</p>}<small>{a.credits>0?a.credits+' CE Credits · ':''}{a.points} Learning Points</small>{a.evidenceIds?.map((id,i)=><a key={id} href={'/api/school/media?id='+encodeURIComponent(id)} target="_blank" rel="noreferrer">View Evidence {i+1} <ExternalLink size={12}/></a>)}</div></article>)}</div>:<p>No external achievements recorded.</p>}{onOpen&&<div className="hr-school-actions"><Button onClick={()=>onOpen('achievements')}>Open Achievement Records</Button></div>}</Card>}
  </>}
 </section>;
}
