import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {buildProgress,certificateEligible} from '../../lib/school/rules.ts';

const temp=await mkdtemp(join(tmpdir(),'policy-course-'));
const outfile=join(temp,'policies.mjs');
await build({entryPoints:['lib/school/policy-courses.ts'],outfile,bundle:true,format:'esm',platform:'node'});
const {buildPolicyCourses,policyCourseCoverageError,matchingPolicySources}=await import(pathToFileURL(outfile).href);
const all={all:true,departments:[],levels:[],people:[]};
const policy=(id,topicId='ALL',extra={})=>({id,code:id,topicId,version:1,status:'Published',etag:1,audience:all,content:{title:'Policy '+id,shortName:id,policyOwner:'Operations',preparedDate:'',effectiveDate:'',revision:'1',approvalStatus:'Published',keywords:'',relatedIds:[],sections:[{heading:'Purpose',text:'Keep the people affected by this task informed and safe.'},{heading:'Procedure',text:'Check the record, confirm who is responsible, and report unresolved facts before handing off the task.'}]},updatedAt:'2026-11-01T00:00:00Z',updatedBy:'Instructor',...extra});

test.after(async()=>rm(temp,{recursive:true,force:true}));
test('one full common course and complete topic collections keep exact role audiences separate',()=>{
 const ps=[policy('A'),policy('B'),policy('S','SAFETY'),policy('D1','DSP',{audience:{...all,all:false,departments:['dispatch']}}),policy('D2','DSP',{audience:{...all,all:false,departments:['dispatch']}}),policy('M','DSP',{audience:{...all,all:false,levels:['Manager']}})];
 const courses=buildPolicyCourses(ps),common=courses.find(c=>c.policyBundle.group==='all-staff');
 assert.deepEqual(common.policyIds,['A','B','S']);assert.equal(common.allDepartments,true);assert.equal(common.requiredOnboarding,true);
 const dispatch=courses.find(c=>c.policyIds.includes('D1'));
 assert.deepEqual(dispatch.policyIds,['D1','D2']);assert.deepEqual(dispatch.departmentIds,['dispatch']);assert.equal(dispatch.allDepartments,false);
 assert.ok(!dispatch.policyIds.includes('A'));assert.ok(!dispatch.policyIds.includes('M'));
 assert.deepEqual(courses.find(c=>c.policyIds.includes('M')).policyIds,['M']);
 for(const c of courses){assert.equal(c.lessons.filter(l=>l.kind==='quiz').length,1);assert.equal(c.lessons.at(-1).kind,'quiz');assert.equal(c.lessons.at(-1).questions.length,c.policyIds.length);assert.equal(policyCourseCoverageError(c),undefined);}
});
test('stable identities bind the full source, version, audience, status and instructor department',()=>{
 const a=policy('A'),b=policy('B'),courses=buildPolicyCourses([a,b]);
 assert.equal(courses[0].id,buildPolicyCourses([b,a])[0].id);
 for(const changed of [{...b,version:2},{...b,status:'Draft'},{...b,audience:{...all,all:false,people:['one']}},{...b,content:{...b.content,sections:[...b.content.sections,{heading:'A new duty',text:'A newly approved requirement.'}]}}])assert.notEqual(courses[0].id,buildPolicyCourses([a,changed])[0].id);
 const scoped=buildPolicyCourses([a,b],{departmentId:'dispatch'})[0];assert.notEqual(scoped.id,courses[0].id);assert.equal(scoped.policyBundle.departmentId,'dispatch');
 assert.ok(matchingPolicySources(courses[0],[a,b]));assert.equal(matchingPolicySources(courses[0],[a]),undefined);
});
test('full collection and all employee sections survive beyond former eight-question and hundred-lesson caps',()=>{
 const ps=Array.from({length:110},(_,i)=>policy('P'+String(i).padStart(3,'0')));
 ps[0].content.sections.push(...Array.from({length:12},(_,i)=>({heading:'Required section '+i,text:'Unique exact duty '+i+' must remain available to the learner.'})),{heading:'Private management',text:'MANAGEMENT-ONLY-SECRET',visibility:'management'});
 const c=buildPolicyCourses(ps)[0];assert.equal(c.policyIds.length,110);assert.equal(c.lessons.length,111);assert.equal(c.lessons.at(-1).questions.length,110);
 const lesson=c.lessons.find(l=>l.sourcePolicyId===ps[0].id);
 for(const section of ps[0].content.sections.filter(s=>s.visibility!=='management'))assert.ok(lesson.body.includes(section.text));
 assert.ok(!JSON.stringify(c).includes('MANAGEMENT-ONLY-SECRET'));
 assert.equal(new Set(c.lessons.map(l=>l.id)).size,c.lessons.length);
 assert.equal(new Set(c.lessons.at(-1).questions.map(q=>q.id)).size,110);
});
test('draft policies stay in draft collections and missing content cannot create a published exam',()=>{
 const courses=buildPolicyCourses([policy('published'),policy('draft','ALL',{status:'Draft'}),policy('empty','DSP',{content:{...policy('x').content,sections:[]},audience:{...all,all:false,departments:['dispatch']}})]);
 assert.equal(courses.find(c=>c.policyIds.includes('draft')).status,'Draft');assert.equal(courses.find(c=>c.policyIds.includes('empty')).status,'Draft');
 assert.ok(!courses.find(c=>c.policyIds.includes('published')).policyIds.includes('draft'));
});
test('finishing readings never completes a course, rounds to at most 99%, and requires the entire final exam',()=>{
 const course=buildPolicyCourses(Array.from({length:205},(_,i)=>policy('P'+i)))[0],exam=course.lessons.at(-1);
 const state={generation:1,enrolledAt:'2026-11-01T00:00:00Z',completedLessonIds:course.lessons.filter(l=>l.kind!=='quiz').map(l=>l.id)};
 const read=buildProgress(course,'learner',state,[]);assert.equal(read.percent,99);assert.equal(read.completedAt,undefined);assert.equal(certificateEligible(course,read),false);
 const attempt={id:'full',courseId:course.id,personId:'learner',lessonId:exam.id,generation:1,status:'Passed',score:100,questions:exam.questions,submittedAt:'2026-11-02T00:00:00Z'};
 const partial=buildProgress(course,'learner',state,[{...attempt,questions:exam.questions.slice(0,8)}]);assert.equal(partial.completedAt,undefined);
 const pending=buildProgress(course,'learner',state,[{...attempt,status:'Awaiting Review'}]);assert.equal(pending.completedAt,undefined);
 const full=buildProgress(course,'learner',state,[attempt]);assert.equal(full.percent,100);assert.equal(certificateEligible(course,full),true);
 assert.equal(certificateEligible({...course,lessons:course.lessons.slice(0,-1)},full),false);
 const old={...attempt,courseId:'policy-course-P0'};assert.equal(buildProgress(course,'learner',state,[old]).completedAt,undefined);assert.equal(old.status,'Passed');
});
test('authoring cannot remove a policy assessment or move the final exam ahead of teaching',()=>{
 const c=buildPolicyCourses([policy('A'),policy('B')])[0];
 assert.match(policyCourseCoverageError({...c,lessons:[...c.lessons.slice(0,-1),{...c.lessons.at(-1),questions:c.lessons.at(-1).questions.slice(0,1)}]}),/every policy/);
 assert.match(policyCourseCoverageError({...c,lessons:[c.lessons.at(-1),...c.lessons.slice(0,-1)]}),/final course assessment/);
});
