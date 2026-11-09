import {AppError,ConflictError} from '../shared/errors.ts';
import {assertPortraitKey,type StoredPortrait} from './portraits.ts';
import type {Viewer} from '../finance/model';
export const readPortraitFrom=(db:D1Database,id:string)=>db.prepare('SELECT contact_id,version,storage_key,mime,updated_at,updated_by FROM relationship_portraits WHERE contact_id=?').bind(id).first<StoredPortrait>();
export async function portraitBytesFrom(bucket:R2Bucket,row:StoredPortrait){if(!row.storage_key||!row.mime)throw new AppError('No photo is available.',404);assertPortraitKey(row.contact_id,row.storage_key);if(!['image/jpeg','image/png','image/webp'].includes(row.mime))throw new AppError('The stored contact portrait requires review.',409);const file=await bucket.get(row.storage_key);if(!file)throw new AppError('This contact photo is temporarily unavailable.',404);return {body:file.body,mime:row.mime};}
export async function savePortraitTo(db:D1Database,bucket:R2Bucket,contactId:string,old:StoredPortrait|null,image:{bytes:Uint8Array;mimeType:string}|null,v:Viewer){const at=new Date().toISOString(),version=(old?.version||0)+1,storageKey=image?'relationships/portraits/'+contactId+'/'+crypto.randomUUID():null,mime=image?.mimeType||null;
 if(old?.storage_key)assertPortraitKey(contactId,old.storage_key);
 if(image&&storageKey)await bucket.put(storageKey,image.bytes.buffer as ArrayBuffer,{httpMetadata:{contentType:image.mimeType,cacheControl:'private,no-store'}});
 const row:StoredPortrait={contact_id:contactId,version,updated_at:at,updated_by:v.person,storage_key:storageKey,mime};const guard=crypto.randomUUID();
 try {await db.batch([old?db.prepare('UPDATE relationship_portraits SET storage_key=?,mime=?,updated_at=?,updated_by=?,version=? WHERE contact_id=? AND version=?').bind(storageKey,mime,at,v.person,version,contactId,old.version):db.prepare('INSERT OR IGNORE INTO relationship_portraits(contact_id,version,storage_key,mime,updated_at,updated_by) VALUES(?,?,?,?,?,?)').bind(contactId,version,storageKey,mime,at,v.person),db.prepare('INSERT INTO account_write_guard(id,success) VALUES(?,changes())').bind(guard),db.prepare('INSERT INTO account_audit(id,record_id,account_id,actor,actor_id,at,action,before,after) VALUES(?,?,NULL,?,?,?,?,?,?)').bind(guard,contactId,v.name,v.id,at,image?'Updated Relationship Photo':'Removed Relationship Photo',old?JSON.stringify({entity:'Contact Portrait',version:old.version,hasPhoto:!!old.storage_key}):null,JSON.stringify({entity:'Contact Portrait',version,hasPhoto:!!storageKey})),db.prepare('DELETE FROM account_write_guard WHERE id=?').bind(guard)]);}
 catch(e){if(storageKey&&e instanceof Error&&/account_write_succeeded|UNIQUE constraint/.test(e.message))try{await bucket.delete(storageKey);}catch{/* Inaccessible orphan; eligible for maintenance cleanup. */}if(e instanceof Error&&/account_write_succeeded|UNIQUE constraint/.test(e.message))throw new ConflictError('Another employee changed this photo. Refresh before saving.');throw e;}
 if(old?.storage_key)try{await bucket.delete(old.storage_key);}catch{/* No application pointer to old bytes remains. */}return row;}

import type {Row} from '../accounts/model';
import {legacyPortrait} from './portraits.ts';
/** Caller authorizes these specific contact IDs. Omitted = none; 0 = legacy; positive = canonical photo revision. */
export async function contactPhotoVersionsFrom(db:D1Database,contactIds:string[],rows:Row[]=[]):Promise<Record<string,number>>{
 const ids=new Set(contactIds),result:Record<string,number>=Object.create(null);if(!ids.size)return result;
 for(const row of rows){const contact=typeof row.contactId==='string'?row.contactId:'';if(row.kind==='file'&&ids.has(contact)&&legacyPortrait([row],contact))result[contact]=0;}
 const found=await db.prepare('SELECT contact_id,version,storage_key IS NOT NULL AS present FROM relationship_portraits WHERE contact_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...ids])).all<{contact_id:string;version:number;present:number}>();
 for(const entry of found.results){if(entry.present)result[entry.contact_id]=entry.version;else delete result[entry.contact_id];}return result;
}
