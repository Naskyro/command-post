import {AppError,ConflictError} from '../shared/errors.ts';
import {prepareProfilePhoto,profilePhotoLimit} from '../people/photos.ts';
import type {Row} from '../accounts/model';
export type Surface='sales'|'accounts';
export type PortraitTarget={contactId:string;surface:Surface;relationId?:string};
export type PortraitRights={view:boolean;edit:boolean;leadership:boolean;person:string;editContact:boolean};
export type StoredPortrait={contact_id:string;version:number;storage_key:string|null;mime:string|null;updated_at:string;updated_by:string};
export const portraitLimit=profilePhotoLimit;
const id=/^[A-Za-z0-9:_-]{1,150}$/;
export function portraitTarget(surface:unknown,contactId:unknown,relationId?:unknown):PortraitTarget{
 if((surface!=='sales'&&surface!=='accounts')||typeof contactId!=='string'||!id.test(contactId)||relationId!=null&&relationId!==''&&(typeof relationId!=='string'||!id.test(relationId)))throw new AppError('Choose a saved relationship contact and workspace.');
 return {surface,contactId,...(relationId?{relationId:String(relationId)}:{})};
}
export function portraitRights(target:PortraitTarget,all:Row[],right:PortraitRights){
 const no={read:false,edit:false};const person=all.find(row=>row.id===target.contactId&&row.kind==='contact');if(!right.view||!person||person.example||person.id.startsWith('sales-example:'))return no;
 const leads=all.filter(row=>row.kind==='opportunity'&&!row.example&&!row.id.startsWith('sales-example:'));const allSales=all.filter(row=>row.kind==='salesRelationship'&&row.contactId===person.id&&!row.example&&leads.some(l=>l.id===row.opportunityId));
 const accounts=all.filter(row=>row.kind==='account'&&!row.example),companies=all.filter(row=>row.kind==='company'&&!row.example);const allAff=all.filter(row=>row.kind==='affiliation'&&row.contactId===person.id&&!row.example&&(accounts.some(a=>a.id===row.accountId)||companies.some(c=>c.id===row.companyId)));
 if(target.surface==='sales'){
  const refs=allSales.filter(r=>!target.relationId||r.id===target.relationId);const related=leads.filter(l=>refs.some(r=>l.id===r.opportunityId)||!target.relationId&&l.contactId===person.id);
  if(!related.length)return no;return {read:true,edit:right.edit&&!person.readOnly&&related.some(l=>!l.readOnly&&(l.assignee===right.person||right.leadership))};
 }
 const scoped=allAff.filter(row=>!target.relationId||row.id===target.relationId);if(target.relationId&&!scoped.length)return no;
 const knownOnAccount=scoped.length>0||accounts.some(a=>a.primaryContactId===person.id);if(!knownOnAccount&&(allSales.length||leads.some(l=>l.contactId===person.id)))return no;
 return {read:true,edit:right.edit&&!person.readOnly&&right.editContact};
}
export function legacyPortrait(rows:Row[],contactId:string){return rows.filter(r=>r.kind==='file'&&r.category==='Contact photo'&&r.contactId===contactId&&!r.accountId&&r.status==='Current'&&!r.sourceOnly&&!r.sourceUrl&&/^(image\/jpeg|image\/png|image\/webp)$/.test(String(r.mimeType))&&/^[A-Za-z0-9_-]{1,150}$/.test(r.id)&&(!r.storageKey||r.storageKey==='accounts/'+r.id)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))||b.id.localeCompare(a.id))[0];}
export function preparePortrait(bytes:Uint8Array,mime:string){const image=prepareProfilePhoto(bytes,mime);if(image.width!==512||image.height!==512)throw new AppError('Frame this contact photo at 512 × 512 before saving.');return image;}
export function portraitMetadata(row:StoredPortrait|null,legacy:Row|undefined,canEdit:boolean){return {version:row?.version??0,hasPhoto:row?Boolean(row.storage_key):Boolean(legacy),updatedAt:row?.updated_at??legacy?.updatedAt??null,canEdit};}
export function portraitVersion(value:FormDataEntryValue|null,stored:number){if(typeof value!=='string'||!/^\d{1,15}$/.test(value))throw new AppError('Supply the current photo version.');if(Number(value)!==stored)throw new ConflictError('This contact photo changed. Refresh before saving.');return stored;}
export function assertPortraitKey(contactId:string,key:string){const prefix='relationships/portraits/'+contactId+'/';if(!id.test(contactId)||!key.startsWith(prefix)||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key.slice(prefix.length)))throw new AppError('The stored contact portrait requires review.',409);}
