import {unzipSync} from 'fflate';
import {parseDamageManifest,type DamageManifest} from './damage-intake-model.ts';
import {classifyDocument} from './document-types.ts';
const MiB=1048576;
export type DamageExhibit={path:string;name:string;sha256:string;documentType:string;otherDocumentType?:string;sourceMessageId?:string};
export type ReviewedDamage=DamageManifest&{documents:DamageExhibit[]};
export type DamagePackage={records:ReviewedDamage[];data:Record<string,Uint8Array>};
export const uploadLimit=180*MiB;
export function readDamagePackage(raw:Uint8Array):DamagePackage{
 if(!raw.length||raw.length>uploadLimit)throw Error('Choose a reviewed ZIP of 180 MB or less.');
 let total=0;const seen=new Set<string>();
 const data=unzipSync(raw,{filter(f){if(f.name.endsWith('/'))return false;if(!/^[a-zA-Z0-9][a-zA-Z0-9_. /()-]*$/.test(f.name)||f.name.split('/').some(s=>s==='..'||s==='.'||!s)||seen.has(f.name)||seen.size>=500||f.originalSize>(f.name==='records.json'?2*MiB:24*MiB)||(total+=f.originalSize)>225*MiB)throw Error('The archive contains an invalid path, duplicate file or oversized document.');seen.add(f.name);return true;}});
 if(!data['records.json'])throw Error('records.json is missing from the ZIP.');
 const index=JSON.parse(new TextDecoder().decode(data['records.json']));
 if(!Array.isArray(index)||!index.length||index.length>150)throw Error('Include between 1 and 150 reviewed claims.');
 const sources=new Set<string>(),used=new Set(['records.json']);
 const records=index.map(raw=>{
  const r=parseDamageManifest(raw);const ids=new Set(r.references.flatMap(x=>['t:'+x.threadId,'m:'+x.messageId]));
  for(const id of ids){if(sources.has(id))throw Error('A source belongs to more than one claim in this packet.');sources.add(id);}
  if(raw.documents!==undefined&&!Array.isArray(raw.documents))throw Error('Use a list of evidence documents.');
  const docs=(raw.documents||[]) as DamageExhibit[],hashes=new Set<string>();
  if(docs.length>200)throw Error('Include no more than 200 originals per claim.');
  for(const f of docs){if(!f||typeof f.path!=='string'||!Object.hasOwn(data,f.path)||f.path==='records.json'||!data[f.path].length||typeof f.name!=='string'||f.name.length>240||/[\\/\u0000-\u001f]/.test(f.name)||!/[.](pdf|png|jpe?g|docx)$/i.test(f.name)||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.sha256)||hashes.has(f.sha256)||f.sourceMessageId&&!r.references.some(x=>x.messageId===f.sourceMessageId))throw Error('Check each original, file type, fingerprint, and source message in '+r.title+'.');classifyDocument('damage',f.documentType,f.otherDocumentType);hashes.add(f.sha256);used.add(f.path);}
  return {...r,documents:docs};
 });
 if(Object.keys(data).some(k=>!used.has(k)))throw Error('The ZIP contains an original that is not linked to a claim.');
 return {records,data};
}
export async function verifyDamageBytes(p:DamagePackage){
 for(const r of p.records)for(const f of r.documents){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(p.data[f.path])));if(Array.from(h,b=>b.toString(16).padStart(2,'0')).join('')!==f.sha256)throw Error('The original does not match the recorded fingerprint: '+f.name);}
}
