'use client';
import {useState} from 'react';
import {FileText} from 'lucide-react';
import {pdfUrl} from './view-model';
import SopPdfPages from './SopPdfPages';
import {EditionText} from './CorrectiveAudience';
import type {Policy} from '@/lib/sop/model';
export default function PolicyDocument({policy}:{policy:Policy}){
 const [text,setText]=useState(false);
 return <><div className="sop-reader-format"><span><FileText size={15}/>Document Viewer</span><button className="sop-back" onClick={()=>setText(!text)}>{text?'Show Original Layout':'Read as Text'}</button></div>{text?<EditionText title={policy.content.title} sections={policy.content.sections} accessEdition={policy.accessEdition}/>:<SopPdfPages url={pdfUrl(policy)+'&edit='+policy.etag} title={policy.code+' · '+policy.content.title}/>}</>;
}
