import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

test('School House actual API workflows and authorization',async t=>{
 const db=new DatabaseSync(':memory:'),temp=await mkdtemp(join(tmpdir(),'school-api-'));
 t.after(async()=>{db.close();delete globalThis.schoolTestDb;delete globalThis.schoolTestPeople;await rm(temp,{recursive:true,force:true});});
 for(const f of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort())db.exec(await readFile('drizzle/'+f,'utf8'));
 let race;
 globalThis.schoolTestDb={prepare(sql){const q=db.prepare(sql);return {args:[],bind(...a){this.args=a;return this;},first(){return q.get(...this.args);},all(){return {results:q.all(...this.args)};},run(){return {meta:{changes:q.run(...this.args).changes}};}};},batch(ops){if(race){const r=race;race=null;r();}db.exec('BEGIN');try{const result=ops.map(o=>o.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
 const grant=(tab,level='View')=>({module:'SOP Library',tab,level});
 const person=(id,department,extra={})=>({id,kind:'person',version:1,name:id,email:id+'@example.net',department,departmentId:department,status:'Active',workerType:'Employee',role:'Employee',authorityLevel:'Coordinator',accessMode:'Custom',access:[grant('library'),grant('learning'),grant('courses'),grant('history'),grant('leaderboard')],...extra});
 globalThis.schoolTestPeople=[{id:'department-1',kind:'department',name:'Dispatch',head:'manager'},{id:'department-2',kind:'department',name:'Drivers'},person('jerson','department-1',{role:'Owner',authorityLevel:'Executive'}),person('manager','department-1',{role:'Supervisor',authorityLevel:'Manager',access:[grant('library'),grant('learning'),grant('studio','Edit'),grant('scores','Edit')]}),person('learner','department-1',{supervisor:'manager'}),person('peer','department-1',{supervisor:'different'}),person('driver','department-2'),person('new','department-1',{status:'Onboarding',supervisor:'manager'})];
 const blobs=new Map();
 globalThis.schoolTestBucket={put:async(k,b)=>blobs.set(k,b),delete:async k=>blobs.delete(k),get:async k=>blobs.has(k)?{size:blobs.get(k).byteLength,body:blobs.get(k)}:null};t.after(()=>delete globalThis.schoolTestBucket);
 const fake=new Map([['next/server','export const NextResponse=Response;'],['@/lib/finance/server','export const allRecords=async()=>globalThis.schoolTestPeople;'],['@/db/finance','export const financeDb=()=>globalThis.schoolTestDb;export const financeFiles=()=>globalThis.schoolTestBucket;'],['seed','export const seedCourses=[];']]);
 await build({entryPoints:{cover:'app/api/school/cover/route.ts',school:'app/api/school/route.ts',cert:'app/api/school/certificate/route.ts',source:'app/api/school/source/route.ts',personnel:'app/api/school/personnel/route.ts'},outdir:temp,outExtension:{'.js':'.mjs'},bundle:true,format:'esm',platform:'node',plugins:[{name:'school-services',setup(b){b.onResolve({filter:/^(next\/server|@\/lib\/finance\/server|@\/db\/finance)$/},a=>({path:a.path,namespace:'fake'}));b.onResolve({filter:/^\.\/seeds$/},a=>a.importer.endsWith('/school/server.ts')?{path:'seed',namespace:'fake'}:undefined);b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:fake.get(a.path)}));}}]});
 const [api,cert,source,personnel,cover]=await Promise.all(['school','cert','source','personnel','cover'].map(n=>import(pathToFileURL(join(temp,n+'.mjs')).href)));
 function req(who,body,path='/api/school'){return new Request('https://test.invalid'+path,{method:body?'POST':'GET',headers:{origin:'https://test.invalid','content-type':'application/json','oai-authenticated-user-email':who+'@example.net'},...(body?{body:JSON.stringify(body)}:{})});}
 async function post(who,b,status=200){const r=await api.POST(req(who,b)),x=await r.json();assert.equal(r.status,status,JSON.stringify({who,action:b.action,x}));return x;}
 async function get(who){const r=await api.GET(req(who));const x=await r.json();assert.equal(r.status,200,JSON.stringify(x));return x;}
 const q={id:'q',type:'choice',prompt:'Which action is required?',options:['Approved action','Other action'],correctIndex:0,answer:'private answer',explanation:'Use the approved process.',points:10};
 const lesson={id:'read',title:'Read the Process',kind:'reading',body:'Follow the documented process and ask a supervisor when uncertain.',questions:[],passingScore:80,maxAttempts:1,dripDays:0,requiresPrevious:true};
 const course={id:'course-test',version:0,title:'Dispatch Process',description:'Training',topic:'Dispatch',status:'Published',departmentIds:['department-1'],allDepartments:false,crossTraining:false,requiredOnboarding:true,policyIds:[],lessons:[lesson,{...lesson,id:'quiz',title:'Quiz',kind:'quiz',questions:[q]}]};
 let saved,attempt;
 await t.test('authoring and data are scoped; questions have no keys for learners',async()=>{
  await post('learner',{action:'save-course',course},403);
  saved=(await post('manager',{action:'save-course',course})).course;
  const view=await get('learner'),c=view.courses.find(c=>c.id===course.id);assert.ok(c);assert.equal(c.lessons[1].questions[0].correctIndex,undefined);assert.equal(c.lessons[1].questions[0].answer,undefined);assert.equal(c.lessons[1].questions[0].explanation,undefined);assert.ok(!(await get('driver')).courses.some(c=>c.id===course.id));
  assert.equal((await get('manager')).viewer.canSeeAllScores,false);assert.ok(!(await get('manager')).people.some(p=>p.id==='driver'));
  assert.ok((await get('new')).courses.some(c=>c.id===course.id));
 });
 await t.test('private staging, first draft, current cover only, exact course audience, removal and branded accents',async()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABwAAAAUCAIAAAARPMquAAAAIUlEQVR4nGNcoBHAQG3ARHUTRw0dNXTU0FFDRw0dgYYCAM1dAUDDd4MrAAAAAElFTkSuQmCC','base64');
  async function upload(who,bytes=png,mime='image/png',cid=''){
   const f=new FormData();f.set('file',new File([bytes],'test.png',{type:mime}));if(cid)f.set('courseId',cid);
   return cover.POST(new Request('https://test.invalid/api/school/cover',{method:'POST',headers:{origin:'https://test.invalid','oai-authenticated-user-email':who+'@example.net'},body:f}));
  }
  const read=(who,id)=>cover.GET(req(who,null,'/api/school/cover?id='+id));
  assert.equal((await upload('learner')).status,403);assert.equal((await upload('manager',Buffer.from('<svg/>'))).status,400);assert.equal((await upload('manager',png,'image/jpeg')).status,400);
  let response=await upload('manager');assert.equal(response.status,200);const first=(await response.json()).id;
  assert.equal((await read('learner',first)).status,404);assert.equal((await read('manager',first)).status,200);
  const base={id:'test-covered-course',version:0,title:'Cover Test',topic:'Dispatch',status:'Draft',departmentIds:['department-1'],allDepartments:false,lessons:[{id:'r',title:'Learn',kind:'reading',body:'Sample content',questions:[]}]};
  await post('jerson',{action:'save-course',course:{...base,coverMediaId:first}},403);
  let {course:c}=await post('manager',{action:'save-course',course:{...base,coverStyle:'field',coverAccent:'gold',coverMediaId:first}});
  assert.equal(c.coverMediaId,first);assert.equal((await read('learner',first)).status,403);
  ({course:c}=await post('manager',{action:'save-course',course:{...c,status:'Published'}}));
  const image=await read('learner',first);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
  assert.equal((await get('learner')).courses.find(k=>k.id===c.id).coverAccent,'gold');assert.equal((await read('driver',first)).status,403);
  const second=(await (await upload('manager',png,'image/png',c.id)).json()).id;
  await post('manager',{action:'save-course',course:{...base,id:'unrelated',coverMediaId:second}},403);
  ({course:c}=await post('manager',{action:'save-course',course:{...c,coverMediaId:second,coverAccent:'mint'}}));
  assert.equal((await read('learner',first)).status,404);assert.equal((await read('learner',second)).status,200);
  ({course:c}=await post('manager',{action:'save-course',course:{...c,coverMediaId:'',coverAccent:''}}));
  assert.equal(c.coverMediaId,undefined);assert.equal(c.coverAccent,undefined);assert.equal(c.coverStyle,'field');assert.equal((await read('manager',second)).status,404);assert.equal(blobs.size,0);
 });
 await t.test('SOP virtual quizzes respect the true published audience after DTO sanitization',async()=>{
  const policy={id:'DSP-TEST',code:'DSP-TEST',topicId:'DSP',version:1,etag:1,status:'Published',audience:{all:false,departments:['department-1'],levels:[],people:[]},content:{title:'Dispatch Handoff',shortName:'Handoff',policyOwner:'Dispatch',revision:'1',preparedDate:'2026-11-01',effectiveDate:'2026-11-01',approvalStatus:'Published',keywords:'handoff',sections:[{heading:'Shift Handoff',text:'Record the unresolved issue, assign its next responsible person, and communicate the next required action before ending the shift.'}],relatedIds:[]},updatedAt:'2026-11-01T12:00:00Z',updatedBy:'Instructor'};
  db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run('DSP-TEST|1','DSP-TEST','Published',JSON.stringify(policy));
  db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run('DSP-TEST|2','DSP-TEST','Draft',JSON.stringify({...policy,version:2,status:'Draft',content:{...policy.content,title:'Draft revision'}}));
  const ownerCourses=(await get('jerson')).courses;assert.ok(ownerCourses.some(c=>c.policyBundle&&c.policyIds.includes('DSP-TEST')&&c.status==='Published'));assert.ok(ownerCourses.some(c=>c.policyBundle&&c.policyIds.includes('DSP-TEST')&&c.status==='Draft'));
  const c=(await get('learner')).courses.find(c=>c.policyBundle&&c.policyIds.includes('DSP-TEST'));assert.ok(c,'sanitized policy audience must not hide assigned SOP course');assert.equal(c.status,'Published');assert.ok(c.lessons[0].body.includes(policy.content.sections[0].text));assert.ok(c.lessons[0].body.includes('Shift Handoff'));assert.equal(c.lessons.at(-1).questions[0].answer,undefined);assert.ok(!(await get('driver')).courses.some(c=>c.policyIds.includes('DSP-TEST')));
 });
 await t.test('role-specific bundles and department generation never grant policy access to ordinary staff',async()=>{
  const policy={id:'ROLE-TEST',code:'ROLE-TEST',topicId:'DSP',version:1,etag:1,status:'Published',audience:{all:false,departments:[],levels:['Manager'],people:[]},content:{title:'Manager Review',shortName:'Review',policyOwner:'Operations',revision:'1',preparedDate:'',effectiveDate:'',approvalStatus:'Published',keywords:'',sections:[{heading:'Required review',text:'Review the documented facts and confirm the authorized next action before directing the team.'},{heading:'Restricted management attachment',text:'NEVER-APPEARS-IN-TRAINING',visibility:'management'}],relatedIds:[]},updatedAt:'2026-11-01T12:00:00Z',updatedBy:'Instructor'};
  db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run('ROLE-TEST|1','ROLE-TEST','Published',JSON.stringify(policy));
  const managerCourses=(await get('manager')).courses,role=managerCourses.find(c=>c.policyBundle&&c.policyIds.includes(policy.id));assert.ok(role);assert.ok(!JSON.stringify(role).includes('NEVER-APPEARS-IN-TRAINING'));
  assert.ok(!(await get('learner')).courses.some(c=>c.policyIds.includes(policy.id)));
  const created=await post('manager',{action:'generate-sop',policyIds:[policy.id],publish:true});assert.equal(created.generated,1);
  const scoped=(await get('manager')).courses.find(c=>c.id===created.courseIds[0]);assert.equal(scoped.policyBundle.departmentId,'department-1');assert.equal(scoped.canEdit,true);
  await post('manager',{action:'assign',courseId:scoped.id,personIds:['learner']},400);
  assert.ok(!(await get('learner')).courses.some(c=>c.id===scoped.id));
 });
 await t.test('complete policy groups preserve legacy history and require a whole-course final assessment',async()=>{
  const common=(id,topicId)=>({id,code:id,topicId,version:1,etag:1,status:'Published',audience:{all:true,departments:[],levels:[],people:[]},content:{title:'Training '+id,shortName:id,policyOwner:'Operations',revision:'1',preparedDate:'2026-11-01',effectiveDate:'2026-11-01',approvalStatus:'Published',keywords:'training',sections:[{heading:'Required Actions',text:'Check the current record, confirm responsibility, and communicate unresolved facts before handing this task to the next employee.'}],relatedIds:[]},updatedAt:'2026-11-01T12:00:00Z',updatedBy:'Instructor'});
  const sources=[common('TRAIN-A','TEST-WORKPLACE'),common('TRAIN-B','TEST-WORKPLACE'),common('TRAIN-C','TEST-SAFETY')];
  for(const policy of sources)db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run(policy.id+'|1',policy.id,'Published',JSON.stringify(policy));
  const p=sources[0],oldQuestion={id:'policy-q-0',prompt:'According to '+p.code+', explain the required action or standard for “Required Actions”. Include the relevant steps or responsibilities.',type:'text',options:[],answer:p.content.sections[0].text,explanation:'Review '+p.code+' · Required Actions.',points:5,source:p.code+' v1 · Required Actions'};
  const oldReading={id:'read-policy',title:p.code+' · Read the Policy',kind:'reading',body:'Required Actions\n\n'+p.content.sections[0].text,source:p.code+' v1',questions:[],passingScore:80,maxAttempts:3,dripDays:0,requiresPrevious:true};
  const oldExam={id:'policy-exam',title:'Apply the Policy',kind:'quiz',body:'Use the policy to explain the steps you would take. Your instructor will score the response and leave feedback.',questions:[oldQuestion],passingScore:80,maxAttempts:3,dripDays:0,requiresPrevious:true};
  const legacyId='policy-course-'+p.id,oldState={id:'state:'+legacyId+':learner',kind:'state',personId:'learner',courseId:legacyId,version:1,generation:1,enrolledAt:'2026-11-01T00:00:00Z',completedLessonIds:['read-policy'],courseVersion:0,fingerprint:JSON.stringify([{[p.id]:1},[oldReading,oldExam].map(l=>[l.id,l.kind,l.body,l.mediaId,l.mediaUrl,l.questions.map(q=>[q.id,q.prompt,q.type,q.options,q.points])])])};
  const oldAttempt={id:'legacy-policy-pass',kind:'attempt',version:1,courseId:legacyId,courseTitle:p.content.title+' · Policy Review',lessonId:'policy-exam',lessonTitle:'Apply the Policy',personId:'learner',generation:1,courseVersion:0,status:'Passed',startedAt:'2026-11-01T01:00:00Z',submittedAt:'2026-11-01T02:00:00Z',gradedAt:'2026-11-01T03:00:00Z',gradedBy:'Instructor',score:100,passingScore:80,possiblePoints:5,earnedPoints:5,answers:{'policy-q-0':'I check the record and communicate the handoff.'},feedback:{'policy-q-0':{points:5,note:'Meets the policy.'}},questions:[oldQuestion]};
  for(const row of [oldState,oldAttempt])db.prepare('INSERT INTO school_records(id,kind,person_id,course_id,version,payload,updated_at) VALUES(?,?,?,?,?,?,?)').run(row.id,row.kind,row.personId,row.courseId,row.version,JSON.stringify(row),'2026-11-01');
  const initial=await get('learner'),legacy=initial.courses.find(c=>c.id===legacyId),bundle=initial.courses.find(c=>c.policyBundle?.group==='all-staff'&&c.policyIds.includes('TRAIN-A'));
  assert.equal(legacy.catalogHidden,true);assert.equal(legacy.available,false);assert.equal(legacy.progress.percent,100);assert.ok(initial.completions.some(c=>c.courseId===legacyId));assert.equal(bundle.progress.percent,0);
  assert.deepEqual(bundle.policyIds,['TRAIN-A','TRAIN-B','TRAIN-C']);assert.equal(bundle.lessons.at(-1).questions.length,3);
  assert.equal((await cert.GET(req('learner',null,'/api/school/certificate?courseId='+legacyId))).status,200);
  const generated=await post('jerson',{action:'generate-sop',policyIds:['TRAIN-A'],publish:true});assert.ok(generated.generated>=1);
  const savedBundle=(await get('jerson')).courses.find(c=>c.id===bundle.id);assert.deepEqual(savedBundle.policyIds,bundle.policyIds);
  const again=await post('jerson',{action:'generate-sop',policyIds:['TRAIN-A'],publish:true});assert.equal(again.generated,0);assert.equal(again.existing,generated.generated);
  const final=savedBundle.lessons.at(-1);
  await post('jerson',{action:'save-course',course:{...savedBundle,lessons:[...savedBundle.lessons.slice(0,-1),{...final,questions:final.questions.slice(0,1)}]}},400);
  await post('learner',{action:'start-attempt',courseId:bundle.id,lessonId:final.id},400);
  await post('learner',{action:'enroll',courseId:bundle.id});
  for(const reading of bundle.lessons.slice(0,-1))await post('learner',{action:'complete-lesson',courseId:bundle.id,lessonId:reading.id});
  assert.equal((await get('learner')).courses.find(c=>c.id===bundle.id).progress.completedAt,undefined);
  assert.equal((await cert.GET(req('learner',null,'/api/school/certificate?courseId='+bundle.id))).status,400);
  const started=await post('learner',{action:'start-attempt',courseId:bundle.id,lessonId:final.id});
  const submitted=await post('learner',{action:'submit-attempt',attemptId:started.attempt.id,answers:Object.fromEntries(final.questions.map(q=>[q.id,'I verify the facts, follow the policy steps, and record the next responsible person.']))});assert.equal(submitted.attempt.status,'Awaiting Review');
  assert.ok(!(await get('learner')).completions.some(c=>c.courseId===bundle.id));
  const graded=await post('jerson',{action:'grade-attempt',attemptId:started.attempt.id,version:submitted.attempt.version,feedback:Object.fromEntries(final.questions.map(q=>[q.id,{points:q.points,note:'Applies the complete policy.'}])),reason:'Reviewed every policy scenario against its full rubric'});assert.equal(graded.attempt.status,'Passed');
  assert.ok((await get('learner')).completions.some(c=>c.courseId===bundle.id));assert.equal((await cert.GET(req('learner',null,'/api/school/certificate?courseId='+bundle.id))).status,200);
  const snapshot=JSON.parse(db.prepare('SELECT payload FROM school_records WHERE id=?').get('state:'+bundle.id+':learner').payload);assert.ok(snapshot.courseSnapshot);assert.match(snapshot.fingerprint,/^policy-course-v1:/);
  assert.equal(db.prepare('SELECT payload FROM school_records WHERE id=?').get(oldState.id).payload,JSON.stringify(oldState));assert.equal(db.prepare('SELECT payload FROM school_records WHERE id=?').get(oldAttempt.id).payload,JSON.stringify(oldAttempt));
  // A new source edition produces a distinct course while the saved completion is still printable.
  const next={...sources[2],version:2,content:{...sources[2].content,sections:[...sources[2].content.sections,{heading:'New requirement',text:'Confirm the additional handoff detail before closing the task.'}]}};
  db.prepare('UPDATE sop_versions SET status=?,payload=? WHERE key=?').run('Archived',JSON.stringify({...sources[2],status:'Archived'}),'TRAIN-C|1');
  db.prepare('INSERT INTO sop_versions(key,policy_id,status,payload) VALUES(?,?,?,?)').run('TRAIN-C|2','TRAIN-C','Published',JSON.stringify(next));
  const updated=await get('learner'),current=updated.courses.find(c=>c.policyBundle?.group==='all-staff'&&c.policyIds.includes('TRAIN-A')&&!c.catalogHidden);assert.notEqual(current.id,bundle.id);assert.equal(current.progress.percent,0);assert.ok(updated.completions.some(c=>c.courseId===bundle.id));assert.equal((await cert.GET(req('learner',null,'/api/school/certificate?courseId='+bundle.id))).status,200);
 });
 await t.test('whole-course authoring accepts complete material above the old generic payload limit',async()=>{
  const large={...course,id:'large-complete-course',status:'Draft',lessons:[{...lesson,body:'Full employee policy material. '.repeat(16000)}]};
  const saved=await post('manager',{action:'save-course',course:large});assert.equal(saved.course.lessons[0].body,large.lessons[0].body.trim());
 });
 await t.test('enrollment, sequencing, retry protection and PDF certificate work end to end',async()=>{
  await post('learner',{action:'start-attempt',courseId:course.id,lessonId:'quiz'},400);
  await post('learner',{action:'enroll',courseId:course.id});await post('learner',{action:'complete-lesson',courseId:course.id,lessonId:'read'});
  const starts=await Promise.all([api.POST(req('learner',{action:'start-attempt',courseId:course.id,lessonId:'quiz'})),api.POST(req('learner',{action:'start-attempt',courseId:course.id,lessonId:'quiz'}))]);assert.deepEqual(starts.map(r=>r.status).sort(),[200,409]);
  attempt=(await get('learner')).attempts.find(a=>a.courseId===course.id);assert.equal(attempt.questions[0].correctIndex,undefined);
  const result=await post('learner',{action:'submit-attempt',attemptId:attempt.id,answers:{q:'0'}});assert.equal(result.attempt.score,100);assert.equal(result.attempt.status,'Passed');attempt=result.attempt;
  await post('learner',{action:'start-attempt',courseId:course.id,lessonId:'quiz'},400);
  const response=await cert.GET(req('learner',undefined,'/api/school/certificate?courseId='+course.id+'&score=1'));assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.equal(new TextDecoder().decode((await response.arrayBuffer()).slice(0,4)),'%PDF');
  const denied=await cert.GET(req('driver',undefined,'/api/school/certificate?courseId='+course.id+'&personId=learner'));assert.equal(denied.status,403);
 });
 await t.test('manager grading, voiding and reset are audited and invalidate certificate',async()=>{
  await post('learner',{action:'void-attempt',attemptId:attempt.id,version:attempt.version,reason:'Test'},403);
  await post('manager',{action:'void-attempt',attemptId:attempt.id,version:attempt.version,reason:'Answer key correction'});
  const response=await cert.GET(req('learner',undefined,'/api/school/certificate?courseId='+course.id));assert.equal(response.status,400);
  await post('manager',{action:'reset',courseId:course.id,personId:'learner',reason:'Instructor approved a fresh attempt'});
  assert.equal((await get('learner')).courses.find(c=>c.id===course.id).progress.percent,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM school_audit WHERE action='void-attempt' AND reason='Answer key correction'").get().n,1);
  assert.equal((await get('learner')).attempts.find(a=>a.id===attempt.id).status,'Voided');
 });
 await t.test('text quiz stays pending until authorized instructor grades it',async()=>{
  const manual={...course,id:'manual-test',lessons:[{...lesson,id:'essay',title:'Scenario Review',kind:'quiz',questions:[{id:'text-q',type:'text',prompt:'Explain the handoff.',options:[],answer:'Private rubric',points:5}]}]};
  await post('manager',{action:'save-course',course:manual});const start=await post('learner',{action:'start-attempt',courseId:manual.id,lessonId:'essay'});const sent=await post('learner',{action:'submit-attempt',attemptId:start.attempt.id,answers:{'text-q':'I record the issue and notify the next responsible employee.'}});assert.equal(sent.attempt.status,'Awaiting Review');
  await post('learner',{action:'grade-attempt',attemptId:start.attempt.id,version:sent.attempt.version,feedback:{'text-q':{points:5,note:'Excellent'}},reason:'Review'},403);
  const graded=await post('manager',{action:'grade-attempt',attemptId:start.attempt.id,version:sent.attempt.version,feedback:{'text-q':{points:5,note:'Correct escalation and ownership.'}},reason:'Scenario reviewed against the rubric'});assert.equal(graded.attempt.status,'Passed');assert.equal(graded.attempt.score,100);
 });
 await t.test('private source and personnel routes reject other departments',async()=>{
  const response=await source.GET(req('driver',undefined,'/api/school/source?courseId=account-manager-field-guide&asset=guide.pdf'));assert.equal(response.status,403);
  const p=await personnel.GET(req('driver',undefined,'/api/school/personnel?personId=learner'));assert.equal(p.status,403);
  const mine=await personnel.GET(req('learner',undefined,'/api/school/personnel?personId=learner'));assert.equal(mine.status,200);assert.ok((await mine.json()).completions.some(c=>c.courseId==='manual-test'));
 });
});
