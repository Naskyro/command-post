import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {policyReadingBody,policyReadingSections,importedReadingSections} from '../../lib/school/policy-reading.ts';
const policies=JSON.parse(readFileSync(new URL('../../lib/sop/private/catalog.json',import.meta.url),'utf8'));
const source=policies.find(p=>p.id==='ALL-030').content;
const lesson={id:'read-policy',title:'ALL-030 · Read the Policy',kind:'reading',body:policyReadingBody(source.sections),questions:[],passingScore:80,maxAttempts:3,dripDays:0,requiresPrevious:true};

test('ALL-030 reading exposes exact section headings and original procedure structure',()=>{
 const sections=policyReadingSections(lesson,source);
 assert.equal(sections.length,source.sections.length);
 assert.equal(sections.find(s=>s.heading==='Procedure').text.split('\n').length,4);
 assert.match(sections.find(s=>s.heading==='Procedure').text,/^01 Report the Issue \|/);
 assert.match(sections.find(s=>s.heading==='Responsibilities').text,/^Assigned Personnel \|/);
 assert.match(sections.find(s=>s.heading==='Corrective Action References').text,/^Reference \| When It Applies \| Category/);
 assert.equal(policyReadingBody(sections),lesson.body);
});

test('display enrichment does not mutate legacy body or fields used for grading and completion',()=>{
 const original=structuredClone(lesson),sections=policyReadingSections(lesson,source);
 assert.deepEqual(lesson,original);
 const fingerprint=l=>JSON.stringify([l.id,l.kind,l.body,l.mediaId,l.mediaUrl,l.questions]);
 assert.equal(fingerprint({...lesson,readingSections:sections}),fingerprint(original));
});

test('instructor-edited text is never overwritten or decorated from stale policy source',()=>{
 assert.equal(policyReadingSections({...lesson,body:lesson.body+'\nInstructor note.',readingSections:source.sections},source),undefined);
 assert.equal(policyReadingSections({...lesson,body:lesson.body.replace('Report the Issue','Report the Problem')},source),undefined);
 assert.equal(policyReadingSections({...lesson,kind:'quiz'},source),undefined);
});

test('management-only content is excluded and cannot be carried in learner display metadata',()=>{
 const content={...source,sections:[...source.sections,{heading:'Supervisor Instructions',text:'Private supervisor rubric',visibility:'management'}]};
 const sections=policyReadingSections(lesson,content);
 assert.ok(sections&&!sections.some(s=>s.heading==='Supervisor Instructions'));
 assert.equal(policyReadingSections({...lesson,body:policyReadingBody(content.sections)},content),undefined);
});


test('trusted imported reading presentation survives unchanged saves but never stale instructor edits',()=>{
 const source={...lesson,readingSections:[{heading:'Original Section',text:'**Original** explanation.'}]};
 assert.deepEqual(importedReadingSections(lesson,source),source.readingSections);
 assert.equal(importedReadingSections({...lesson,body:'Instructor replacement',readingSections:source.readingSections},source),undefined);
 assert.equal(importedReadingSections({...lesson,id:'different'},source),undefined);
 assert.equal(importedReadingSections(lesson,undefined),undefined);
});
