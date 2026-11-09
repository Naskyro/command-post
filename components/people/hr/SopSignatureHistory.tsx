'use client';
import ActivityFields from '@/components/shared/ActivityFields';
import { useEffect,useState } from 'react';
import { FileSignature,ChevronDown } from 'lucide-react';
import { requestJson } from '@/lib/shared/client';

type Receipt={accessEdition?:'employee'|'management';code:string;version:number;title:string;signerName:string;signedAt:string;attestation:string;contentHash:string};
export default function SopSignatureHistory({personId}:{personId:string}) {
  const [rows,setRows]=useState<Receipt[]|null>(null),[error,setError]=useState(''),[attempt,retry]=useState(0);
  useEffect(()=>{
    let current=true;
    setRows(null);setError('');
    requestJson<{receipts:Receipt[]}>('/api/hr/sop-signatures?personId='+encodeURIComponent(personId))
      .then(r=>{if(current)setRows(r.receipts)})
      .catch(e=>{if(current)setError(e.message||'Could not load signature receipts.')});
    return ()=>{current=false};
  },[personId,attempt]);
  return <section className="hr2-card hr-sop-signatures" aria-label="Signed SOP Acknowledgments">
    <header><FileSignature size={21} aria-hidden/><h3>Signed SOP Acknowledgments</h3>{rows&&<span>{rows.length}</span>}</header>
    {error?<div role="alert">{error} <button type="button" onClick={()=>retry(a=>a+1)}>Retry</button></div>:!rows?<p role="status">Loading signatures…</p>:!rows.length?<p>No SOPs have been signed electronically.</p>:rows.map(row=><details key={row.code+':'+row.version+':'+(row.accessEdition||'legacy')}>
      <summary><div><small>{row.code} · Version {row.version}{row.accessEdition==='management'?' · With Supervisor Guidance':row.accessEdition==='employee'?' · Employee Edition':''}</small><b>{row.title}</b><ActivityFields by={row.signerName} at={row.signedAt} byLabel="Signed By" whenLabel="Signed At"/></div><ChevronDown size={16} aria-hidden/></summary>
      <div className="hr-sop-receipt"><b>Statement Signed</b><p>{row.attestation}</p><small>Policy Version Fingerprint (SHA-256)</small><code>{row.contentHash}</code></div>
    </details>)}
  </section>;
}
