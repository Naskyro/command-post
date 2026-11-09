import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {unzipSync,strFromU8} from 'fflate';
import {extractText,getDocumentProxy} from 'unpdf';

test('each portfolio export retains all rows, source limits, numeric types and a classification on every unit',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-export-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const req=createRequire(import.meta.url),entry=join(dir,'export.cjs');
 await build({stdin:{contents:"export * from './lib/accounts/report-export-model';export * from './lib/accounts/report-export-pptx';export {makeReportPdf,makeReportXlsx} from './lib/reports/files';",resolveDir:process.cwd()},outfile:entry,bundle:true,platform:'node',format:'cjs',alias:{jspdf:req.resolve('jspdf')},external:[],logLevel:'silent'});
 const {publishedProjection,makeReportPdf,makeReportXlsx,makePortfolioPresentation,exportName,prepareExport,compareRows}=req(entry);
 const data={id:'revenue',title:'Leading / Properties: Trailing Twelve Months',description:'An example portfolio ranking.',category:'Financial Performance',generatedAt:'2026-11-01T18:23:00Z',period:'01-01-2026 to 10-31-2026',scope:'Assigned Portfolio',summary:[{label:'Count',value:'41'}],notes:['Collections are not net profit. No inferred patrol visits.'],columns:[{key:'property',label:'Property Name',format:'text'},{key:'val',label:'Collected Revenue',format:'money'},{key:'visits',label:'Onsite Visits',format:'integer'},{key:'share',label:'Managed Share',format:'percent'},{key:'date',label:'Most Recent Visit',format:'date'},{key:'note',label:'Coverage Note',format:'text'}],rows:Array.from({length:41},(_,i)=>({accountId:'record-'+i,values:{property:i===0?'=2+2':'Example '+(i+1),val:i===1?-16.75:101.25+i,visits:i===4?null:i,share:25,date:'2026-09-01',note:i===40?'FINAL RECORD SENTINEL':'Résumé & Verification'}}))};
 assert.throws(()=>prepareExport(data,{measure:'accountId'}));assert.throws(()=>prepareExport(data,{sortKey:'hiddenField'}));const sorted=prepareExport(data,{sortKey:'val',sortDir:-1,measure:'share'});assert.equal(sorted.rows[0].values.property,'Example 41');assert.equal(compareRows(sorted).measure.key,'share');assert.equal(compareRows(sorted).points[0].value,25);
 const {meta,result}=publishedProjection(data),[pdf,xlsx,pptx]=await Promise.all([makeReportPdf(data.title,result,meta),makeReportXlsx(data.title,result,meta),makePortfolioPresentation(data)]);
 if(process.env.EXPORT_PROOF_DIR){for(const [ext,b] of Object.entries({xlsx,pdf,pptx}))await writeFile(join(process.env.EXPORT_PROOF_DIR,'report.'+ext),b);}
 assert.match(exportName({...data,title:'"\r\n../x:y'},'pdf'),/^PTE-Confidential-[\w-]+\.pdf$/);
 const doc=await getDocumentProxy(pdf.slice()),tx=await extractText(doc,{mergePages:false});assert.ok(tx.totalPages>1);for(const p of tx.text)assert.match(p,/CONFIDENTIAL/);assert.match(tx.text.join(' ').replace(/\s+/g,' '),/FINAL RECORD SENTINEL/);assert.match(tx.text.join(' '),/Collections are not net profit/);
 const sheet=unzipSync(xlsx),sheets=Object.keys(sheet).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).map(k=>strFromU8(sheet[k]));assert.ok(sheets.length>=2);for(const s of sheets){assert.match(s,/CONFIDENTIAL · INTERNAL USE ONLY/);assert.match(s,/<oddHeader>.*CONFIDENTIAL/);assert.match(s,/ySplit="2"/);}
 const results=sheets[0];assert.match(results,/<c r="A3" t="inlineStr"[^>]*>.*?=2\+2/);assert.match(results,/<c r="B3" s="2"><v>101.25<\/v>/);assert.match(results,/<c r="D3" s="3"><v>0.25<\/v>/);assert.match(results,/FINAL RECORD SENTINEL/);assert.doesNotMatch(results,/<f>/);
 const deck=unzipSync(pptx),slides=Object.keys(deck).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).map(k=>strFromU8(deck[k]));assert.ok(slides.length>=5);for(const s of slides)assert.match(s,/CONFIDENTIAL/);const xml=slides.join(' ');assert.match(xml,/uri=\"http:\/\/schemas\.openxmlformats\.org\/drawingml\/2006\/table\"><a:tbl>/);assert.match(xml,/FINAL RECORD SENTINEL/);assert.match(xml,/Collections are not net profit/);assert.match(xml,/\$101.25/);assert.ok(deck['ppt/media/pte.png'].length>500);assert.doesNotMatch(xml,/record-40/);
});

test('download route authorizes the source query, ignores submitted rows, and writes only minimal audit metadata',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'command-export-route-'));t.after(()=>{delete globalThis.__testPortfolioAudit;return rm(dir,{recursive:true,force:true});});globalThis.__testPortfolioAudit=[];
 const entry=join(dir,'handler.cjs'),req=createRequire(import.meta.url);
 const mocks={
 'next/server':'export const NextResponse=Response;',
 '@/db/finance':'export const financeDb=()=>({prepare:()=>({bind:(...args)=>({run:()=>globalThis.__testPortfolioAudit.push(args)})})});',
 '@/lib/accounts/portfolio-reports-server':`export async function loadPortfolioReport(req,q,actor){if(q.get('scope')!=='Mine'){const e=new Error('Not your assigned portfolio.');e.status=403;throw e;}actor({id:'u1',person:'p1',name:'Sales Rep'});return {id:'r',title:'Scoped Report',category:'Sales',period:'2026',scope:'My Properties',description:'',generatedAt:'2026-11-01T18:00:00Z',columns:[{key:'property',label:'Property',format:'text'}],rows:[{values:{property:'Authorized Example'}}],summary:[],notes:[]};}`,
 };
 await build({entryPoints:['app/api/accounts/reports/export/route.ts'],outfile:entry,bundle:true,platform:'node',format:'cjs',alias:{jspdf:req.resolve('jspdf')},plugins:[{name:'route-bindings',setup(b){b.onResolve({filter:/^(next\/server|@\/db\/finance|@\/lib\/accounts\/portfolio-reports-server)$/},a=>({path:a.path,namespace:'m'}));b.onLoad({filter:/.*/,namespace:'m'},a=>({contents:mocks[a.path],loader:'js'}));}}],logLevel:'silent'});
 const {POST}=req(entry);
 function run(q,extra={},origin='https://company.test'){const request=new Request('https://company.test/api/accounts/reports/export',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({format:'xlsx',query:q,...extra})});request.nextUrl=new URL(request.url);return POST(request);}
 assert.equal((await run('id=r&scope=AnotherTeam')).status,403);assert.equal((await run('scope=Mine')).status,400);assert.equal((await run('id=r&scope=Mine',{},'https://another.test')).status,403);assert.equal((await run('id=r&scope=Mine',{view:{sortKey:'classified'}})).status,400);assert.equal(globalThis.__testPortfolioAudit.length,0);
 const out=await run('id=r&scope=Mine',{rows:[{values:{property:'Injected Data'}}]});assert.equal(out.status,200);assert.match(out.headers.get('Cache-Control'),/no-store/);assert.match(out.headers.get('Content-Disposition'),/PTE-Confidential-Scoped-Report/);
 const raw=unzipSync(new Uint8Array(await out.arrayBuffer())),xml=strFromU8(raw['xl/worksheets/sheet1.xml']);assert.match(xml,/Authorized Example/);assert.doesNotMatch(xml,/Injected Data/);assert.equal(globalThis.__testPortfolioAudit.length,1);assert.doesNotMatch(JSON.stringify(globalThis.__testPortfolioAudit),/Authorized Example|Injected Data/);
});
