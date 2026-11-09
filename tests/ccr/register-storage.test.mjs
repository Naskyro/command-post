import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
test('CCR: tab and current assignee scope, signed edits, immutable evidence and isolated encrypted register history',async t=>{
 const sql=new DatabaseSync(':memory:'),bucket=new Map(),tmp=await mkdtemp(join(tmpdir(),'ccr-reg-'));
 t.after(async()=>{sql.close();delete globalThis.ccrTestFixture;await rm(tmp,{recursive:true,force:true});});
 const db={prepare(s){const q=sql.prepare(s);let a=[];return {bind(...v){a=v;return this;},async first(){return q.get(...a)||null;},async all(){return {results:q.all(...a)};},async run(){return {meta:{changes:q.run(...a).changes}};}};},async batch(ss){return Promise.all(ss.map(s=>s.run()));}};
 const r2={async put(k,b){bucket.set(k,new Uint8Array(b));},async get(k){return bucket.has(k)?{arrayBuffer:async()=>bucket.get(k).slice().buffer}:null;},async delete(k){bucket.delete(k);}};
 const ccr='Compliance, Claims & Recovery',grant=(tab,level='Edit')=>({module:ccr,tab,level});
 const viewers=Object.fromEntries(Object.entries({lead:['command','calendar','tdlr','recovery','legal','evidence'],a:['command','tdlr'],b:['tdlr','calendar'],reader:['tdlr'],blocked:[]}).map(([k,tabs])=>[k,{person:k,name:k,id:'session:'+k,role:k==='lead'?'Department Head':'Employee',department:'Dispatch',owner:false,email:'',access:tabs.map(tab=>grant(tab,k==='reader'?'View':'Edit'))}]));
 const staff=Object.values(viewers).map(v=>({id:v.person,name:v.name,kind:'person',version:1,status:'Active',role:v.role,accessMode:'Custom',access:v.access}));
 globalThis.ccrTestFixture={db,r2,staff,viewers,key:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')};
 const f=new Map([['@/lib/accounts/server','export const claimChoiceRows=async()=>[{id:"account-1",kind:"account",name:"Canonical Property",status:"Active"},{id:"account:nexuseast",kind:"account",name:"Nexus East",status:"Active"}];'],['@/db/finance','export const financeDb=()=>globalThis.ccrTestFixture.db,financeFiles=()=>globalThis.ccrTestFixture.r2;'],['cloudflare:workers','export const env={ get HR_DATA_ENCRYPTION_KEY(){return globalThis.ccrTestFixture.key} }'],['@/lib/finance/server','export const allRecords=async()=>globalThis.ccrTestFixture.staff,requestRoster=allRecords,identify=(_,h)=>globalThis.ccrTestFixture.viewers[h.get("x-test-viewer")];'],['next/server','export const NextResponse={json:Response.json};']]);
 await build({entryPoints:{square:'app/api/ccr/register/import-square/route.ts',api:'app/api/ccr/register/route.ts',file:'app/api/ccr/register/file/route.ts',index:'app/api/ccr/register/evidence-index/route.ts',server:'lib/ccr/register-server.ts'},outdir:tmp,bundle:true,format:'esm',platform:'node',outExtension:{'.js':'.mjs'},plugins:[{name:'private-fixture',setup(b){b.onResolve({filter:/.*/},a=>f.has(a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({namespace:'fixture',filter:/.*/},a=>({contents:f.get(a.path)}));}}]});
 const [api,file,server,index,square]=await Promise.all(['api','file','server','index','square'].map(x=>import(pathToFileURL(join(tmp,x+'.mjs')).href)));
 const req=(actor,path,body,origin='https://fixture.invalid')=>{const url=new URL(path,'https://fixture.invalid');const r=new Request(url,{method:body?'POST':'GET',headers:{'x-test-viewer':actor,origin,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});Object.defineProperty(r,'nextUrl',{value:url});return r;};
 const get=async(a,s)=>api.GET(req(a,'/?section='+s));const post=async(a,b)=>api.POST(req(a,'/',b));
 const base={section:'tdlr',version:0,title:'Observed Notice',category:'Agency Complaint',status:'Open',reference:'Private 732',ownerId:'a',dueOn:'2027-02-06',nextAction:'Prepare response',steps:[],note:'Executive note'};
 // Existing databases without the additive migration recover on first authorized access only.
 assert.equal((await get('blocked','tdlr')).status,403);assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='ccr_register_versions'").get().n,0);
 const createdRes=await post('lead',base);assert.equal(createdRes.status,200,await createdRes.clone().text());const c=await createdRes.json();assert.equal(c.updatedBy,'lead');assert.ok(c.id);assert.equal(c.history[0].note,base.note);assert.ok(!('createdPerson' in c));
 // When deployment later applies the migration there are no duplicate-table errors.
 sql.exec(await readFile('drizzle/0025_ccr_registers.sql','utf8'));assert.doesNotMatch(sql.prepare('SELECT payload FROM ccr_register_versions').get().payload,/Private 732|Executive note|Observed Notice/);
 assert.equal((await (await get('a','tdlr')).json()).rows.length,1);assert.equal((await (await get('b','tdlr')).json()).rows.length,0);assert.equal((await get('a','recovery')).status,403);
 assert.equal((await post('reader',{...base,id:c.id,version:1})).status,403);assert.equal((await post('b',{...base,id:c.id,version:1})).status,404);
 assert.equal((await post('a',{...base,id:c.id,version:1,status:'Closed'})).status,403);
 assert.equal((await post('lead',{...base,id:c.id,version:1,status:'Closed',note:''})).status,400);
 const corrupt=await api.POST(req('lead','/',base,'https://attacker.invalid'));assert.equal(corrupt.status,403);
 let res=await post('a',{...base,id:c.id,version:1,steps:['Complaint Notice Indexed'],note:'Clarification',updatedBy:'forged',files:[{id:'FAKE'}],history:[]});assert.equal(res.status,200);let r=await res.json();assert.equal(r.version,2);assert.equal(r.updatedBy,'a');assert.equal(r.files.length,0);assert.equal(r.history.length,2);
 assert.equal((await post('a',{...base,id:c.id,version:1,note:'Stale'})).status,409);
 const upload=(actor,version,contents='%PDF-1.5\nTest\n%%EOF',name='notice.pdf',documentType='Opening Letter to Respondent',other='')=>{const fd=new FormData();fd.set('section','tdlr');fd.set('id',c.id);if(documentType)fd.set('documentType',documentType);if(other)fd.set('otherDocumentType',other);fd.set('version',String(version));fd.set('file',new File([contents],name,{type:'application/pdf'}));return file.POST(req(actor,'/file',fd));};
 assert.equal((await upload('b',2)).status,404);assert.equal((await upload('a',2,'<html>','x.pdf')).status,400);
 assert.equal((await upload('a',2,undefined,undefined,'')).status,400);
 assert.equal((await upload('a',2,undefined,undefined,'Cash Repayment Receipt')).status,400);
 assert.equal((await upload('a',2,undefined,undefined,'Other')).status,400);
 assert.equal(bucket.size,0);
 const ack=await upload('a',2);assert.equal(ack.status,200,await ack.clone().text());r=await ack.json();assert.equal(r.version,3);assert.equal(r.files[0].by,'a');assert.equal(r.files[0].documentType,'Opening Letter to Respondent');assert.match(r.history.at(-1).note,/Opening Letter to Respondent/);assert.equal(bucket.size,1);assert.ok(!Buffer.from([...bucket.values()][0]).includes('%PDF'));assert.equal((await upload('a',2)).status,409);
 const path='/file?section=tdlr&id='+c.id+'&file='+r.files[0].id;assert.equal((await file.GET(req('b',path))).status,404);
 const doc=await file.GET(req('a',path));assert.equal(doc.status,200);assert.match(doc.headers.get('content-disposition'),/^attachment/);assert.equal(await doc.text(),'%PDF-1.5\nTest\n%%EOF');
 const sum=await (await api.GET(req('a','/?summary=1'))).json();assert.equal(sum.items.length,1);assert.deepEqual(sum.sections,['tdlr']);assert.doesNotMatch(JSON.stringify(sum),/Private 732|Executive note|notice\.pdf/);
 const tdlrSteps=['Complaint Notice Indexed','Response Deadline Recorded','Supporting Records Gathered','Response Submission Documented','Agency Disposition Recorded'];
 assert.equal((await post('lead',{...base,status:'Closed',steps:tdlrSteps,note:'Not created first'})).status,400);
 assert.equal((await post('lead',{...base,id:c.id,version:3,status:'Closed',note:'No documented steps'})).status,400);
 assert.equal((await post('lead',{...base,id:c.id,version:3,status:'Closed',steps:tdlrSteps,note:'Acknowledged only'})).status,400);
 const close=await post('lead',{...base,id:c.id,version:3,status:'Closed',tdlr:{stage:'Agency Disposition Received',decisionOn:'2026-11-01',outcome:'Closed Without Action',decisionRef:'Signed final agency letter ABC-42'},steps:tdlrSteps,ownerId:'b',note:'Closed by agency'});assert.equal(close.status,200);assert.equal((await server.registerEditions(viewers.a,staff)).length,0);assert.equal((await server.registerEditions(viewers.b,staff)).length,4);
 assert.equal((await file.GET(req('a',path))).status,404);assert.equal((await post('b',{...base,id:c.id,version:4,status:'Open',note:'Reopen'})).status,403);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM ccr_register_versions').get().n,4);
 const recovery={...base,section:'recovery',title:'Processor Case',category:'Chargeback',ownerId:'lead',amountCents:15200,steps:[],note:''};const rec=await post('lead',recovery);assert.equal(rec.status,200);const rr=await rec.json();
 const closeRec={...recovery,id:rr.id,version:1,status:'Closed',note:'Resolved and reconciled to receipt',steps:['Loss Documented','Supporting Records Gathered','Decision Reference Recorded','Communication Logged','Reconciliation Reference Recorded']};
 assert.equal((await post('lead',{...closeRec,files:[{id:'client-created'}]})).status,400);assert.equal((await post('lead',{...closeRec,resolutionReference:recovery.reference})).status,400);
 const ok=await post('lead',{...closeRec,resolutionReference:'Finance deposit DP-842/line 5'});assert.equal(ok.status,200);assert.equal((await ok.json()).history.at(-1).by,'lead');
 assert(!sql.prepare("SELECT name FROM sqlite_master WHERE name like 'finance%'").get());
 sql.exec('CREATE TABLE finance_audit(id TEXT,record_id TEXT,actor TEXT,actor_id TEXT,at TEXT,reason TEXT,before TEXT,after TEXT)');
 const evr=await post('lead',{...base,section:'evidence',ownerId:'lead',category:'Inspection Packet',title:'=privateFormula()',nextAction:'Hidden action',note:'Hidden private note'});assert.equal(evr.status,200);const ev=await evr.json();
 assert.equal((await index.POST(req('a','/export',{ids:[ev.id]}))).status,403);
 assert.equal((await index.POST(req('lead','/export',{ids:['out-of-scope']}))).status,403);
 const csv=await index.POST(req('lead','/export',{ids:[ev.id],values:['forged']}));assert.equal(csv.status,200,await csv.clone().text());
 const contents=await csv.text();assert.match(contents,/CONFIDENTIAL/);assert.match(contents,/'=privateFormula/);assert.doesNotMatch(contents,/Hidden action|Hidden private note|forged/);
 const audit=sql.prepare("SELECT * FROM finance_audit").get();assert.equal(audit.actor,'lead');assert.doesNotMatch(JSON.stringify(audit),/privateFormula|Hidden action/);
 // Square imports use the real register writer, preserve edits on retries, and require leadership + write access.
 const squareCsv='payment_id,status,disputed_usd,payment_usd,payment_datetime_chicago,card_brand,card_last4,reason,response_due_date,detail.informationRequestId\nPaymentFixture,WON,125.50,125.50,2026-02-10T10:20:30-06:00,VISA,0142,NO_KNOWLEDGE,2026-02-25,DisputeFixture';
 const squareReq=(who,body)=>square.POST(req(who,'/import-square',body));
 assert.equal((await squareReq('a',{action:'preview',csv:squareCsv})).status,403);
 let response=await squareReq('lead',{action:'preview',csv:squareCsv});assert.equal(response.status,200,await response.clone().text());const preview=await response.json();assert.equal(preview.cases.length,1);assert.equal(preview.cases[0].cardLast4,'0142');
 const apply={action:'import',csv:squareCsv,filename:'disputes.csv',digest:preview.digest,keys:[preview.cases[0].key]};
 assert.equal((await squareReq('lead',{...apply,digest:'stale'})).status,409);
 response=await squareReq('lead',apply);assert.equal(response.status,200,await response.clone().text());const imported=await response.json();assert.equal(imported.created.length,1);
 const squareRecord=(await(await get('lead','recovery')).json()).rows.find(r=>r.id===imported.created[0].id);assert.equal(squareRecord.chargeback.decision,'Merchant Prevailed');assert.equal(squareRecord.chargeback.entries.length,0);
 response=await post('lead',{...squareRecord,title:'Reviewed Name',note:'Name verified from source'});assert.equal(response.status,200,await response.clone().text());
 response=await squareReq('lead',apply);assert.equal(response.status,200);const repeated=await response.json();assert.equal(repeated.created.length,0);assert.equal(repeated.skipped.length,1);assert.equal(repeated.skipped[0].title,'Reviewed Name');
 const choices=await api.GET(req('lead','/?section=recovery&choices=1'));assert.equal(choices.status,200);assert.deepEqual((await choices.json()).accounts,[{id:'account-1',name:'Canonical Property',detail:'Active'},{id:'account:nexuseast',name:'Nexus East',detail:'Active'}]);
 const updated=(await(await get('lead','recovery')).json()).rows.find(r=>r.id===squareRecord.id);
 response=await post('lead',{...updated,chargeback:{...updated.chargeback,details:{...updated.chargeback.details,accountId:'account:unbound',accountName:'Forged'}},note:'Try link'});assert.equal(response.status,400);assert.match(await response.text(),/existing account from the directory/);
 response=await post('lead',{...updated,chargeback:{...updated.chargeback,details:{...updated.chargeback.details,accountId:'account:nexuseast',accountName:'Forged'}},note:'Link property'});assert.equal(response.status,200,await response.clone().text());const linked=await response.json();assert.equal(linked.chargeback.details.accountId,'account:nexuseast');assert.equal(linked.chargeback.details.accountName,'Nexus East');

 // Legal records inherit the register's encrypted edition and per-section access boundaries.
 const legal={section:'legal',version:0,title:'Incoming legal notice',category:'Legal Threat',status:'Open',ownerId:'lead',reference:'Notice ABC',dueOn:'',nextAction:'Review correspondence',steps:[],note:'Received letter',legalNotice:{direction:'Received',type:'Legal Threat',stage:'Open',otherParty:'Sender Company',accountId:'account-1',accountName:'Forged'}};
 response=await post('lead',legal);assert.equal(response.status,200,await response.clone().text());const notice=await response.json();assert.equal(notice.legalNotice.accountName,'Canonical Property');assert.equal((await get('a','legal')).status,403);
 assert.equal((await post('lead',{...notice,status:'Closed',note:'No resolution yet'})).status,400);
 response=await post('lead',{...notice,status:'Closed',note:'Resolution reviewed',legalNotice:{...notice.legalNotice,stage:'Resolved',resolvedOn:'2026-10-01',resolutionRef:'Signed withdrawal ABC'}});assert.equal(response.status,200,await response.clone().text());

 const collision={...updated,id:undefined,version:0,title:'Ambiguous duplicate',chargeback:{...updated.chargeback,details:{...updated.chargeback.details,disputeId:'AnotherDispute'}},note:'Duplicate source identity fixture'};
 response=await post('lead',collision);assert.equal(response.status,200,await response.clone().text());
 response=await squareReq('lead',{action:'preview',csv:squareCsv});assert.equal(response.status,409);

 // Reopening a written-off balance is an explained, versioned change, even when the case file is still open.
 const writtenOff={...updated,id:undefined,version:0,title:'Written-off recovery fixture',chargeback:{...updated.chargeback,decision:'Cardholder Prevailed',decisionRef:'Bank loss notice',disposition:'Final Loss',recoveryStage:'Complete',recoveryStartedDay:'2026-09-01',recoveryClosedDay:'2026-10-01',writeOffReason:'Documented recovery attempts exhausted',entries:[]},note:'Final loss reviewed'};
 response=await post('lead',writtenOff);assert.equal(response.status,200,await response.clone().text());const finalLoss=await response.json();
 const reopen={...finalLoss,chargeback:{...finalLoss.chargeback,disposition:'Open',recoveryStage:'Awaiting Payment'},note:''};
 response=await post('lead',reopen);assert.equal(response.status,400);assert.match(await response.text(),/reopening/);
 response=await post('lead',{...reopen,note:'Customer contacted the yard to resume repayment'});assert.equal(response.status,200,await response.clone().text());const reopened=await response.json();assert.equal(reopened.chargeback.recoveryClosedDay,'');assert.equal(reopened.chargeback.writeOffReason,'');assert.equal(reopened.history.length,2);assert.equal(reopened.history[0].note,'Final loss reviewed');

});
