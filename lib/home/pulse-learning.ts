import type {FinRecord,Viewer} from '../finance/model';
import {canAccess} from '../finance/access';
import type {SchoolData} from '../school/model';
import type {HomeLearning,HomeLearningItem} from './learning-types';
import type {PulseSignal} from './pulse-types';
import {localDate} from '../finance/timeclock';
import {data as schoolData,contextForViewer as schoolContext} from '../school/server';

type LearningRead=(v:Viewer,records:FinRecord[])=>Promise<SchoolData>;
// Keep this dependency static: the Worker entry exports only its fetch handler,
// so a split chunk must not dynamically import named services back from that entry.
const read:LearningRead=async(v,records)=>schoolData(await schoolContext(v,records));
const base={module:'SOP Library',tab:'assigned-learning'};
const validDue=(s?:string)=>s&&Number.isFinite(Date.parse(s))?s:undefined;
const dueDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s:localDate(Date.parse(s));
/** Accepts the already access-projected LMS DTO, then narrows it further for Home. Never returns keys or employee grades. */
export function projectHomeLearning(d:SchoolData,today:string):{summary:HomeLearning;signals:PulseSignal[]}{
 const me=d.viewer.personId,ownAssignments=d.assignments.filter(a=>a.personId===me),published=d.courses.filter(c=>c.status==='Published'&&c.available!==false);
 const assigned=published.filter(c=>c.assigned||ownAssignments.some(a=>a.courseId===c.id));
 const active=assigned.filter(c=>!c.progress?.completedAt);
 const items:HomeLearningItem[]=active.map(c=>{const a=ownAssignments.find(a=>a.courseId===c.id),due=validDue(a?.dueAt),awaiting=!!c.progress?.lessonStates.some(l=>l.pendingGrade);const next=c.lessons.find(l=>c.progress?.lessonStates.some(s=>s.lessonId===l.id&&!s.completed&&!s.locked));return {id:c.id,title:c.title,percent:c.progress?.percent||0,...(due?{due}:{}),overdue:!!due&&dueDay(due)<today,awaitingReview:awaiting,nextLesson:next?.title,target:{...base,section:c.id}};}).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.due||'9999').localeCompare(b.due||'9999')||b.percent-a.percent||a.title.localeCompare(b.title));
 const summary:HomeLearning={assigned:assigned.length,pending:active.length,completed:assigned.length-active.length,inProgress:items.filter(x=>x.percent>0).length,overdue:items.filter(x=>x.overdue).length,awaitingReview:items.filter(x=>x.awaitingReview).length,percent:assigned.length?Math.round(assigned.reduce((n,c)=>n+(c.progress?.percent||0),0)/assigned.length):0,items:items.slice(0,5)};
 const signalItems=items.map(i=>({id:'learning:'+i.id,title:i.title,detail:i.percent+'% Complete'+(i.awaitingReview?' · Awaiting Instructor Review':''),due:i.due,target:i.target,calendar:!!i.due}));
 const signals:PulseSignal[]=[{id:'learning_pending',title:'My Pending Learning',module:'SOP Library',description:summary.pending+' assigned courses remaining · '+summary.percent+'% overall progress.',count:summary.pending,unit:'courses',target:base,items:signalItems,tone:summary.overdue?'warning':summary.pending?'info':'neutral',score:summary.overdue?74:summary.pending?48:0,dateLabel:'Assigned Learning'}];
 if(summary.overdue)signals.push({id:'learning_overdue',title:'Overdue Training',module:'SOP Library',description:'Your assigned learning with a due date before today.',count:summary.overdue,unit:'courses',target:base,items:signalItems.filter((_,i)=>items[i].overdue),tone:'warning',score:76,dateLabel:'Past Due'});
 if(d.viewer.canManage){
  const permitted=new Set(d.people.filter(p=>p.id!==me&&['Active','Onboarding'].includes(p.status)).map(p=>p.id));
  const availableCourses=new Set(published.map(c=>c.id));
  const pending=d.assignments.filter(a=>permitted.has(a.personId)&&availableCourses.has(a.courseId)&&a.status!=='Completed');
  const reviews=d.attempts.filter(a=>permitted.has(a.personId)&&availableCourses.has(a.courseId)&&a.status==='Awaiting Review');
  summary.team={pending:pending.length,overdue:pending.filter(a=>validDue(a.dueAt)&&dueDay(a.dueAt!)<today).length,awaitingReview:reviews.length,people:new Set(pending.map(a=>a.personId)).size};
  signals.push({id:'learning_team_pending',title:'Team Learning to Complete',module:'SOP Library',description:'Assigned learning within your permitted employee scope.',count:pending.length,unit:'assignments',target:{module:'SOP Library',tab:'scores'},tone:summary.team.overdue?'warning':pending.length?'info':'neutral',score:summary.team.overdue?70:pending.length?44:0,items:pending.slice(0,8).map(a=>({id:a.id,title:published.find(c=>c.id===a.courseId)?.title||'Assigned Course',detail:d.people.find(p=>p.id===a.personId)?.name||'Team Member',due:validDue(a.dueAt),target:{module:'SOP Library',tab:'scores'},calendar:false}))});
  signals.push({id:'learning_reviews',title:'Team Exams Awaiting Review',module:'SOP Library',description:'Submitted assessments in your authorized teaching and reporting scope.',count:reviews.length,unit:'exams',target:{module:'SOP Library',tab:'scores'},tone:reviews.length?'info':'neutral',score:reviews.length?63:0,items:reviews.slice(0,8).map(a=>({id:a.id,title:a.lessonTitle,detail:d.people.find(p=>p.id===a.personId)?.name||'Team Member',at:a.submittedAt,target:{module:'SOP Library',tab:'scores'},calendar:false}))});
 }
 return {summary,signals};
}
export async function homeLearning(v:Viewer,records:FinRecord[],at=new Date(),io:LearningRead=read){
 const self=records.find(p=>p.kind==='person'&&p.id===v.person);
 if(v.onboardingOnly||!self||!['Active','Onboarding'].includes(String(self.status))||self.accountStatus==='Disabled'||!canAccess(v,'SOP Library','learning'))return null;
 return projectHomeLearning(await io(v,records),localDate(at.getTime()));
}
