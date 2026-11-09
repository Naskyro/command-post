import {createHash} from 'node:crypto';
import {financeDb,financeFiles} from '@/db/finance';
import {encode,decode,encryptBytes,decryptBytes} from '@/lib/hr/server';
import {AppError,ForbiddenError} from '@/lib/shared/errors';
import {validatedDocumentBytes} from './document-input';

type Fields=Record<string,string>;
export type StagedDocument={bytes:Uint8Array<ArrayBuffer>;name:string;type:string};
type Options<T>={allowResume?:boolean;maxBytes:number|((fields:Fields)=>number);authorize:(fields:Fields)=>void|Promise<void>;validate?:(bytes:Uint8Array<ArrayBuffer>,name:string,maxBytes:number,declaredMime:string)=>StagedDocument|Promise<StagedDocument>;attach:(document:StagedDocument,fields:Fields,uploadId:string)=>Promise<T>};
type Stage={resumable?:boolean;id:string;bytes:number;parts:number;name:string;declaredMime:string;sha256:string;fields:Fields;until:number};
const partBytes=512*1024, groupParts=8, groupBytes=partBytes*groupParts,hardMax=24*1024*1024;
const root='ccr-document-staging/',table='ccr_document_upload_stages';
const object=(id:string,kind:'p'|'g',i:number)=>root+id+'/'+kind+i;
const gone=()=>new AppError('This document upload expired or is unavailable. Start the upload again.',404);
const fingerprint=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
async function db<T>(f:(d:D1Database)=>Promise<T>){const d=financeDb();try{return await f(d);}catch(e){if(!/no such table:\s*(?:main\.)?ccr_document_upload_stages\b/i.test(String(e)))throw e;await d.prepare('CREATE TABLE IF NOT EXISTS '+table+' (id TEXT PRIMARY KEY, principal TEXT NOT NULL, expires INTEGER NOT NULL, parts INTEGER NOT NULL, payload TEXT NOT NULL)').run();await d.prepare('CREATE INDEX IF NOT EXISTS ccr_docstage_principal ON '+table+' (principal,expires)').run();await d.prepare('CREATE INDEX IF NOT EXISTS ccr_docstage_expiry ON '+table+' (expires)').run();return f(d);}}
async function purge(id:string,n:number){
 if(!Number.isSafeInteger(n)||n<=0||n>Math.ceil(hardMax/partBytes))return;
 const keys=Array.from({length:n},(_,i)=>object(id,'p',i)).concat(Array.from({length:Math.ceil(n/groupParts)},(_,i)=>object(id,'g',i)));
 await financeFiles().delete(keys);await db(d=>d.prepare('DELETE FROM '+table+' WHERE id=?').bind(id).run());
}
const limit=<T>(options:Options<T>,fields:Fields)=>Math.min(hardMax,typeof options.maxBytes==='number'?options.maxBytes:options.maxBytes(fields));
async function readBounded(req:Request,cap:number,expected?:number){
 const declared=req.headers.get('content-length');if(!req.body||declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>cap||expected!==undefined&&Number(declared)!==expected))throw new AppError('Invalid upload length.',413);
 const bytes=new Uint8Array(cap),reader=req.body.getReader();let offset=0;
 try{while(true){const it=await reader.read();if(it.done)break;if(it.value.length>cap-offset){await reader.cancel();throw new AppError('The upload request exceeds its limit.',413);}bytes.set(it.value,offset);offset+=it.value.length;}}finally{reader.releaseLock();}
 if(!offset||expected!==undefined&&offset!==expected)throw new AppError('The complete document part was not received.');return bytes.subarray(0,offset);
}
async function readControl(req:Request):Promise<Record<string,unknown>>{
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new AppError('Send an upload action.');
 const bytes=await readBounded(req,16*1024);try{const value=JSON.parse(new TextDecoder().decode(bytes));if(value&&typeof value==='object'&&!Array.isArray(value))return value;}catch{}throw new AppError('The document request is invalid.');
}
function parseFields(value:unknown):Fields{if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>32)throw new AppError('Choose a document destination.');const fields:Fields=Object.create(null);for(const [k,v]of Object.entries(value)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(k)||['constructor','prototype','__proto__'].includes(k)||typeof v!=='string'||v.length>1100)throw new AppError('Invalid document destination.');fields[k]=v;}return fields;}
async function load(id:unknown,principal:string){if(typeof id!=='string'||!/^[a-f\d-]{36}$/.test(id))throw gone();const row=await db(d=>d.prepare('SELECT payload FROM '+table+' WHERE id=? AND principal=? AND expires>?').bind(id,principal,Date.now()).first<{payload:string}>());if(!row)throw gone();return await decode(row.payload) as Stage;}
async function getPart(id:string,kind:'p'|'g',i:number,expected:number){const obj=await financeFiles().get(object(id,kind,i));if(!obj)throw new AppError('An upload part is missing. Re-select the original file and upload it again.');const bytes=await decryptBytes(new Uint8Array(await obj.arrayBuffer()));if(bytes.length!==expected)throw new AppError('An uploaded part failed verification.');return bytes;}
/** Authenticated per-actor/per-route, encrypted staging. Each call rechecks the destination-specific grant;
 * the final attach callback must also enforce version/idempotency and its normal write authorization. */
export async function handleDocumentStage<T>(req:Request,viewer:{id:string;person?:string|null},scope:string,options:Options<T>){
 const url=new URL(req.url);if(req.method!=='POST'||req.headers.get('origin')!==url.origin||req.headers.get('sec-fetch-site')==='cross-site'||!viewer?.id||!viewer.person||viewer.id.startsWith('preview:'))throw new ForbiddenError();
 const principal=fingerprint(JSON.stringify([scope,viewer.id,viewer.person])),q=url.searchParams,isPart=q.has('part'),b=isPart?{}:await readControl(req);
 if(b.action==='start'){
  const fields=parseFields(b.fields);await options.authorize(fields);const name=b.name,bytes=b.bytes,sum=b.sha256,declaredMime=b.declaredMime||'',max=limit(options,fields);
  if(typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<1||!Number.isFinite(max)||bytes>max||typeof sum!=='string'||!/^[a-f\d]{64}$/.test(sum)||typeof name!=='string'||name!==name.trim()||!name||name.length>160||/[\x00-\x1f\x7f\/\\]/.test(name)||typeof declaredMime!=='string'||declaredMime.length>160)throw new AppError('Invalid file name, size, or fingerprint.');
  if(b.resume===true&&options.allowResume){
   // Only inspect this actor's own unexpired sessions, and require an exact case, source, file and hash match.
   const active=await db(d=>d.prepare('SELECT payload FROM '+table+' WHERE principal=? AND expires>? ORDER BY expires DESC LIMIT 6').bind(principal,Date.now()).all<{payload:string}>());
   const canon=(f:Fields)=>JSON.stringify(Object.entries(f).sort(([a],[b])=>a.localeCompare(b)));
   for(const row of active.results){const st=await decode(row.payload) as Stage;if(st.sha256!==sum||st.name!==name||st.bytes!==bytes||st.declaredMime!==declaredMime||canon(st.fields)!==canon(fields))continue;
    const prefix=root+st.id+'/',objects=await financeFiles().list({prefix,limit:100}),receivedParts:number[]=[],sealedGroups:number[]=[];
    for(const o of objects.objects){const k=o.key.slice(prefix.length),x=/^([pg])(\d{1,2})$/.exec(k);if(!x)continue;const n=Number(x[2]),isGroup=x[1]==='g',step=isGroup?groupBytes:partBytes;
     if(n>=Math.ceil(st.bytes/step)||o.size!==Math.min(step,st.bytes-n*step)+28)continue;(isGroup?sealedGroups:receivedParts).push(n);}
    return {id:st.id,parts:st.parts,partBytes,groupParts,resumable:true,receivedParts,sealedGroups};
   }
  }
  if(b.existingOnly===true)throw new AppError('No matching active upload remains. No new upload session was opened.',409);
  const now=Date.now(),old=await db(d=>d.prepare('SELECT id,parts FROM '+table+' WHERE expires<=? ORDER BY expires LIMIT 2').bind(now).all<{id:string;parts:number}>());for(const r of old.results)await purge(r.id,r.parts);
  const id=crypto.randomUUID(),parts=Math.ceil(bytes/partBytes),until=now+2*3600000,s:Stage={id,parts,bytes,name,declaredMime,sha256:sum,fields,until,...(b.resume===true&&options.allowResume?{resumable:true}:{})},payload=await encode(s);
  const r=await db(d=>d.prepare('INSERT INTO '+table+' (id,principal,expires,parts,payload) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM '+table+' WHERE principal=? AND expires>?)<6').bind(id,principal,until,parts,payload,principal,now).run());
  if(r.meta.changes!==1)throw new AppError('Finish your outstanding uploads or wait for them to expire.',429);
  return {id,parts,partBytes,groupParts,...(b.resume===true&&options.allowResume?{resumable:true,receivedParts:[],sealedGroups:[]}: {})};
 }
 const s=await load(isPart?q.get('stage'):b.id,principal);
 if(b.action==='cancel'){await purge(s.id,s.parts);return {cancelled:true};}
 await options.authorize(s.fields);const max=limit(options,s.fields);if(!Number.isFinite(max)||s.bytes>max)throw new ForbiddenError();
 if(isPart){
  const raw=q.get('part')||'',i=Number(raw);if(!/^\d{1,2}$/.test(raw)||i>=s.parts||req.headers.get('content-type')!=='application/octet-stream')throw new AppError('Invalid document part.');
  const expected=Math.min(partBytes,s.bytes-i*partBytes),part=await readBounded(req,expected,expected);
  await financeFiles().put(object(s.id,'p',i),await encryptBytes(part),{httpMetadata:{contentType:'application/octet-stream'}});return {part:i};
 }
 if(b.action==='seal'){
  const g=b.group;if(typeof g!=='number'||!Number.isSafeInteger(g)||g<0||g>=Math.ceil(s.parts/groupParts))throw new AppError('Invalid document group.');
  const first=g*groupParts,last=Math.min(first+groupParts,s.parts),size=Math.min(groupBytes,s.bytes-g*groupBytes);
  // Bounded server-side groups keep finalization under the request-count limit even for a 24 MB packet.
  const bytes=new Uint8Array(size);for(let i=first;i<last;i++)bytes.set(await getPart(s.id,'p',i,Math.min(partBytes,s.bytes-i*partBytes)),(i-first)*partBytes);
  await financeFiles().put(object(s.id,'g',g),await encryptBytes(bytes),{httpMetadata:{contentType:'application/octet-stream'}});return {group:g};
 }
 if(b.action==='attach'){
  const bytes=new Uint8Array(s.bytes);for(let i=0;i<Math.ceil(s.parts/groupParts);i++)bytes.set(await getPart(s.id,'g',i,Math.min(groupBytes,s.bytes-i*groupBytes)),i*groupBytes);
  if(fingerprint(bytes)!==s.sha256){if(options.allowResume)await purge(s.id,s.parts).catch(()=>{});throw new AppError('The original file fingerprint does not match. Nothing was attached.');}
  const document=await(options.validate||validatedDocumentBytes)(bytes,s.name,max,s.declaredMime);
  const result=await options.attach(document,s.fields,s.id);await purge(s.id,s.parts).catch(()=>{});return result;
 }
 throw new AppError('Choose a valid document upload action.');
}

// Internal only: the public surface must authorize the exact native target and compare
// each candidate against its reviewed source BEFORE returning a match, never a stage listing.
export async function scopedStageCandidates(viewer:{id:string;person?:string|null},scope:string){
 if(!viewer?.id||!viewer.person||viewer.id.startsWith('preview:'))throw new ForbiddenError();const p=fingerprint(JSON.stringify([scope,viewer.id,viewer.person]));const active=await db(d=>d.prepare('SELECT payload FROM '+table+' WHERE principal=? AND expires>? ORDER BY expires DESC LIMIT 6').bind(p,Date.now()).all<{payload:string}>());return Promise.all(active.results.map(r=>decode(r.payload) as Promise<Stage>));
}
