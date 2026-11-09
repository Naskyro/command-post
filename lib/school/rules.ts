import type {SchoolAttempt,SchoolCourse,SchoolProgress,SchoolLesson,SchoolQuestion} from './model';
export function publicQuestion(q:SchoolQuestion,editor=false):SchoolQuestion{if(editor)return {...q};const {correctIndex,answer,explanation,reviewRequired,...safe}=q;return safe;}
export function scoreAnswers(questions:SchoolQuestion[],answers:Record<string,string>){const feedback:SchoolAttempt['feedback']={};let earned=0,pending=false;for(const q of questions){if(q.type==='text'){pending=true;feedback[q.id]={points:0,note:'Awaiting instructor review.'};}else{const correct=String(q.correctIndex)===answers[q.id];const points=correct?q.points:0;earned+=points;feedback[q.id]={points,note:q.explanation||'',correct};}}const possible=questions.reduce((s,q)=>s+q.points,0);return {feedback,pending,earned,possible,score:possible?Math.round(earned/possible*10000)/100:0};}
function finalAssessmentComplete(course:SchoolCourse,states:SchoolProgress['lessonStates']){
 if(!course.policyBundle)return true;
 const exam=course.lessons.at(-1);
 return !!exam&&exam.id===course.policyBundle.finalExamId&&exam.kind==='quiz'&&exam.requiresPrevious&&!!states.find(l=>l.lessonId===exam.id&&l.passed&&l.completed)&&!course.lessons.slice(0,-1).some(l=>l.kind==='quiz')&&course.policyIds.every(id=>course.lessons.slice(0,-1).some(l=>l.sourcePolicyId===id&&l.body.trim())&&exam.questions.some(q=>q.sourcePolicyId===id));
}
export function buildProgress(course:SchoolCourse,personId:string,state:{generation:number;enrolledAt:string;completedLessonIds:string[]},attempts:SchoolAttempt[],now=Date.now()):SchoolProgress{
 const mine=attempts.filter(a=>a.courseId===course.id&&a.personId===personId&&a.generation===state.generation&&a.status!=='Voided');
 let prev=true,completeAt='';const done:string[]=[],scores:number[]=[];
 const lessonStates=course.lessons.map((l:SchoolLesson)=>{
  const tries=mine.filter(a=>a.lessonId===l.id),pass=tries.filter(a=>a.status==='Passed').sort((a,b)=>(b.score||0)-(a.score||0))[0];
  // A historical partial quiz cannot satisfy a later full-course assessment.
  const complete=l.kind==='quiz'?!!pass&&(!course.policyBundle||l.questions.every(q=>pass.questions?.some(answered=>answered.id===q.id))):state.completedLessonIds.includes(l.id);
  if(complete){done.push(l.id);if(pass){scores.push(pass.score||0);completeAt=[completeAt,pass.gradedAt||pass.submittedAt||''].sort().at(-1)||'';}}
  const date=Math.max(l.releaseAt?Date.parse(l.releaseAt):0,Date.parse(state.enrolledAt)+(l.dripDays||0)*86400000),locked=!prev&&l.requiresPrevious||date>now;
  const reason=!prev&&l.requiresPrevious?'Complete the previous lesson to unlock this lesson.':date>now?'Available '+new Date(date).toISOString():'';
  const result={lessonId:l.id,locked,reason,attempts:tries.length,passed:!!pass,completed:complete,pendingGrade:tries.some(a=>a.status==='Awaiting Review'),...(date>now?{availableAt:new Date(date).toISOString()}:{})};
  prev=prev&&complete;return result;
 });
 const finished=course.lessons.length>0&&done.length===course.lessons.length&&finalAssessmentComplete(course,lessonStates);
 return {courseId:course.id,personId,completedLessonIds:done,percent:finished?100:course.lessons.length?Math.min(99,Math.round(done.length/course.lessons.length*100)):0,...(finished?{completedAt:completeAt||state.enrolledAt,score:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:undefined}:{}),generation:state.generation,enrolledAt:state.enrolledAt,lessonStates};
}
export function certificateEligible(course:SchoolCourse,progress:SchoolProgress){return course.status==='Published'&&course.lessons.length>0&&progress.percent===100&&!!progress.completedAt&&finalAssessmentComplete(course,progress.lessonStates);}
