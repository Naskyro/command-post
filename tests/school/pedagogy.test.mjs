import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPolicyLearning} from '../../lib/school/pedagogy.ts';

test('policy teaching preserves exact employee requirements while keeping grading rubrics separate',()=>{
 const policy={id:'TEST-001',code:'TEST-001',version:7,status:'Published',content:{title:'PPE Availability and Care',sections:[
  {heading:'Purpose',text:'Make the required equipment available for the assigned work.'},
  {heading:'Procedure',text:'01 Check the Equipment | If the required item is missing, report the specific item to the named reviewer. Do not substitute equipment without approval.\n02 Record the Decision | Keep the approval and the unresolved item in the work record.'},
  {heading:'Employee Exception',text:'If another issued policy applies to the task, follow that policy’s stated exception.'},
  {heading:'Private Manager Notes',text:'PRIVATE MANAGEMENT RUBRIC MUST NOT LEAK',visibility:'management'},
 ]}};
 const original=structuredClone(policy),{lessons,questions}=buildPolicyLearning(policy);
 assert.deepEqual(policy,original);
 const reading=lessons.map(lesson=>lesson.body).join('\n');
 for(const section of policy.content.sections.filter(section=>section.visibility!=='management'))assert.ok(reading.includes(section.text),section.heading);
 assert.match(reading,/\*\*PPE Availability and Care\*\*/);
 assert.match(reading,/Hypothetical example/);
 assert.match(reading,/:::practice/);
 assert.match(reading,/:::reference TEST-001 v7/);
 assert.doesNotMatch(reading,/Instructor rubric|PRIVATE MANAGEMENT RUBRIC/);
 assert.ok(lessons.every(lesson=>lesson.kind==='reading'&&lesson.questions.length===0));
 assert.match(questions[0].answer,/Instructor rubric/);
 assert.match(questions[0].answer,/Do not substitute equipment without approval/);
 assert.doesNotMatch(JSON.stringify(questions),/PRIVATE MANAGEMENT RUBRIC/);
});

test('draft teaching identifies proposed wording and does not create content for an empty policy',()=>{
 const policy={id:'DRAFT-001',code:'DRAFT-001',version:1,status:'Draft',content:{title:'Future Process',sections:[{heading:'Decision to Resolve',text:'The proposed approval route still requires a decision.'}]}};
 assert.match(buildPolicyLearning(policy).lessons[0].body,/draft for review/);
 assert.deepEqual(buildPolicyLearning({...policy,content:{...policy.content,sections:[]}}),{lessons:[],questions:[]});
});
