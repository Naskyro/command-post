import type {Row} from '../accounts/model';
import {AppError,ConflictError,ForbiddenError} from '../shared/errors.ts';
export function editableSalesContacts(rows:Row[],canChange:boolean,person:string,leadership:boolean):Set<string>{
 if(!canChange)return new Set();
 const editable=rows.filter(r=>r.kind==='opportunity'&&!r.readOnly&&!r.example&&!r.deletedAt&&!r.id.startsWith('sales-example:')&&(leadership||r.assignee===person));
 const lids=new Set(editable.map(r=>r.id)),ids=new Set(editable.flatMap(r=>r.contactId?[String(r.contactId)]:[]));
 for(const r of rows)if(r.kind==='salesRelationship'&&!r.example&&!r.deletedAt&&r.contactId&&lids.has(String(r.opportunityId)))ids.add(String(r.contactId));
 return new Set(rows.filter(r=>r.kind==='contact'&&ids.has(r.id)&&!r.example&&!r.readOnly&&!r.deletedAt&&!r.id.startsWith('sales-example:')).map(r=>r.id));
}
export function planSalesContactEdit(body:Record<string,unknown>,rows:Row[],allowed:Set<string>){
 const old=rows.find(r=>r.kind==='contact'&&r.id===body.contactId);
 if(!old||!allowed.has(old.id))throw new ForbiddenError('You do not have permission to edit this sales contact.');
 if(!Number.isSafeInteger(body.version)||old.version!==body.version)throw new ConflictError();
 if(Object.keys(body).some(k=>!['action','contactId','version','name','email','phone'].includes(k)))throw new AppError('Only contact details can be changed here.');
 function field(k:string,max:number){const v=body[k];if(typeof v!=='string'||v.trim().length>max||/[\u0000-\u001f\u007f]/.test(v))throw new AppError('Enter a valid '+k+'.');return v.trim();}
 const name=field('name',150),email=field('email',254),phone=field('phone',50);
 if(!name)throw new AppError('Enter a contact name.');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Enter a valid contact email.');
 if(phone&&!/^\+?[\d().\s-]{6,}(?:\s*(?:x|ext\.?)\s*\d{1,8})?$/i.test(phone))throw new AppError('Enter a phone number, optionally with an extension.');
 return {old,next:{...old,name,email,personalPhone:phone}};
}
