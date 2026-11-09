import {validatedDocumentBytes} from './document-input.ts';
const dims=(w:number,h:number)=>w>0&&h>0&&w<=65535&&h<=65535;
function jpeg(b:Uint8Array){
 if(b.length<32||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)return false;
 let i=2,frame=false;
 while(i+3<b.length){if(b[i++]!==255)return false;while(b[i]===255)i++;const marker=b[i++];if(marker===217||marker===216)return false;
 const size=b[i]*256+b[i+1];if(size<2||i+size>b.length)return false;if(marker===218)return frame&&size>=6;
 if([192,193,194].includes(marker)){if(size<11||!dims(b[i+5]*256+b[i+6],b[i+3]*256+b[i+4]))return false;frame=true;}i+=size;}
 return false;
}
function png(b:Uint8Array){if(b.length<57||![137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return false;
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(v.getUint32(8)!==13||v.getUint32(12)!==0x49484452||!dims(v.getUint32(16),v.getUint32(20)))return false;let i=8,idat=false;
 while(i+12<=b.length){const len=v.getUint32(i),type=v.getUint32(i+4);if(len>b.length-i-12)return false;if(type===0x49444154)idat=true;if(type===0x49454E44)return !len&&idat&&i+12===b.length;i+=12+len;}return false;
}
/** Keep the original source filename, bytes and fingerprint; infer only a structurally identified safe raster MIME.
 Never treat a wrong extension, submitted MIME, SVG or HTML as authority for serving executable content. */
export function validateDamageSourceBytes(bytes:Uint8Array<ArrayBuffer>,name:string,limit:number,allowSourceMismatch=true){
 try{return validatedDocumentBytes(bytes,name,limit);}catch(e){if(!allowSourceMismatch||bytes.length>limit||name.trim().length>160)throw e;const source=name.trim();
 const ext=/\.png$/i.test(source)&&jpeg(bytes)?'.jpg':/\.jpe?g$/i.test(source)&&png(bytes)?'.png':'';
 if(!ext)throw e;const safe=validatedDocumentBytes(bytes,source.replace(/\.[^.]+$/,ext),limit);return {...safe,name:source};}
}
