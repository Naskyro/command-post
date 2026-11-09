'use client';
import {useEffect,useState} from 'react';
import {Trash2} from 'lucide-react';
import {auditStamp} from '@/lib/shared/audit-format';
import {requestJson} from '@/lib/shared/client';
import type {PerformanceExample} from '@/lib/hr/performance-examples';
import {Button,Tag} from './ui';

const endpoint='/api/hr/performance-examples';
export default function PerformanceExamples(){
  const [examples,setExamples]=useState<PerformanceExample[]|null>(null),[error,setError]=useState(''),[attempt,retry]=useState(0),[busy,setBusy]=useState('');
  useEffect(()=>{
    let active=true;
    requestJson<{examples:PerformanceExample[]}>(endpoint).then(x=>{if(active)setExamples(x.examples)}).catch(e=>{if(active)setError(e.message)});
    return ()=>{active=false};
  },[attempt]);
  async function remove(e:PerformanceExample){
    if(busy||!window.confirm('Delete this training example from your view only? Other users keep their own copy.'))return;
    setBusy(e.id);setError('');
    try{await requestJson(endpoint,{action:'dismiss',id:e.id});setExamples(current=>current?.filter(x=>x.id!==e.id)||[])}
    catch(err){setError((err as Error).message)}
    finally{setBusy('')}
  }
  if((examples?.length===0)||(!examples&&!error))return null;
  return <details className="hrx-sample-library"><summary>Sample Completed Records · Manager Training</summary>
    <p>Fictional examples for managers. They do not appear in personnel files or performance counts. Deleting an example removes only your copy.</p>
    {error&&<p className="hr2-error" role="alert">{error} {!examples&&<Button onClick={()=>{setError('');retry(n=>n+1)}}>Retry</Button>}</p>}
    {examples?.map(e=><details className="hr2-record" key={e.id}><summary><Tag>Sample</Tag> <b>{e.title}</b></summary><dl className="hr2-dl">{[['Recorded By','Casey Example · Sample Manager'],['Recorded At',auditStamp(e.date)],['Category',e.category],['Discussion / Findings',e.summary],['Employee Response',e.response],['Expectation',e.expectation],['Follow-Up / Outcome',e.followUp],['Visibility',e.visibility]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><Button disabled={!!busy} onClick={()=>void remove(e)}><Trash2 size={15}/>{busy===e.id?'Deleting…':'Delete Sample for Me'}</Button></details>)}
  </details>;
}
