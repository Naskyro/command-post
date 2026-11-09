'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {requestJson} from '@/lib/shared/client';
import type {Row} from '@/lib/accounts/model';
import ClaimOperationalFields,{operationalPatch} from './ClaimOperationalFields';

export default function ClaimDetailsUpdate({record,intent='update',onSaved,onClose}:{record:Row;intent?:'details'|'update';onSaved:()=>Promise<void>;onClose:()=>void}){
 const [draft,setDraft]=useState<Record<string,unknown>>(record),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();if(busy||!note.trim())return;setBusy(true);setError('');try{await requestJson('/api/accounts',{action:'appendClaimUpdate',record:{id:record.id,kind:'claim',version:record.version,accountId:record.accountId,...operationalPatch(record,draft)},note:note.trim()});await onSaved();onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="ccrc-dialog claim-details-dialog" aria-describedby={undefined}><DialogHeader><DialogTitle>{intent==='details'?'Edit Claim Details':'Add Update'}</DialogTitle></DialogHeader><form onSubmit={submit}><p>{record.name} · {String(record.status||'Investigating')}</p><label>{intent==='details'?'Reason for Changes':'Case Update'}<textarea autoFocus required rows={4} maxLength={4000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label><ClaimOperationalFields value={draft} onChange={(key,value)=>setDraft(d=>({...d,[key]:value}))} disabled={busy} more/><small>Your note and any detail changes are added to the case history with your name and the time. Settlement decisions and payment records remain preserved.</small>{error&&<p role="alert" className="ccrc-warning">{error}</p>}<footer><button type="button" className="ccrc-btn" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="ccrc-btn primary" disabled={busy||!note.trim()}>{busy?'Saving…':intent==='details'?'Save Claim Details':'Save Update'}</button></footer></form></DialogContent></Dialog>;
}
