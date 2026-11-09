'use client';
import {useState} from 'react';
import ModuleRail from '@/components/shared/ModuleRail';
import ConfidentialConcerns from './ConfidentialConcerns';

/** Reporting is available to linked employees even without operational HR access. */
export default function ReportingHrWorkspace(){
  const [open,setOpen]=useState(false);
  return <section className="hr2" aria-label="People & HR">
    <ModuleRail label="People and HR Sections"><nav aria-label="People and HR Sections">
      <ConfidentialConcerns mode="inbox" selected={open} onLaunch={()=>setOpen(true)}/>
    </nav></ModuleRail>
    {open?<ConfidentialConcerns mode="page"/>:<section className="hr2-card">
      <h1>People &amp; HR</h1>
      <p>Open Confidential Inbox from the People &amp; HR menu to report a concern or continue a private conversation.</p>
    </section>}
  </section>;
}
