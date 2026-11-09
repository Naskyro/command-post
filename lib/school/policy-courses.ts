import {createHash} from 'node:crypto';
import type {Audience,Policy} from '../sop/model';
import type {SchoolCourse,SchoolLesson,SchoolQuestion} from './model';
import {buildPolicyLearning} from './pedagogy';

export const policyCourseSchema=1;
export const policyFinalExamId='policy-final-exam';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=(values:string[])=>[...new Set(values)].sort();
const audience=(a:Audience):Audience=>a.all?{all:true,departments:[],levels:[],people:[]}:{all:false,departments:sorted(a.departments),levels:sorted(a.levels),people:sorted(a.people)};

/** Compact only new bundle states; legacy progress uses its original fingerprint. */
export function policyCourseProgressFingerprint(course:SchoolCourse){
 return 'policy-course-v1:'+hash([course.policyVersions,course.policyBundle,course.lessons.map(l=>[l.id,l.kind,l.body,l.mediaId||'',l.mediaUrl||'',l.sourcePolicyId||'',l.requiresPrevious,l.passingScore,l.questions.map(q=>[q.id,q.prompt,q.type,q.options,q.points,q.correctIndex,q.answer||'',q.sourcePolicyId||''])])]);
}

/** A course identity must never represent different policy editions or audiences. */
export function policySourceFingerprint(policies:Policy[]){
 return hash([...policies].sort((a,b)=>a.id.localeCompare(b.id)).map(p=>({id:p.id,version:p.version,status:p.status,code:p.code,topicId:p.topicId,audience:audience(p.audience),content:{...p.content,relatedIds:undefined,sections:p.content.sections.filter(s=>s.visibility!=='management')}})));
}

export function currentLearningPolicies(policies:Policy[]):Policy[]{
 const latest=new Map<string,Policy>();
 for(const policy of policies){
  if(policy.status==='Archived')continue;
  const key=policy.id+'|'+policy.status,prior=latest.get(key);
  if(!prior||policy.version>prior.version)latest.set(key,policy);
 }
 return [...latest.values()].sort((a,b)=>a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
}

type BuildOptions={topicNames?:Record<string,string>;departmentId?:string};
type Group={kind:'all-staff'|'topic';topicId:string;policies:Policy[]};

/**
 * Inputs have already passed SOP authorization and employee-edition projection.
 * Exact audiences are grouped separately, so viewing another department never
 * changes the body behind an existing course ID. Common policies are not copied
 * into every role-specific topic course.
 */
export function buildPolicyCourses(policies:Policy[],options:BuildOptions={}):SchoolCourse[]{
 const current=currentLearningPolicies(policies),groups:Group[]=[];
 for(const status of ['Published','Draft'] as const){
  const edition=current.filter(p=>p.status===status),common=edition.filter(p=>p.audience.all);
  if(common.length)groups.push({kind:'all-staff',topicId:'ALL',policies:common});
  const topics=new Map<string,Policy[]>();
  for(const p of edition){const key=JSON.stringify([p.topicId,audience(p.audience)]);topics.set(key,[...(topics.get(key)||[]),p]);}
  for(const topic of topics.values()){
   // A second course with the exact same complete collection adds no learning.
   if(topic[0].audience.all&&topic.length===common.length)continue;
   groups.push({kind:'topic',topicId:topic[0].topicId,policies:topic});
  }
 }
 return groups.map(group=>{
  const ps=group.policies,first=ps[0],scope=audience(first.audience),sourceFingerprint=policySourceFingerprint(ps);
  const scopeKey=hash([group.kind,group.topicId,scope,options.departmentId||'']);
  const learning=ps.map(policy=>({policy,...buildPolicyLearning(policy)}));
  // The full body already contains headings and reference blocks. Storing the
  // same text again as readingSections would double a whole collection's size.
  const lessons:SchoolLesson[]=learning.flatMap(({policy,lessons})=>lessons.filter(l=>l.kind!=='quiz').map(({readingSections:_,...l})=>({...l,id:'policy-reading-'+hash([policy.id,l.id]).slice(0,32),sourcePolicyId:policy.id,questions:[],requiresPrevious:true})));
  const questions:SchoolQuestion[]=learning.flatMap(({policy,questions})=>questions.map(q=>({...q,id:'policy-question-'+hash([policy.id,q.id]).slice(0,32),sourcePolicyId:policy.id})));
  const contentFingerprint=hash([lessons,questions]);
  const courseId='policy-bundle-'+group.kind+'-'+hash([policyCourseSchema,scopeKey,sourceFingerprint,contentFingerprint]);
  const missing=ps.filter(p=>!lessons.some(l=>l.sourcePolicyId===p.id&&l.body.trim())||!questions.some(q=>q.sourcePolicyId===p.id));
  const topicName=options.topicNames?.[group.topicId]||group.topicId;
  const title=group.kind==='all-staff'?'All-Staff Policies · Complete Course':topicName+' Policies · '+(scope.all?'Complete Course':'Role-Specific Course');
  const exam:SchoolLesson={id:policyFinalExamId,title:'Final Course Assessment',kind:'quiz',body:'You have worked through the full course. Now apply each policy to a workplace situation. Answer every question using the actions and responsibilities you learned. Your instructor reviews the responses. Complete all lessons and pass this final assessment to earn course completion. Policy acknowledgments and signatures remain separate.',questions,passingScore:80,maxAttempts:3,dripDays:0,requiresPrevious:true};
  return {id:courseId,version:0,title,description:(group.kind==='all-staff'?'Learn the complete set of company policies shared with all staff.':'Work through the complete policies for '+topicName.toLowerCase()+'.')+' Practice the decisions you will make at work, then complete one final assessment covering every policy in this course.',topic:group.kind==='all-staff'?'All Staff':topicName,status:first.status==='Published'&&!missing.length&&questions.length?'Published':'Draft',departmentIds:options.departmentId?[options.departmentId]:scope.departments,allDepartments:!options.departmentId&&scope.all,crossTraining:false,requiredOnboarding:(group.kind==='all-staff'||!scope.all)&&ps.some(p=>p.requireOnboardingSignature!==false),policyIds:ps.map(p=>p.id),policyVersions:Object.fromEntries(ps.map(p=>[p.id,p.version])),policyBundle:{schema:policyCourseSchema,group:group.kind,topicId:group.topicId,scopeKey,sourceFingerprint,contentFingerprint,finalExamId:policyFinalExamId,...(options.departmentId?{departmentId:options.departmentId}:{})},lessons:[...lessons,exam],source:ps.length+' complete policies · employee edition',...(missing.length?{sourceWarnings:['Complete the reading and scenario assessment for: '+missing.map(p=>p.code).join(', ')]}:{}),createdBy:'SOP Library',updatedBy:first.updatedBy,updatedAt:ps.map(p=>p.updatedAt).sort().at(-1)||first.updatedAt} as SchoolCourse;
 });
}

/** Match the entire source set, not merely one policy shared by two courses. */
export function matchingPolicySources(course:SchoolCourse,policies:Policy[]):Policy[]|undefined{
 const sources=course.policyIds.map(id=>policies.find(p=>p.id===id&&p.version===course.policyVersions?.[id]));
 if(sources.some(p=>!p))return undefined;
 const exact=sources as Policy[];
 return !course.policyBundle||policySourceFingerprint(exact)===course.policyBundle.sourceFingerprint?exact:undefined;
}

/** An edited bundled course still needs all policy readings and a final exam. */
export function policyCourseCoverageError(course:Pick<SchoolCourse,'policyBundle'|'policyIds'|'lessons'>):string|undefined{
 if(!course.policyBundle)return;
 const exam=course.lessons.at(-1);
 if(!exam||exam.id!==course.policyBundle.finalExamId||exam.kind!=='quiz'||!exam.requiresPrevious||course.lessons.slice(0,-1).some(l=>l.kind==='quiz'))return 'Keep one final course assessment after all teaching lessons.';
 if(course.policyIds.some(id=>!course.lessons.slice(0,-1).some(l=>l.sourcePolicyId===id&&l.body.trim())||!exam.questions.some(q=>q.sourcePolicyId===id)))return 'Keep a complete lesson and final assessment question for every policy in this course.';
}
