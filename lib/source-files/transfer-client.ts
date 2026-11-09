import {unzipSync} from 'fflate';
import {timedFetch} from '@/lib/shared/client';
import {confirmStageWrite} from '@/lib/ccr/transfer-retry';
import {DriveRequestError,driveBackoff,verifiedDriveWrite,type DriveReceiptState} from './write-receipt';
import {sourceManifest,type SourceFile,type SourceScope} from './model';
type Target={key:string;scope:SourceScope;record:Record<string,unknown>};
export type TransferItem=SourceFile&{targetFrom?:string;localName?:string;missingReason?:string;nativeOnly?:boolean};
export type TransferPacket={targets:Target[];files:TransferItem[];data:Record<string,Uint8Array>};
export function openTransfer(bytes:Uint8Array):TransferPacket{
 if(!bytes.length||bytes.length>145*1048576)throw Error('Choose a transfer packet under 145 MB.');
 let total=0;const paths=new Set<string>();
 const data=unzipSync(bytes,{filter(x){if(x.name.endsWith('/'))return false;if(paths.has(x.name)||paths.size>1200||x.name!=='transfer.json'&&!/^originals\/[a-zA-Z0-9_.-]+$/.test(x.name)||(total+=x.originalSize)>180*1048576)throw Error('Invalid packet path, duplicate entry or size.');paths.add(x.name);return true;}});
 if(!data['transfer.json']||data['transfer.json'].length>4*1048576)throw Error('The packet needs a transfer.json manifest.');
 const m=JSON.parse(new TextDecoder().decode(data['transfer.json']));if(m.format!=='pte.drive-transfer.v1'||!Array.isArray(m.records)||!Array.isArray(m.files)||m.records.length>600||m.files.length>1000||!m.records.length&&!m.files.length)throw Error('This is not a reviewed Command transfer packet.');
 const keys=new Set<string>(),used=new Set(['transfer.json']),ids=new Set<string>();
 for(const a of m.records){if(typeof a.key!=='string'||keys.has(a.key)||!['hr','hearings','damage','tdlr'].includes(a.scope)||!a.record||typeof a.record!=='object')throw Error('One of the destination records is invalid.');keys.add(a.key);}
 const files:TransferItem[]=m.files.map((raw:TransferItem)=>{const s=sourceManifest(raw,!!raw.missingReason);if(ids.has(s.driveId)||raw.targetFrom&&!keys.has(raw.targetFrom))throw Error('The file or its destination is duplicated or unknown: '+s.name);ids.add(s.driveId);
  if(raw.missingReason&&raw.localName)throw Error('An index-only entry must not contain original bytes.');if(!raw.missingReason&&!raw.nativeOnly&&(!raw.localName||!Object.hasOwn(data,raw.localName)))throw Error('Missing original: '+s.name);
  if(raw.localName){if(data[raw.localName]?.length!==s.bytes)throw Error('File length mismatch: '+s.name);used.add(raw.localName);}
  return {...s,targetFrom:raw.targetFrom,missingReason:raw.missingReason,localName:raw.localName,nativeOnly:raw.nativeOnly};});
 if(Object.keys(data).some(k=>!used.has(k)))throw Error('An unlinked file was found in this packet.');return {files,targets:m.records,data};
}
const api='/api/source-files';
type Result={status?:string;targetId?:string;recordId?:string;receiptStatus?:string;id?:string;version?:number;nextGroup?:number;groupParts?:number;parts?:number;partBytes?:number};
async function request(url:string,body:Record<string,unknown>|FormData,readOnly=false):Promise<Result>{
 const init:RequestInit=body instanceof FormData?{method:'POST',body}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)};
 for(let i=0;;i++){
  let problem:DriveRequestError;
  try{const r=await timedFetch(url,init,65000),x=await r.json().catch(()=>null) as (Result&{error?:string})|null;
   if(r.ok&&x&&typeof x==='object'&&!Array.isArray(x))return x;
   problem=new DriveRequestError((typeof x?.error==='string'?x.error+' ':'')+'Response unavailable (HTTP '+r.status+').',r.status,r.headers.get('Retry-After'),r.ok);
  }catch{problem=new DriveRequestError('Connection Interrupted · No Response Received.',0);}
  if(!readOnly||!problem.transient||i>=2)throw problem;
  await new Promise(r=>setTimeout(r,driveBackoff(i,problem.retryAfter)));
 }
}
export async function resolveTarget(t:Target,save:boolean,progress?:(s:string)=>void){
 const hr=t.scope==='hr',url=hr?'/api/source-records/hr':'/api/source-records/ccr';
 const check=()=>request(url,{action:hr?'receipt':'preview',record:t.record},true);
 const classify=(r:Result):DriveReceiptState=>hr?(r.recordId&&r.receiptStatus==='filed'?'confirmed':r.recordId&&r.receiptStatus==='missing'?'missing':'unknown'):
    (r.targetId&&r.status==='matched'?'confirmed':r.targetId&&r.status==='ready'?'missing':'unknown');
 const key=(r:Result)=>(hr?r.recordId:r.targetId)!;
 const current=await check(),state=classify(current);if(state==='confirmed')return key(current);
 if(state==='unknown')throw Error('Destination Receipt Unverified · No Submission Was Made.');if(!save)return '';
 const result=await verifiedDriveWrite(()=>request(url,{action:hr?'import':'file',record:t.record}),check,classify,
    r=>classify(r)==='confirmed'||!hr&&r.status==='created'&&!!r.targetId,progress);
 return key(result);
}
export async function fileSource(item:TransferItem,targetId:string|undefined,blob:Blob|undefined,save:boolean,progress:(s:string)=>void){
 const {missingReason,nativeOnly,localName,targetFrom,...meta}=item;const file={...meta,...(targetId?{targetId}:{})};
 const check=()=>request(api,{action:'receipt',file},true);
 const classify=(r:Result):DriveReceiptState=>r.status==='confirmed'||!!missingReason&&r.status==='reference'?'confirmed':r.status==='missing'||!missingReason&&r.status==='reference'?'missing':'unknown';
 const current=await check(),state=classify(current);if(state==='confirmed')return current.status!;if(state==='unknown')throw Error('File Receipt Unverified · No Submission Was Made.');if(!save)return 'missing';
 const fileWrite=(send:()=>Promise<Result>,ack:(r:Result)=>boolean=(r=>classify(r)==='confirmed'))=>verifiedDriveWrite(send,check,classify,ack,progress);
 if(missingReason){const reply=await fileWrite(()=>request(api,{action:'reference',file,reason:missingReason}));return reply.status!;}
 if(blob&&blob.size<=480*1024){const form=new FormData();form.set('meta',JSON.stringify(file));form.set('file',blob,file.name);return (await fileWrite(()=>request(api,form))).status!;}
 // The server resumes the same active stage for this principal and exact source manifest.
 const stage=await fileWrite(()=>request(api,{action:'start',file}),r=>r.status==='confirmed'||r.status==='ready'&&!!r.id);if(stage.status==='confirmed')return 'confirmed';
 if(nativeOnly||!blob)throw Error('No matching original is on file. Attach a verified original before marking this complete.');
 const {id,partBytes,parts,groupParts}=stage;if(!id||stage.status!=='ready'||!partBytes||!groupParts||parts!==Math.ceil(blob.size/partBytes))throw Error('Invalid upload session.');
 for(let g=stage.nextGroup||0;g<Math.ceil(parts/groupParts);g++){
  const first=g*groupParts,end=Math.min(parts,first+groupParts);
  for(let b=first;b<end;b+=3){const writes=await Promise.allSettled(Array.from({length:Math.min(3,end-b)},(_,j)=>{const i=b+j;return confirmStageWrite(api,id,'part',i,blob.slice(i*partBytes,(i+1)*partBytes,'application/octet-stream'));}));for(const w of writes)if(w.status==='rejected')throw w.reason;}
  await confirmStageWrite(api,id,'group',g);progress(Math.floor(end*100/parts)+'%');
 }
 return (await fileWrite(()=>request(api,{action:'commit',id}))).status!;
}
