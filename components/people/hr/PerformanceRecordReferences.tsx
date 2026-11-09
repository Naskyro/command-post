'use client';
import {BookOpen,LockKeyhole} from 'lucide-react';
import {savedPolicyReferences} from '@/lib/hr/performance-reference-labels';
import './performance-record-references.css';
export default function PerformanceRecordReferences({data}:{data:Record<string,unknown>}){
 const refs=savedPolicyReferences(data);
 if(!refs.length)return null;
 return <section className="performance-policy-refs" aria-label="Recorded Policy References"><h3>Recorded Policy References</h3><ul>{refs.map((r,i)=><li key={i}>{r.restricted?<><LockKeyhole size={17}/><div><strong>Restricted Policy Reference</strong></div></>:<><BookOpen size={17}/><div><strong>{[r.code,r.title].filter(Boolean).join(' · ')}</strong><small>{[r.version&&'Version '+r.version,r.revision&&'Revision '+r.revision,r.state==='historical'&&'Historical Edition'].filter(Boolean).join(' · ')}</small></div></>}</li>)}</ul></section>;
}
