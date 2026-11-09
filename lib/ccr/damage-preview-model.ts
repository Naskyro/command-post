import {AppError} from '../shared/errors.ts';
export type PhotoMeta={threadId:string;sourceMessageId:string;name:string;sha256:string;bytes:number;previewSha256:string;previewBytes:number;width:number;height:number;redacted?:true};
export type PreviewItem=PhotoMeta&{jpegBase64?:string};
export type PreviewReceipt={total:number;confirmed:number;missing:number;awaitingIndex:number};
export const previewFormat='command-damage-photo-previews-v1';
const fail=()=>new AppError('Choose a reviewed damage image packet with valid source and preview fingerprints.');
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{5,160}$/.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const int=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=max;
export function previewManifest(raw:unknown,write:boolean):PreviewItem[]{
 if(!raw||typeof raw!=='object')throw fail();
 const x=raw as Record<string,unknown>;if(x.format!==previewFormat||!Array.isArray(x.items)||!x.items.length||x.items.length>(write?16:200))throw fail();
 const seen=new Set<string>();let total=0;
 return x.items.map((r:PreviewItem)=>{
  if(!r||typeof r!=='object'||!id(r.threadId)||!id(r.sourceMessageId)||typeof r.name!=='string'||r.name.length>240||!/^.+\.(?:jpe?g|png)$/i.test(r.name)||/[\\/\u0000-\u001f]/.test(r.name)||!hash(r.sha256)||!hash(r.previewSha256)||r.sha256===r.previewSha256||!int(r.bytes,24*1048576)||!int(r.previewBytes,110*1024)||!int(r.width,480)||!int(r.height,480)||(r.redacted!==undefined&&typeof r.redacted!=='boolean'))throw fail();
  const k=r.threadId+':'+r.sha256;if(seen.has(k))throw new AppError('Duplicate source image in this preview request.');seen.add(k);
  if(write&&(typeof r.jpegBase64!=='string'||r.jpegBase64.length!==4*Math.ceil(r.previewBytes/3)||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.jpegBase64)))throw fail();
  if(write&&(total+=r.previewBytes)>270*1024)throw new AppError('Choose a smaller preview batch.',413);
  return {threadId:r.threadId,sourceMessageId:r.sourceMessageId,name:r.name,sha256:r.sha256,bytes:r.bytes,previewSha256:r.previewSha256,previewBytes:r.previewBytes,width:r.width,height:r.height,...(r.redacted?{redacted:true as const}:{}),...(write?{jpegBase64:r.jpegBase64}:{})};
 });
}
/** A single baseline three-channel scan. Only the standard empty JFIF APP0 is permitted; no EXIF, GPS, ICC, comments or trailing bytes. */
export function validPreviewJpeg(b:Uint8Array,w:number,h:number){
 const bad=()=>{throw new AppError('The preview must be a stripped, baseline RGB JPEG with its declared dimensions.');};
 if(b.length<100||b[0]!==255||b[1]!==216)return bad();
 let pos=2,frame=false,sawDqt=false,sawDht=false,app=false;const u16=(i:number)=>(b[i]<<8)|b[i+1];
 while(pos+4<=b.length){if(b[pos++]!==255)return bad();const mark=b[pos++],len=u16(pos),end=pos+len;if(len<2||end>b.length)return bad();
  if(mark===224){if(app||pos!==4||len!==16||String.fromCharCode(...b.subarray(pos+2,pos+7))!=='JFIF\0'||b[pos+7]!==1||b[pos+8]>2||b[pos+14]||b[pos+15])return bad();app=true;}
  else if(mark===219){if(len<67)return bad();sawDqt=true;}
  else if(mark===196){if(len<19)return bad();sawDht=true;}
  else if(mark===192){if(frame||len!==17||b[pos+2]!==8||u16(pos+3)!==h||u16(pos+5)!==w||b[pos+7]!==3)return bad();frame=true;}
  else if(mark===218){if(!frame||!sawDqt||!sawDht||len!==12||b[pos+2]!==3||end+2>=b.length)return bad();
   for(let j=end;j<b.length;j++){if(b[j]!==255)continue;const code=b[++j];if(code===0||code>=208&&code<=215)continue;if(code===217&&j===b.length-1)return;return bad();}return bad();
  }else return bad();pos=end;
 }return bad();
}
