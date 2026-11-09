'use client';
import {useState,type ReactNode} from 'react';
import {BookOpen,ShieldCheck} from 'lucide-react';
import type {Policy,SopContent} from '@/lib/sop/model';
import {correctiveSectionVisibility} from '@/lib/sop/corrective-content';
import SopPdfPages from './SopPdfPages';
import './corrective-editions.css';

export function CorrectiveAudience(){return <div className="sop-corrective-scope"><span><BookOpen size={16}/><span><b>All Employees</b>Conduct standards and typical consequences</span></span><span><ShieldCheck size={16}/><span><b>Managers and Above</b>Employee policy plus restricted supervisor instructions</span></span></div>;}

function Guidance({sections}:{sections:SopContent['sections']}){
 const privateSections=sections.filter(s=>correctiveSectionVisibility(s)==='management'&&s.text.trim());
 if(!privateSections.length)return null;
 return <details className="sop-corrective-guidance"><summary><ShieldCheck size={16}/>Manager Guidance <small>Managers and Above Only</small></summary><div>{privateSections.map((s,i)=><section key={i}><h3>{s.heading}</h3><p className="sop-prose">{s.text}</p></section>)}</div></details>;
}

/** Text mode uses the same server-issued sections as the PDF. */
export function EditionText({title,sections,accessEdition}:{title:string;sections:SopContent['sections'];accessEdition?:Policy['accessEdition']}){
 const renderSections=(rows:SopContent['sections'])=>rows.map((section,i)=><section key={i}><h3>{section.heading}</h3><p className="sop-prose">{section.text}</p></section>);
 const employeeSections=sections.filter(s=>correctiveSectionVisibility(s)==='employee');
 return <article className="sop-surface sop-form"><h2>{title}</h2>{accessEdition==='management'?<><h3 className="sop-corrective-text-heading"><BookOpen size={16}/>Employee Policy</h3>{renderSections(employeeSections)}<Guidance sections={sections}/></>:renderSections(accessEdition==='employee'?employeeSections:sections)}</article>;
}

/** The employee preview deliberately has no opening, acknowledgment, or signature callbacks. */
export function ManagerEditionReader({policy,url,children}:{policy:Policy;url:string;children:ReactNode}){
 const [preview,setPreview]=useState(false);
 if(policy.accessEdition!=='management')return <>{children}</>;
 return <div className="sop-corrective-reader"><div className="sop-corrective-switch" role="group" aria-label="Policy Edition"><button type="button" className="sop-btn" aria-pressed={!preview} onClick={()=>setPreview(false)}><ShieldCheck size={15}/>My Manager Edition</button><button type="button" className="sop-btn" aria-pressed={preview} onClick={()=>setPreview(true)}><BookOpen size={15}/>Preview Employee Edition</button></div>{preview?<><p className="sop-corrective-hint">This is the policy employees receive. Return to My Manager Edition to acknowledge your assigned version.</p><SopPdfPages url={url+'&edition=employee'} title={policy.code+' · Employee Edition'}/></>:<><Guidance sections={policy.content.sections}/>{children}</>}</div>;
}

export function CorrectiveDraftPreview({policy,url}:{policy:Policy;url:string}){
 const [edition,setEdition]=useState<'employee'|'management'>('employee');
 return <><div className="sop-corrective-switch" role="group" aria-label="Preview Draft as"><button type="button" className="sop-btn" aria-pressed={edition==='employee'} onClick={()=>setEdition('employee')}><BookOpen size={15}/>Employee PDF</button><button type="button" className="sop-btn" aria-pressed={edition==='management'} onClick={()=>setEdition('management')}><ShieldCheck size={15}/>Manager PDF</button><a className="sop-btn" href={url+'&edition='+edition+'&download=1'} download>Download This Edition</a></div><SopPdfPages url={url+'&edition='+edition} title={policy.code+(edition==='employee'?' · Employee Draft':' · Manager Draft')}/></>;
}
