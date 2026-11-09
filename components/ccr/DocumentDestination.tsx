'use client';
import {useState} from 'react';
import {ArrowRight,CalendarClock,FileBadge,FileWarning,Files,HandCoins,Landmark,Scale,Search,ShieldCheck,Upload,UserRoundCheck} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {documentTypesFor} from '@/lib/ccr/document-types';
export const destinations={
 legal:{label:'Legal Notices & Correspondence',hint:'Sent and received cease-and-desist, demand, and legal threat letters',icon:Scale},
 recovery:{label:'Chargebacks & Recovery',hint:'Processor disputes, certified letters, receipts, and repayment',icon:HandCoins},
 hearings:{label:'Court Docket',hint:'Petitions, hearings, settlements, judgments, and restitution',icon:Scale},
 damage:{label:'Damage Claims',hint:'Property and asset claims, estimates, police reports, and releases',icon:FileWarning},
 tdlr:{label:'TDLR Complaints',hint:'Opening letters, investigator requests, responses, and agency decisions',icon:Landmark},
 calendar:{label:'Compliance Calendar',hint:'Notices, deadlines, renewals, and proof of filing',icon:CalendarClock},
 licenses:{label:'Licenses & Testing',hint:'Licenses, credentials, test records, and renewals',icon:FileBadge},
 people:{label:'Personnel Review',hint:'TWC inquiries and restricted screening records',icon:UserRoundCheck}
} as const;
export default function DocumentDestination({options,onSelect}:{options:(keyof typeof destinations)[];onSelect:(s:keyof typeof destinations)=>void}){
 const [show,setShow]=useState(false),[term,search]=useState('');
 if(!options.length)return null;
 const terms=term.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 const rows=options.filter(s=>{const d=destinations[s],haystack=[d.label,d.hint,...documentTypesFor(s)].join(' ').toLocaleLowerCase();return terms.every(t=>haystack.includes(t));});
 return <><button type="button" className="ccru-launch" onClick={()=>{search('');setShow(true);}}><Upload size={15}/>Upload Document</button>
 <Dialog open={show} onOpenChange={setShow}><DialogContent className="ccru-target"><header><span><ShieldCheck size={15}/> Confidential Case Files</span><DialogTitle>Upload Document</DialogTitle><DialogDescription>Choose where the document belongs, then select its case or record.</DialogDescription></header>
 <label className="ccru-find"><Search size={17}/><input autoFocus type="search" aria-label="Find a Section or Document Type" placeholder="Search Sections or Document Types" value={term} onChange={e=>search(e.target.value)}/></label>
 <div className="ccru-targetlist">{rows.map(s=>{const item=destinations[s],Icon=item.icon;return <button type="button" key={s} onClick={()=>{setShow(false);onSelect(s);}}><i><Icon size={19}/></i><span><b>{item.label}</b><small>{item.hint}</small></span><ArrowRight size={16}/></button>;})}{!rows.length&&<p role="status"><Files size={20}/> No matching section or document type.</p>}</div>
 </DialogContent></Dialog></>;
}
