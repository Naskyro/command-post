'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {current, type Row} from '@/lib/accounts/model';

export function PropertyContactEditor({account, all, contactId:initialId='', forcePrimary=false, onClose, onSave}:{
  account:Row;all:Row[];contactId?:string;forcePrimary?:boolean;onClose:()=>void;onSave:(body:Record<string,unknown>)=>Promise<void>;
}) {
  const affiliationFor=(id:string)=>all.find(r=>r.kind==='affiliation'&&r.accountId===account.id&&r.contactId===id&&current(r));
  const initial=affiliationFor(initialId), person=all.find(r=>r.kind==='contact'&&r.id===initialId);
  const [contactId,setContactId]=useState(initialId), [name,setName]=useState(person?.name||''), [contactVersion,setContactVersion]=useState(person?.version||0);
  const [role,setRole]=useState(String(initial?.role||(account.propertyType==='Commercial'?'Facility Manager':'Property Manager')));
  const [workEmail,setWorkEmail]=useState(String(initial?.workEmail||'')), [workPhone,setWorkPhone]=useState(String(initial?.workPhone||''));
  const [startDate,setStartDate]=useState(String(initial?.startDate||'')), [version,setVersion]=useState(initial?.version||0);
  const [makePrimary,setMakePrimary]=useState(forcePrimary||!account.primaryContactId||initialId===account.primaryContactId), [endPrevious,setEndPrevious]=useState(false);
  const [previous]=useState(()=>affiliationFor(String(account.primaryContactId||'')));
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const isPrimary=forcePrimary||makePrimary||contactId===account.primaryContactId;
  return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}><DialogContent className="am-dialog"><DialogHeader><DialogTitle>{initialId?'Edit property manager / contact':'Add property manager / contact'}</DialogTitle><DialogDescription>{account.name} · Work contact details belong to this property.</DialogDescription></DialogHeader>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSave({action:'propertyContact',accountId:account.id,accountVersion:account.version,contactId,contactVersion,name,role,workEmail,workPhone,startDate,affiliationVersion:version,makePrimary:isPrimary,endPrevious,previousAffiliationVersion:previous?.version||0});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      <fieldset disabled={busy}><div className="am-form-grid">
        <label className="am-wide">Contact<select value={contactId} onChange={e=>{const id=e.target.value,a=affiliationFor(id),p=all.find(r=>r.kind==='contact'&&r.id===id);setContactId(id);setName(p?.name||'');setContactVersion(p?.version||0);setWorkEmail(String(a?.workEmail||''));setWorkPhone(String(a?.workPhone||''));setStartDate(String(a?.startDate||''));setVersion(a?.version||0);setEndPrevious(false);setRole(String(a?.role||'Property Manager'));}}><option value="">Create a new contact</option>{all.filter(r=>r.kind==='contact').sort((a,b)=>a.name.localeCompare(b.name)).map(r=><option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
        <label>Contact name<input required value={name} onChange={e=>setName(e.target.value)} maxLength={150}/></label>
        <label>Role at this property<select value={role} onChange={e=>setRole(e.target.value)}>{['Property Manager','Assistant Property Manager','Regional Manager','Vice President','Leasing Team','Maintenance','Facility Manager','Business Owner','Business Manager','Owner','Other'].map(r=><option key={r}>{r}</option>)}</select></label>
        <label>Work email at this property<input type="email" value={workEmail} onChange={e=>setWorkEmail(e.target.value)}/></label><label>Work phone at this property<input type="tel" value={workPhone} onChange={e=>setWorkPhone(e.target.value)}/></label>
        <label>Started at this property<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
      </div>
      {forcePrimary||contactId&&contactId===account.primaryContactId?<p>This is the property’s primary contact.</p>:<label className="am-check"><input type="checkbox" checked={makePrimary} onChange={e=>{setMakePrimary(e.target.checked);setEndPrevious(false);}}/>Make this the primary contact</label>}
      {isPrimary&&previous&&previous.contactId!==contactId&&<label className="am-check"><input type="checkbox" checked={endPrevious} onChange={e=>setEndPrevious(e.target.checked)}/>Previous primary manager has left this property; end their tenure on the new manager’s start date.</label>}
      <footer className="am-dialog-footer">{error&&<p role="alert" className="am-error am-save-error">{error}</p>}<Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button>{busy?'Saving…':'Save contact'}</Button></footer></fieldset>
    </form>
  </DialogContent></Dialog>;
}
