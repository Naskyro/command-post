import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {tdlrDirectMax} from '../../lib/ccr/tdlr-evidence.ts';
test('small TDLR multipart uploads share the restricted case and source checks, preserve source receipts, and independently verify the saved bytes',async t=>{
 const tmp=await mkdtemp(join(tmpdir(),'tdlr-direct-'));t.after(async()=>{delete globalThis.tdlrDirectFixture;await rm(tmp,{recursive:true,force:true});});
 const sum=x=>createHash('sha256').update(x).digest('hex'),body=Buffer.from('%PDF-1.7\nworking copy\n%%EOF'),original=Buffer.from('%PDF-1.7\noriginal fixture\n%%EOF');
 const f={reference:'TOW20990000001',messageId:'abcdef1234567890',sourceSha256:sum(original),sourceBytes:String(original.length),kind:'Reviewed Copy',medium:'Gmail Attachment',originalName:'Complaint.pdf',driveId:'',name:'Review.pdf',sha256:sum(body),size:String(body.length),documentType:'Written Response to TDLR'};
 let writes=0,reads=0,gate=0,stored;
 const row={id:'fake-test-case',version:5,reference:f.reference,files:[],regulatoryMail:[{messageId:f.messageId,attachments:[{name:f.originalName,bytes:original.length,sha256:sum(original)}],summary:'Source email',body:'Original attached.'}]};
 const fx={allowed:true,async access(v,s,edit,staff){gate++;assert.equal(s,'tdlr');assert.equal(edit,true);assert.deepEqual(staff,[]);if(!fx.allowed)throw Object.assign(new Error('No access.'),{status:403});},
  row,async attach(v,s,id,version,doc,staff,documentType,other,sourceReceipt){assert.equal(s,'tdlr');assert.equal(id,row.id);assert.equal(version,row.version);assert.equal(documentType,f.documentType);writes++;
   stored=Buffer.from(doc.bytes);row.files.push({id:'saved',sha256:sum(stored),bytes:stored.length,sourceReceipt,documentType});return {id};},
  async download(v,s,id,file){assert.equal(id,row.id);assert.equal(file,'saved');assert.equal(sum(stored),row.files[0].sha256);reads++;}
 };globalThis.tdlrDirectFixture=fx;
 const stubs={'next/server':'export const NextResponse=Response','@/lib/finance/server':'export const requestRoster=async()=>[],identify=()=>({id:"private-user"})','@/lib/source-files/authorization':'export const requireSourceAccess=(...args)=>globalThis.tdlrDirectFixture.access(...args)','@/lib/ccr/document-stage-server':'export const handleDocumentStage=()=>{throw Error("unexpected staging")}','@/lib/ccr/register-server':'const fx=globalThis.tdlrDirectFixture;export const getRegister=async()=>({rows:[fx.row]}),reviewableTdlr=async()=>fx.row,attachStagedRegisterFile=(...a)=>fx.attach(...a),downloadRegisterFile=(...a)=>fx.download(...a)'};
 await build({entryPoints:['app/api/ccr/register/mail-evidence/route.ts'],outfile:join(tmp,'actual.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'io-boundary',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path]}));}}]});
 const {POST}=await import(pathToFileURL(join(tmp,'actual.mjs'))),url='https://unit.invalid/api/ccr/register/mail-evidence';
 const send=(body,headers={})=>{const req=new Request(url,{method:'POST',headers:{origin:'https://unit.invalid',...headers},body});req.nextUrl=new URL(url);return POST(req);};
 const form=(entry=f,file=body)=>{const data=new FormData();data.set('entry',JSON.stringify(entry));data.set('file',new File([file],entry.name,{type:'application/pdf'}));return data;};
 assert.equal((await send(form(),{origin:'https://elsewhere.invalid'})).status,403);assert.equal(gate,0);
 fx.allowed=false;assert.equal((await send(form())).status,403);fx.allowed=true;
 for(const entry of [{...f,reference:'TOW20990000002'},{...f,messageId:'123412341234'},{...f,originalName:'Another.pdf'},{...f,sourceSha256:'c'.repeat(64)},{...f,medium:'Linked Google Drive File',driveId:'ABCDEFGHIJKLMN'},{...f,sha256:'e'.repeat(64)}])assert.ok((await send(form(entry))).status>=400);
 const huge=Buffer.alloc(tdlrDirectMax+1);body.copy(huge);assert.equal((await send(form({...f,sha256:sum(huge),size:String(huge.length)},huge))).status,413);
 assert.equal(writes,0);assert.equal((await send(form())).status,200);assert.equal(writes,1);
 assert.deepEqual(row.files[0].sourceReceipt,{messageId:f.messageId,sourceSha256:f.sourceSha256,sourceBytes:original.length,kind:'Reviewed Copy',medium:'Gmail Attachment',originalName:f.originalName});
 assert.deepEqual(await (await send(form())).json(),{id:row.id,file:'saved'});assert.equal(writes,1);
 const forged=Buffer.from(body);forged[10]^=1;assert.equal((await send(form(f,forged))).status,400);
 const verify=await send(JSON.stringify({action:'verify',entry:f}),{'content-type':'application/json'});assert.deepEqual(await verify.json(),{id:row.id,sha256:sum(body),verified:true});assert.equal(reads,1);
 stored[12]^=1;assert.notEqual((await send(JSON.stringify({action:'verify',entry:f}),{'content-type':'application/json'})).status,200);
});
