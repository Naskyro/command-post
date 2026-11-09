import {createHash} from 'node:crypto';
import {financeDb,financeFiles} from '@/db/finance';
import {encode,decode,encryptBytes,decryptBytes} from '@/lib/hr/server';
import type {Viewer} from '@/lib/finance/model';
import {AppError,ForbiddenError} from '@/lib/shared/errors';
import {validatedDocumentFile} from './document-input';
import {docketAccess,type CourtDocument} from './docket-model';
export const chunkSize=384*1024,partsPerGroup=16,largeFileMax=64*1024*1024;
export type Stage={version?:2;id:string;parts:number;name:string;bytes:number;sha256:string;expire:number};
export type Chunks={size:number;count:number};
const hash=()=>createHash('sha256'),actor=(id:string)=>hash().update(id).digest('hex');
const stageKey=(id:string,i:number)=>'ccr-court-staging/'+id+'/p'+i;
const groupSize=chunkSize*partsPerGroup,groups=(s:Stage)=>s.version===2?Math.ceil(s.parts/partsPerGroup):s.parts;
const pieceKey=(id:string,i:number)=>'ccr-court-staging/'+id+'/piece'+i;
const extMime:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
export const stageMime=(s:Stage)=>extMime[s.name.split('.').at(-1)?.toLowerCase()||''];
const auth=(v:Viewer)=>{if(!v.id||!v.person||v.id.startsWith('preview:')||!docketAccess(v,true))throw new ForbiddenError();};
const gone=()=>new AppError('This upload expired or is unavailable. Start the upload again.',404);
async function database<T>(run:(db:D1Database)=>Promise<T>):Promise<T>{const db=financeDb();try{return await run(db);}catch(e){if(!/no such table:\s*(?:main\.)?ccr_court_upload_stages\b/i.test(String(e)))throw e;await db.prepare('CREATE TABLE IF NOT EXISTS ccr_court_upload_stages(id TEXT PRIMARY KEY,actor TEXT NOT NULL,expires_at INTEGER NOT NULL,parts INTEGER NOT NULL,payload TEXT NOT NULL)').run();await db.prepare('CREATE INDEX IF NOT EXISTS ccr_stage_expiry ON ccr_court_upload_stages(expires_at)').run();await db.prepare('CREATE INDEX IF NOT EXISTS ccr_stage_actor ON ccr_court_upload_stages(actor)').run();return run(db);}}
async function purge(id:string,parts:number){if(parts<1||parts>200)return;await financeFiles().delete([...Array.from({length:Math.max(Math.min(parts,32),Math.ceil(parts/partsPerGroup))},(_,i)=>stageKey(id,i)),...Array.from({length:parts},(_,i)=>pieceKey(id,i))]);await database(db=>db.prepare('DELETE FROM ccr_court_upload_stages WHERE id=?').bind(id).run());}
export async function startCourtStage(v:Viewer,b:Record<string,unknown>){auth(v);const name=b.name,bytes=b.bytes,sha256=b.sha256;
 if(typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>160||!/\.(pdf|docx|jpe?g|png)$/i.test(name)||/[\x00-\x1f\x7f/\\]/.test(name)||typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<=0||bytes>(name.toLowerCase().endsWith('.pdf')?largeFileMax:16*1024*1024)||typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256))throw new AppError('Choose a nonempty original. PDFs may be up to 64 MB; DOCX, JPG and PNG up to 16 MB.');
 const now=Date.now(),owner=actor(v.id),old=await database(db=>db.prepare('SELECT id,parts FROM ccr_court_upload_stages WHERE expires_at<? ORDER BY expires_at LIMIT 3').bind(now).all<{id:string;parts:number}>());for(const r of old.results)await purge(r.id,r.parts);
 const id=crypto.randomUUID(),parts=Math.ceil(bytes/chunkSize),stage={version:2,id,parts,name,bytes,sha256,expire:now+2*3600000},payload=await encode(stage);
 const inserted=await database(db=>db.prepare('INSERT INTO ccr_court_upload_stages(id,actor,expires_at,parts,payload) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM ccr_court_upload_stages WHERE actor=? AND expires_at>?)<48').bind(id,owner,stage.expire,parts,payload,owner,now).run());
 if(inserted.meta.changes!==1)throw new AppError('Finish or cancel your outstanding court uploads before starting another.',429);return {id,chunkSize,parts,partsPerGroup};
}
export async function courtStage(v:Viewer,id:unknown){auth(v);if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw gone();const row=await database(db=>db.prepare('SELECT payload FROM ccr_court_upload_stages WHERE id=? AND actor=? AND expires_at>?').bind(id,actor(v.id),Date.now()).first<{payload:string}>());if(!row)throw gone();return decode(row.payload) as Promise<Stage>;}
export async function cancelCourtStage(v:Viewer,id:unknown){const s=await courtStage(v,id);await purge(s.id,s.parts);}
export async function putCourtPart(v:Viewer,id:string,i:number,req:Request){const s=await courtStage(v,id);if(s.version!==2)throw new AppError('Start the original upload again.');if(!Number.isInteger(i)||i<0||i>=s.parts)throw new AppError('Invalid document part.');const size=Math.min(chunkSize,s.bytes-i*chunkSize);
 if(!req.body||Number(req.headers.get('content-length'))>size||req.headers.get('content-type')!=='application/octet-stream')throw new AppError('Invalid document part.');const data=new Uint8Array(size),reader=req.body.getReader();let cursor=0;try{while(true){const {done,value}=await reader.read();if(done)break;if(cursor+value.length>size){await reader.cancel();throw new AppError('Invalid document part size.',413);}data.set(value,cursor);cursor+=value.length;}}finally{reader.releaseLock();}
 if(cursor!==size)throw new AppError('The original part size is invalid.');
 await financeFiles().put(s.parts===1?stageKey(s.id,i):pieceKey(s.id,i),await encryptBytes(data),{httpMetadata:{contentType:'application/octet-stream'}});return {part:i};
}
export async function sealCourtGroup(v:Viewer,id:string,g:number){const s=await courtStage(v,id);if(s.version!==2||!Number.isInteger(g)||g<0||g>=groups(s))throw new AppError('Invalid original block.');
 if(s.parts===1)return {group:g};const start=g*partsPerGroup,end=Math.min(start+partsPerGroup,s.parts),buf=new Uint8Array(Math.min(groupSize,s.bytes-start*chunkSize)),bucket=financeFiles();
 // Bound each worker invocation to sixteen small read operations. Temporary pieces remain available for idempotent group retries until completion or expiry.
 for(let i=start;i<end;i+=4){await Promise.all(Array.from({length:Math.min(4,end-i)},async(_,j)=>{const n=i+j,o=await bucket.get(pieceKey(s.id,n));if(!o)throw new AppError('An original part is missing. Retry the upload.');const plain=await decryptBytes(new Uint8Array(await o.arrayBuffer()));if(plain.byteLength!==Math.min(chunkSize,s.bytes-n*chunkSize))throw new AppError('The staged part size is invalid.');buf.set(plain,(n-start)*chunkSize);}));}
 await bucket.put(stageKey(s.id,g),await encryptBytes(buf),{httpMetadata:{contentType:'application/octet-stream'}});return {group:g};}
export async function finalizeCourtStage(s:Stage,key:string,keys:string[]){const bucket=financeFiles(),h=hash(),n=groups(s),outSize=s.version===2?groupSize:4*1024*1024,mime=stageMime(s);let length=0;const docx=mime===extMime.docx?new Uint8Array(s.bytes):null;
 for(let i=0;i<n;i++){const obj=await bucket.get(stageKey(s.id,i));if(!obj)throw new AppError('A document block is missing. Upload the original again.');const enc=new Uint8Array(await obj.arrayBuffer()),bytes=await decryptBytes(enc);
 if(bytes.byteLength!==Math.min(outSize,s.bytes-i*outSize))throw new AppError('The staged original is incomplete.');if(docx)docx.set(bytes,length);else if(i===0){const sig=bytes.slice(0,32);await validatedDocumentFile(new File([sig],s.name),largeFileMax);}
 length+=bytes.length;h.update(bytes);const k=key+'/p'+i;keys.push(k);await bucket.put(k,enc,{httpMetadata:{contentType:'application/octet-stream'}});}
 if(length!==s.bytes||h.digest('hex')!==s.sha256)throw new AppError('The complete original fingerprint does not match. No document was attached.');if(docx)await validatedDocumentFile(new File([docx],s.name),16*1024*1024);return {size:outSize,count:n};}
export async function finishCourtStage(s:Stage){await purge(s.id,s.parts).catch(()=>{});}
export async function streamCourtDocument(file:CourtDocument,chunks:Chunks,key:string){
 const bucket=financeFiles(),read=async(i:number)=>{const obj=await bucket.get(key+'/p'+i);if(!obj)throw new AppError('The stored original is unavailable.',503);const bytes=await decryptBytes(new Uint8Array(await obj.arrayBuffer()));if(bytes.byteLength!==Math.min(chunks.size,file.bytes-i*chunks.size))throw new AppError('The stored document could not be verified.',503);return bytes;};
 // No successful response header until all immutable authenticated chunks verify against the original fingerprint.
 const h=hash();let count=0;for(let i=0;i<chunks.count;i++){const p=await read(i);count+=p.length;h.update(p);}if(count!==file.bytes||h.digest('hex')!==file.sha256)throw new AppError('The stored document could not be verified.',503);
 let i=0;return new ReadableStream<Uint8Array>({async pull(c){if(i>=chunks.count){c.close();return;}try{c.enqueue(await read(i++));}catch(e){c.error(e);}}});
}
