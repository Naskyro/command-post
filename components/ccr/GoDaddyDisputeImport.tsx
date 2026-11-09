'use client';
import {useRef,useState} from 'react';
import {Download,FileSpreadsheet,Upload} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {requestJson} from '@/lib/shared/client';
import {godaddyCsvMaxBytes,godaddyCsvTemplate} from '@/lib/ccr/godaddy-import';

type PreviewCase={key:string;row:number;title:string;transactionId:string;disputeId:string;amountCents:number;originalTransactionCents:number|null;sourceStatus:string;sourcePhase:string;transactionDay:string;transactionTime:string;transactionZone:string;deadlineDay:string;deadlineTime:string;deadlineZone:string;cardBrand:string;cardLast4:string;customerName:string;cardholderName:string;stockNumber:string;towbookCallNumber:string;vehicle:string;propertyAddress:string;sourceAccountName:string;accountName:string;warnings:string[];sourceNotes:string;existingId:string;existingTitle:string;conflict:string};
type Preview={digest:string;cases:PreviewCase[];warnings:string[];duplicatesSkipped:number};
const money=(amount:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount/100);
const clock=(day:string,time:string,zone:string)=>day+(time?' at '+time+' ('+(zone||'time zone unknown')+')':'');

export default function GoDaddyDisputeImport({onImported}:{onImported:()=>void}){
 const [open,setOpen]=useState(false),[csv,setCsv]=useState(''),[filename,setFilename]=useState('godaddy-disputes.csv'),[preview,setPreview]=useState<Preview|null>(null),[keys,setKeys]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('');
 const guard=useRef(false);
 function change(text:string,name='godaddy-disputes.csv'){setCsv(text);setFilename(name);setPreview(null);setKeys([]);setError('');setResult('');}
 async function readFile(file?:File){
  if(!file||guard.current)return;
  setPreview(null);setKeys([]);setCsv('');setFilename(file.name);setResult('');
  if(file.size>godaddyCsvMaxBytes){setError('Use a reviewed CSV up to 300 KB.');return;}
  guard.current=true;setBusy(true);setError('');
  try{change(await file.text(),file.name);}catch{setError('The file could not be read. Choose it again or paste its CSV rows.');}finally{guard.current=false;setBusy(false);}
 }
 function downloadTemplate(){
  const url=URL.createObjectURL(new Blob([godaddyCsvTemplate()],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download='GoDaddy-Reviewed-Disputes-Template.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function run(commit=false){
  if(guard.current)return;guard.current=true;setBusy(true);setError('');setResult('');
  if(!commit){setPreview(null);setKeys([]);}
  try{
   if(commit&&preview){
    const response=await requestJson<{created:unknown[];skipped:unknown[]}>('/api/ccr/register/import-godaddy',{action:'import',csv,filename,digest:preview.digest,keys});
    setResult(response.created.length+' cases imported. '+response.skipped.length+' existing cases kept.');setPreview(null);setKeys([]);setCsv('');onImported();
   }else{
    const response=await requestJson<Preview>('/api/ccr/register/import-godaddy',{action:'preview',csv,filename});
    setPreview(response);setKeys(response.cases.filter(c=>!c.existingId&&!c.conflict).map(c=>c.key));
   }
  }catch(e){setError((e as Error).message);}finally{guard.current=false;setBusy(false);}
 }
 const available=preview?.cases.filter(c=>!c.existingId&&!c.conflict)||[];
 return <>
  <button type="button" className="ccrr-button" onClick={()=>setOpen(true)}><FileSpreadsheet size={15}/>Import GoDaddy Disputes</button>
  <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}>
   <DialogContent className="ccrr-modal" showCloseButton={!busy}>
    <header className="ccrr-modalhead"><DialogTitle>Import GoDaddy Disputes</DialogTitle><DialogDescription>Upload or paste a reviewed CSV, check each dispute, then import the selected cases.</DialogDescription></header>
    <div className="ccrr-formbody">
     {result&&<p role="status" className="ccrr-notice">{result}</p>}
     <section aria-label="Prepare a GoDaddy import">
      <p>Start with the reviewed dispute CSV, or download the template and copy the details you have checked in GoDaddy. This form reads CSV fields; screenshots and PDFs can be attached to individual cases after import.</p>
      <button type="button" className="ccrr-button" disabled={busy} onClick={downloadTemplate}><Download size={15}/>Download CSV Template</button>
      <details className="ccrr-formsteps"><summary>What Goes in the CSV?</summary><ul>
       <li>Enter one dispute per row, with its transaction ID, dispute ID, captured payment date, card brand, last four digits and processor status.</li>
       <li>Amounts use whole cents: enter 12550 for $125.50. Keep the original payment separate from the disputed amount.</li>
       <li>Use YYYY-MM-DD for dates and HH:mm for a 24-hour clock. Leave the time zone blank if the source does not state it.</li>
       <li>Add known customer, vehicle, account and source details in the optional columns. Leave missing details blank so they can be completed later.</li>
       <li>Keep card endings as four-digit text, including leading zeros. Use names you can verify; generic cardholder labels remain source notes.</li>
      </ul></details>
     </section>
     <label className="ccrr-notefield"><b>Reviewed GoDaddy CSV</b><input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>void readFile(e.target.files?.[0])}/><small>Up to 300 KB and 200 disputes. Imported source references do not attach the original documents.</small></label>
     <details className="ccrr-formsteps"><summary>Paste Reviewed CSV</summary><label>CSV Rows<textarea aria-label="GoDaddy CSV Rows" rows={7} disabled={busy} value={csv} onChange={e=>change(e.target.value)}/></label></details>
     {csv.trim()&&<p><small>Selected source: {filename}</small></p>}
     {preview&&<>
      <h3>Review {preview.cases.length} Disputes</h3>
      <p>Processor outcomes and recovery payments are tracked separately. This import records the reviewed facts and leaves actual recovered payments for receipt entry.</p>
      {preview.duplicatesSkipped>0&&<p>{preview.duplicatesSkipped} repeated CSV {preview.duplicatesSkipped===1?'row was':'rows were'} combined.</p>}
      {available.length>0&&<label><input type="checkbox" disabled={busy} checked={keys.length===available.length} onChange={e=>setKeys(e.target.checked?available.map(c=>c.key):[])}/> Select all {available.length} new, unblocked cases</label>}
      <div className="ccrr-importrows">{preview.cases.map(c=><div key={c.key}>
       <label className="ccrr-importrow"><input type="checkbox" checked={keys.includes(c.key)} disabled={busy||!!c.existingId||!!c.conflict} onChange={e=>setKeys(old=>e.target.checked?[...old,c.key]:old.filter(k=>k!==c.key))}/><span>
        <strong>{c.title}</strong>
        <small>{money(c.amountCents)} disputed · {c.sourceStatus} · {c.cardBrand}{c.cardLast4?' ending '+c.cardLast4:''}</small>
        {c.originalTransactionCents!==null&&c.originalTransactionCents!==c.amountCents&&<small>Original captured payment: {money(c.originalTransactionCents)}</small>}
        <small>Transaction {c.transactionId} · Dispute {c.disputeId}</small>
        <small>Payment: {clock(c.transactionDay,c.transactionTime,c.transactionZone)}</small>
        <small>{c.deadlineDay?'Processor response due '+clock(c.deadlineDay,c.deadlineTime,c.deadlineZone):'Processor deadline not supplied'}</small>
        {(c.vehicle||c.stockNumber||c.towbookCallNumber)&&<small>{[c.vehicle,c.stockNumber?'Stock '+c.stockNumber:'',c.towbookCallNumber?'Towbook call '+c.towbookCallNumber:''].filter(Boolean).join(' · ')}</small>}
        {(c.sourceAccountName||c.propertyAddress)&&<small>Account: {c.accountName||c.sourceAccountName||'Unlinked'}{c.accountName?' (directory match)':' (unlinked)'}{c.propertyAddress?' · '+c.propertyAddress:''}</small>}
        {c.existingId&&<small>Already saved as {c.existingTitle}. Its existing details will be kept.</small>}
        {c.conflict&&<small role="alert">Blocked: {c.conflict}</small>}
        {c.warnings.map((warning,index)=><small key={index}>{warning}</small>)}
       </span></label>
       <details className="ccrr-formsteps"><summary>Reviewed Source Details — Row {c.row}</summary><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{c.sourceNotes}</p></details>
      </div>)}</div>
      {!available.length&&<p>There are no new, unblocked cases to import. Existing cases can be edited in the register; blocked rows need their source identities reviewed.</p>}
     </>}
     {error&&<p role="alert" className="ccrr-alert">{error}</p>}
    </div>
    <footer className="ccrr-modalfoot"><button type="button" className="ccrr-button" disabled={busy} onClick={()=>setOpen(false)}>Close</button>{preview?<><button type="button" className="ccrr-button" disabled={busy} onClick={()=>void run()}>Review Again</button><button type="button" className="ccrr-primary" disabled={busy||!keys.length} onClick={()=>void run(true)}>{busy?'Importing…':'Import '+keys.length+' Selected Cases'}</button></>:<button type="button" className="ccrr-primary" disabled={busy||!csv.trim()} onClick={()=>void run()}><Upload size={15}/>{busy?'Checking…':'Review Cases'}</button>}</footer>
   </DialogContent>
  </Dialog>
 </>;
}
