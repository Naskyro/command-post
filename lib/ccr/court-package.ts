import {unzipSync} from 'fflate';
import {classifyDocument} from './document-types.ts';
type Exhibit={path:string;name:string;documentType:string;otherDocumentType?:string;sha256:string};
export type ReviewedCase={number:string;title:string;courtName:string;partyAsPrinted:string;partyBasis:string;type:string;status:string;filedOn?:string;propertyName?:string;statement:string;newOutcome?:{result:string;on:string;stage?:string;settlementCents?:number;prevailingParty?:string;otherParty?:string};appearances?:unknown[];documents:Exhibit[]};
export type CourtPackage={cases:ReviewedCase[];data:Record<string,Uint8Array>};
const MiB=1024*1024;
export function openCourtPackage(raw:Uint8Array):CourtPackage{
 if(!raw.length||raw.length>180*MiB)throw Error('Choose a reviewed court ZIP of 180 MB or less.');
 let bytes=0,count=0;const seen=new Set<string>();
 const data=unzipSync(raw,{filter(e){if(e.name.endsWith('/'))return false;if(e.name!=='case-index.json'&&!/^documents\/[\w.-]+$/.test(e.name))throw Error('Use case-index.json and files directly in documents/.');if(e.name==='documents/..'||seen.has(e.name)||e.originalSize>(e.name==='case-index.json'?MiB:e.name.toLowerCase().endsWith('.pdf')?64*MiB:16*MiB)||++count>500||(bytes+=e.originalSize)>220*MiB)throw Error('Duplicate file or packet size limit exceeded.');seen.add(e.name);return true;}});
 if(!data['case-index.json'])throw Error('The ZIP needs a case-index.json. To add an ordinary court PDF, use Upload Document.');
 let index;try{index=JSON.parse(new TextDecoder().decode(data['case-index.json']));}catch{throw Error('The court index is not valid JSON.');}
 if(index?.format!=='pte.court.v1'||!Array.isArray(index.cases)||!index.cases.length||index.cases.length>100)throw Error('Expected a pte.court.v1 index with 1–100 reviewed cases.');
 const causes=new Set<string>();
 for(const r of index.cases){if(!r||[r.number,r.courtName,r.partyAsPrinted,r.partyBasis,r.statement,r.title].some(s=>typeof s!=='string'||!s.trim())||!Array.isArray(r.documents)||!r.documents.length)throw Error('Every case needs its court, cause number, exact company name, verification note, summary, and originals.');const key=r.courtName.toLowerCase()+':'+r.number.toLowerCase();if(causes.has(key))throw Error('The same court and cause appear twice. Combine the exhibits before import.');causes.add(key);let n=0,inline=0;
  if(!['Open','Closed','Outcome Unverified'].includes(r.status)||r.status==='Closed'&&!r.newOutcome?.on)throw Error('A closed case requires a dated disposition. Use Outcome Unverified if the ruling is missing.');
  for(const f of r.documents){if(!f||!/^documents\/[\w.-]+$/.test(f.path)||!Object.hasOwn(data,f.path)||typeof f.name!=='string'||!f.name||/[\\/\u0000-\u001f]/.test(f.name)||!/^[a-f0-9]{64}$/.test(String(f.sha256)))throw Error('Each document needs its original file, filename, and SHA-256 fingerprint.');classifyDocument('hearings',f.documentType,f.otherDocumentType);const size=data[f.path].length;if(size<=16*MiB)inline+=size;if((n+=size)>150*MiB||inline>39*MiB)throw Error('An individual case exceeds the packet limit. Import a smaller group of exhibits.');}
 }
 return {cases:index.cases,data};
}
