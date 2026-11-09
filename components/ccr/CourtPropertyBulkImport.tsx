'use client';
import {useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import {fileCourtGroups} from '@/lib/ccr/court-batch-client';
import type {PropertyLinkPacketRow} from '@/lib/ccr/property-link-reconcile';
type Result={status:'ready'|'review'|'confirmed'|'error';reason?:string;id?:string};
const api='/api/ccr/docket/property-links';
const example={format:'pte.court-property-links.v1',instructions:'Example only. Replace every example value with a reviewed case, authorized account, and attached original PDF reference. Import never replaces a different existing property link.',cases:[{number:'EXAMPLE-CASE-123',courtName:'Travis County Justice Court, Precinct 2',propertyName:'Example Property',accountId:'account:REPLACE_WITH_REAL_ACCOUNT_ID',propertyAsPrinted:'Example Property as printed on the original notice',basis:'Explain the property match after reviewing the original notice.',evidence:[{sha256:'0'.repeat(64),page:1}]}]};
export default function CourtPropertyBulkImport({onSaved}:{onSaved:()=>void|Promise<void>}){
 const [rows,Rows]=useState<PropertyLinkPacketRow[]>([]),[results,Results]=useState<(Result|undefined)[]>([]),[busy,B]=useState(''),[error,E]=useState(''),lock=useRef(false);
 async function run(action:'preview'|'import'|'receipt',records=rows,previous=results){
  if(lock.current)return;lock.current=true;B(action);E('');const next=Array.from(previous);let changed=false;
  try{await fileCourtGroups<PropertyLinkPacketRow,Result>(api,action,records.filter((_,i)=>action!=='import'||previous[i]?.status==='ready'),()=>{},(r,out)=>{const index=records.indexOf(r);next[index]=out;if(action==='import'&&out.status==='confirmed')changed=true;Results([...next]);},(_,reason)=>({status:'error',reason}));if(changed)await onSaved();}
  catch(e){E(e instanceof Error?e.message:'The list could not be checked.');}finally{B('');lock.current=false;}
 }
 const ready=results.filter(x=>x?.status==='ready').length;
 return <section className="cpr-bulk">
  <p>This optional import accepts a prepared <strong>.json case-link list</strong>, not a PDF. Use the case review above for ordinary property changes. Original court PDFs belong in the case’s documents.</p>
  <p>The list must use format <code>pte.court-property-links.v1</code>, with 1–200 cases and the exact fields shown in the example. A different existing property link is always left for individual review.</p>
  <a className="cd-secondary" href={'data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(example,null,2))} download="court-property-link-example.json"><Download size={15}/>Download JSON Example</a>
  <label>Choose a Prepared JSON List<input type="file" accept=".json,application/json" disabled={!!busy} onChange={async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;E('');Rows([]);Results([]);try{if(f.size>2000000)throw Error('Choose a JSON list under 2 MB.');const b=JSON.parse(await f.text());if(b?.format!=='pte.court-property-links.v1'||!Array.isArray(b.cases)||b.cases.length<1||b.cases.length>200||b.cases.some((x:PropertyLinkPacketRow)=>!x||typeof x.number!=='string'||typeof x.propertyName!=='string'))throw Error('Use the example JSON format with 1–200 reviewed cases.');Rows(b.cases);await run('preview',b.cases,[]);}catch(e){E(e instanceof Error?e.message:'This is not a valid JSON list.');}}}/></label>
  {busy&&<p role="status">Checking the prepared list…</p>}
  {!!rows.length&&<><p>{results.filter(x=>x?.status==='confirmed').length} already saved · {ready} ready · {results.filter(x=>x&&['error','review'].includes(x.status)).length} need individual review</p><div className="cpr-bulk-results">{rows.map((r,i)=><article key={i}><strong>{r.number} · {r.propertyName}</strong><p>{results[i]?.status||'Waiting'}{results[i]?.reason?' · '+results[i]?.reason:''}</p></article>)}</div><div className="cpr-actions"><button className="cd-secondary" disabled={!!busy} onClick={()=>void run('receipt')}>Check Saved Links</button><button className="cd-primary" disabled={!!busy||!ready} onClick={()=>void run('import')}><Upload size={15}/>Save {ready} Verified Link{ready===1?'':'s'}</button></div></>}
  {error&&<p className="cpr-error" role="alert">{error}</p>}
 </section>;
}
