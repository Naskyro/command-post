import {unzipSync} from 'fflate';
import {AppError,ForbiddenError} from '../shared/errors.ts';
export const ccrMaxFileBytes=8*1024*1024;
export const ccrTdlrFileBytes=24*1024*1024;
export const ccrCourtFileBytes=16*1024*1024;
const invalid=()=>new AppError('Choose a valid PDF, Word (.docx), JPEG, or PNG with the matching extension.');
export async function readDocumentForm(req:Request,maxBytes=ccrMaxFileBytes):Promise<FormData>{
 const limit=maxBytes+65536;
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new ForbiddenError();
 if(Number(req.headers.get('content-length'))>limit)throw new AppError(`Choose a file up to ${maxBytes/1048576} MB.`,413);
 const mime=req.headers.get('content-type');if(!mime?.toLowerCase().startsWith('multipart/form-data')||!req.body)throw new AppError('Choose a file to upload.');
 const reader=req.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
 try{while(true){const it=await reader.read();if(it.done)break;size+=it.value.byteLength;if(size>limit){await reader.cancel();throw new AppError(`Choose a file up to ${maxBytes/1048576} MB.`,413);}chunks.push(new Uint8Array(it.value));}}finally{reader.releaseLock();}
 try{return await new Response(new Blob(chunks),{headers:{'Content-Type':mime}}).formData();}catch{throw new AppError('The uploaded form could not be read. Choose the file again.');}
}
// Only inflate the three identifying OOXML parts. Never extract embedded files or execute macros.
function validDocx(bytes:Uint8Array):boolean{
 const needed=new Set(['[Content_Types].xml','_rels/.rels','word/document.xml']),seen=new Set<string>();let count=0,total=0;
 try{
  const files=unzipSync(bytes,{filter:f=>{if(++count>2048||seen.has(f.name)||/^(?:\/|[a-z]:)|(?:^|\/)\.\.(?:\/|$)|[\\\x00]/i.test(f.name)||/(?:^|\/)vbaProject\.bin$/i.test(f.name))throw invalid();seen.add(f.name);
   if(!needed.has(f.name))return false; total+=f.originalSize;
   if(total>5*1024*1024||f.originalSize<1||!Number.isSafeInteger(f.originalSize))throw invalid();
   return true;
  }});
  if(![...needed].every(k=>files[k]?.length))return false;
  const dec=new TextDecoder(),types=dec.decode(files['[Content_Types].xml']),rels=dec.decode(files['_rels/.rels']),word=dec.decode(files['word/document.xml']);
  return /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/i.test(types)&&!/(?:macroEnabled|vbaProject)/i.test(types)&&/<(?:\w+:)?Relationship\b[^>]*\bTarget\s*=\s*["']\/?word\/document\.xml["']/i.test(rels)&&/<(?:\w+:)?document\b[^>]*xmlns(?::\w+)?\s*=\s*["'][^"']*wordprocessingml/i.test(word);
 }catch{return false;}
}
export async function validatedDocumentFile(file:File,maxBytes=ccrMaxFileBytes):Promise<{bytes:Uint8Array<ArrayBuffer>;name:string;type:string}>{
 if(!(file instanceof File)||!file.size||file.size>maxBytes)throw new AppError(`Choose a nonempty PDF, DOCX, JPEG, or PNG up to ${maxBytes/1048576} MB.`,413);
 return validatedDocumentBytes(new Uint8Array(await file.arrayBuffer()),file.name,maxBytes);
}
export function validatedDocumentBytes(bytes:Uint8Array<ArrayBuffer>,filename:string,maxBytes:number){
 if(!bytes.byteLength||bytes.byteLength>maxBytes)throw new AppError(`Choose a nonempty document up to ${maxBytes/1048576} MB.`,413);
 const name=filename.trim();if(!name||name.length>160||/[\x00-\x1f\x7f/\\]/.test(name))throw new AppError('Use a short file name without control characters or path separators.');
 const match=(sig:number[])=>sig.every((n,i)=>bytes[i]===n);
 let type='';
 if(/\.pdf$/i.test(name)&&match([0x25,0x50,0x44,0x46,0x2d]))type='application/pdf';
 else if(/\.jpe?g$/i.test(name)&&match([0xff,0xd8,0xff]))type='image/jpeg';
 else if(/\.png$/i.test(name)&&match([137,80,78,71,13,10,26,10]))type='image/png';
 else if(/\.docx$/i.test(name)&&match([0x50,0x4b,3,4])&&validDocx(bytes))type='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 else throw invalid();
 return {bytes,name,type};
}

export async function readLargeDocumentBody(req:Request):Promise<Uint8Array<ArrayBuffer>>{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new ForbiddenError();
 const size=Number(req.headers.get('x-document-size')),httpLength=req.headers.get('content-length');
 if(!Number.isSafeInteger(size)||size<1||size>ccrTdlrFileBytes||httpLength!==null&&Number(httpLength)!==size)throw new AppError('Use a nonempty TDLR document up to 24 MB.',413);
 if(!req.body||req.headers.get('content-type')!=='application/octet-stream')throw new AppError('Send the original evidence file.');
 // One fixed-size allocation bounds both fixed-length and chunked arrivals; do not make multipart copies of a 20 MB packet.
 const bytes=new Uint8Array(size),reader=req.body.getReader();let offset=0;
 try{while(true){const part=await reader.read();if(part.done)break;if(offset+part.value.byteLength>size){await reader.cancel();throw new AppError('File length exceeded the declared size.',413);}bytes.set(part.value,offset);offset+=part.value.byteLength;}}finally{reader.releaseLock();}
 if(offset!==size)throw new AppError('The upload ended before the full document arrived. Upload the original again.');
 return bytes;
}
