import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';

test('corrective action PDF responses enforce personnel authority in catalog, original sources, downloads, preview and onboarding',async t=>{
 const db=new DatabaseSync(':memory:');const temp=await mkdtemp(join(tmpdir(),'corrective-pdf-'));
 t.after(async()=>{db.close();await rm(temp,{recursive:true,force:true});delete globalThis.testCorrectiveDb;delete globalThis.testCorrectiveRoster;});
 for(const name of ['0012_sop_catalog','0013_sop_version_storage','0014_sop_signatures','0015_hr_job_descriptions','0016_sop_policy_opens'])
   db.exec(await readFile('drizzle/'+name+'.sql','utf8'));
 const grants=[{module:'SOP Library',tab:'library',level:'View'},{module:'SOP Library',tab:'workflow',level:'Edit'}];
 function person(id,tier,status='Active',access=[]){return {id,kind:'person',name:id,email:id+'@example.net',role:'Employee',workerType:'Employee',authorityLevel:tier,
   accessMode:'Custom',departmentId:'ops',department:'Operations',status,access};}
 globalThis.testCorrectiveRoster=[{id:'ops',kind:'department',name:'Operations'},person('worker','Coordinator'),
   person('editor','Coordinator','Active',grants),person('chief','Manager','Active',grants),person('lineManager','Manager'),person('hire','Coordinator','Onboarding'),person('hiredManager','Manager','Onboarding'),
   person('former','Manager','Former',grants)];
 globalThis.testCorrectiveDb={prepare(sql){const q=db.prepare(sql);return {args:[],bind(...v){this.args=v;return this;},all(){return {results:q.all(...this.args)};},first(){return q.get(...this.args);}};}};
 const id='HR-CA-001',now='2026-11-01T15:00:00.000Z';
 const originals=JSON.parse(await readFile('lib/sop/private/catalog.json','utf8'));
 const src=originals.find(x=>x.id===id);
 const contents={...src.content,policyOwner:'INTERNAL_OWNER_SENTINEL',keywords:'INTERNAL_KEYWORD_SENTINEL',relatedIds:['MGT-015'],sections:[
   {heading:'Conduct Standard',text:'Employee visible attendance standard.',visibility:'employee'},
   {heading:'Typical Consequences',text:'Employee visible corrective range.',visibility:'employee'},
   {heading:'Procedure',text:'Confidential review sequence sentinel.',visibility:'management'},
   {heading:'Escalation Protocol',text:'Unclassified secret section sentinel.',visibility:'employee'},
 ]};
 const p={id,topicId:'HR-CA',code:id,version:1,etag:1,status:'Published',audience:{all:true,departments:[],levels:[],people:[]},
   content:contents,updatedAt:now,updatedBy:'Authorized Publisher',requireOnboardingSignature:true,
   publication:{signerName:'Authorized Publisher',publishedAt:now,personId:'restricted-actor',accountId:'restricted-account'},
   pdfEdition:{topicLabel:'INTERNAL_TOPIC_SENTINEL',related:[{reference:'MGT-015',title:'Private reference title sentinel.'}]},
   originalPdf:true,originalReference:id};
 db.prepare('INSERT INTO sop_entries VALUES(?,1,?)').run(id,'1');
 db.prepare('INSERT INTO sop_versions VALUES(?,?,?,?)').run(id+'|1',id,'Published',JSON.stringify(p));
 // Include a real imported mixed-content document as well as the intentionally hostile fixture.
 const second=originals.find(x=>x.id==='HR-CA-002'),real={...p,id:second.id,code:second.id,originalReference:second.id,
   content:{...second.content,approvalStatus:'Published'}};
 db.prepare('INSERT INTO sop_entries VALUES(?,1,?)').run(second.id,'1');
 db.prepare('INSERT INTO sop_versions VALUES(?,?,?,?)').run(second.id+'|1',second.id,'Published',JSON.stringify(real));
 const fake=new Map([['next/server','export const NextResponse=Response;'],['@/db/finance','export const financeDb=()=>globalThis.testCorrectiveDb;'],
   ['@/lib/finance/server','export const allRecords=async()=>globalThis.testCorrectiveRoster;']]);
 const out=join(temp,'pdf.cjs');await build({entryPoints:['app/api/sop/pdf/route.ts'],outfile:out,bundle:true,platform:'node',format:'cjs',logLevel:'silent',
   plugins:[{name:'service-fixture',setup(b){b.onResolve({filter:/^(next\/server|@\/db\/finance|@\/lib\/finance\/server)$/},a=>({path:a.path,namespace:'services'}));
   b.onLoad({filter:/.*/,namespace:'services'},a=>({contents:fake.get(a.path)}));}}]});
 const {GET}=createRequire(import.meta.url)(out);
 // PDF.js text extraction needs no canvas. Use the same vetted PDF parser shipped to the application.
 globalThis.DOMMatrix??=class DOMMatrix {};
 const sdk=await import('../../public/vendor/sop-pdfjs/5.6.205/pdf.min.js');
 sdk.GlobalWorkerOptions.workerSrc=new URL('../../public/vendor/sop-pdfjs/5.6.205/pdf.worker.min.js',import.meta.url).href;
 const request=(who,q='',target=id)=>GET(new Request('https://test.invalid/api/sop/pdf?id='+target+'&version=1'+q,{headers:{'oai-authenticated-user-email':who+'@example.net'}}));
 async function getPdf(who,q='',target=id){
  const res=await request(who,q,target);assert.equal(res.status,200,res.status!==200?await res.text():'');assert.equal(res.headers.get('content-type'),'application/pdf');
  assert.match(res.headers.get('cache-control'),/private.*no-store/);
  const pdf=await sdk.getDocument({data:new Uint8Array(await res.arrayBuffer()),isEvalSupported:false,useSystemFonts:false}).promise;
  let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);text+=(await page.getTextContent()).items.map(x=>x.str||'').join(' ')+'\n';}
  const {info}=await pdf.getMetadata();await pdf.destroy();return {text,info,filename:res.headers.get('content-disposition')};
 }
 const safe=async(who,q)=>{
  const {text,info,filename}=await getPdf(who,q);
  assert.match(filename,/employee-guide\.pdf/);assert.match(text,/Employee visible attendance standard/);assert.match(text,/Employee visible corrective range/);
  assert.match(text,/Employee Guide/);assert.match(text,/Last Revised By: Authorized Publisher/);assert.match(text,/Nov 1, 2026/);
  assert.doesNotMatch(text+JSON.stringify(info),/Confidential review sequence|Unclassified secret section|Private reference title|INTERNAL_(TOPIC|OWNER|KEYWORD)_SENTINEL|Management Guide|restricted-account/i);
 };
 for(const [who,q] of [['worker',''],['editor','&download=1'],['chief','&edition=employee'],['hire','&onboarding=1']])await safe(who,q);
 for(const [who,q] of [['chief',''],['lineManager',''],['hiredManager','&onboarding=1']]){
  const {text,info,filename}=await getPdf(who,q);assert.match(filename,/management-guide\.pdf/);
  assert.match(text,/Employee visible attendance standard/);assert.match(text,/Confidential review sequence sentinel/);assert.match(text,/Unclassified secret section sentinel/);
  assert.match(text,/MANAGEMENT GUIDE/);assert.match(text,/Last Revised By: Authorized Publisher/);assert.match(info.Subject,/Management/);
  assert.doesNotMatch(text,/Private reference title sentinel/);
 }
 for(const [who,q] of [['worker','&source=1'],['worker','&edition=management'],['worker','&download=1'],['editor','&source=1'],['editor','&edition=management&download=1'],
   ['chief','&source=1&edition=employee'],['lineManager','&source=1'],['lineManager','&download=1'],['hire','&onboarding=1&source=1'],['hire','&onboarding=1&edition=management'],['former','&source=1']])
   assert.equal((await request(who,q)).status,403,who+' '+q);
 const employeeCopy=await getPdf('worker','',second.id),managementCopy=await getPdf('chief','',second.id);
 const normalized=s=>s.replace(/\s+/g,' ').trim();
 const reviewed=JSON.parse(await readFile('lib/sop/private/corrective-employee-guides.json','utf8'))[second.id];
 for(const copy of [employeeCopy,managementCopy]){
   assert.ok(normalized(copy.text).includes(normalized(reviewed.conduct).slice(0,48)));
   assert.ok(normalized(copy.text).includes(normalized(reviewed.consequences).slice(0,48)));
 }
 assert.doesNotMatch(employeeCopy.text,/Management Decision Guidance|Compare the current facts|Normal Category & Usual Starting Response/i);
 assert.match(managementCopy.text,/Management Decision Guidance/);assert.match(managementCopy.text,/Compare the current facts/);
 const raw=await request('chief','&source=1');assert.equal(raw.status,200);assert.match(raw.headers.get('content-disposition'),/original-source/);
 assert.ok((await raw.arrayBuffer()).byteLength>50000);
 const unreviewed={...p,content:{...p.content,sections:[{heading:'Procedure',text:'A historical draft whose public standards have not been reviewed.'}]}};
 db.prepare('UPDATE sop_versions SET payload=? WHERE key=?').run(JSON.stringify(unreviewed),id+'|1');
 assert.equal((await request('worker')).status,409);assert.equal((await request('hire','&onboarding=1')).status,409);
});
