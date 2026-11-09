'use client';
import {useState} from 'react';
import {ArrowRight,FilePlus2,FolderClosed,Plus,Search} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {RegisterRecord,RegisterSection} from '@/lib/ccr/register-model';
import {registerCopy} from './register-copy';
export default function RegisterUploadPicker({section,rows,onPick,onNew,onClose}:{section:RegisterSection;rows:RegisterRecord[];onPick:(r:RegisterRecord)=>void;onNew:()=>void;onClose:()=>void}){
 const [term,setTerm]=useState(''),copy=registerCopy[section],query=term.trim().toLowerCase(),matches=rows.filter(r=>[r.title,r.reference,r.ownerName,r.category].join(' ').toLowerCase().includes(query));
 return <Dialog open onOpenChange={val=>{if(!val)onClose();}}><DialogContent className="ccrr-modal ccrr-picker"><div className="ccrr-modalhead"><span className="ccrr-overline"><FilePlus2 size={14}/>{copy.title}</span><DialogTitle>Upload Document</DialogTitle><DialogDescription>{rows.length?'Choose the record this document belongs to.':'Create a record to keep the document with its case history.'}</DialogDescription></div><div className="ccrr-pickerbody">
 {rows.length>0&&<><label><Search size={15}/><input autoFocus type="search" placeholder="Search Records" aria-label="Search Records for Upload" value={term} onChange={e=>setTerm(e.target.value)}/></label><div className="ccrr-pickerrows">{matches.map(r=><button type="button" onClick={()=>onPick(r)} key={r.id}><FolderClosed size={18}/><span><strong>{r.title}</strong><small>{[r.category,r.reference,r.status].filter(Boolean).join(' · ')}</small></span><ArrowRight size={15}/></button>)}{!matches.length&&<p>No matching records.</p>}</div></>}
 <button type="button" className="ccrr-button" onClick={onNew}><Plus size={15}/>Create {copy.singular} and Add Document</button></div></DialogContent></Dialog>;
}
