import {AppError,ConflictError} from '../shared/errors.ts';
import {classifyDocument} from './document-types.ts';
import {caseTypes,realDay,type Matter} from './docket-model.ts';
export const importFileLimit=16*1024*1024,importBytesLimit=40*1024*1024,importFilesLimit=40;
const reject=(s:string):never=>{throw new AppError(s);};
const text=(v:unknown,len:number,must=false)=>{if(v==null&&!must)return '';if(typeof v!=='string'||v.length>len||/[\x00-\x08\x0b-\x1f\x7f]/.test(v)||must&&!v.trim())return reject('Check the required import fields and their lengths.');return v.trim();};
export const plain=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[’‘'`]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const legal='galindos towing and transport',trade='parking and towing enforcement';
export function verifiedPteParty(v:string){const s=plain(v).replace(/\bl l c\b/g,'llc').replace(/\bd b a\b/g,'dba').replace(/\bdoing business as\b/g,'dba');return new Set([legal,legal+' llc',trade,...[legal,legal+' llc'].flatMap(l=>[l+' dba '+trade,l+' '+trade])]).has(s);}
export function jurisdiction(name:string){
 const s=plain(name);if(/\b(?:municipal|city of|district court)\b/.test(s))return '';
 const t=s.split(' '),counties=new Set<string>(),compound=new Set(['san','de','el','la','red','van','jim','jeff','palo','fort','tom','deaf','live']);
 for(let i=0;i<t.length;i++)if(t[i]==='county'){
  const prev=t[i-1];if(t[i+1]==='of'&&/^[a-z]+$/.test(t[i+2]||'')){const start=t[i+2];counties.add(compound.has(start)&&/^[a-z]+$/.test(t[i+3]||'')?start+' '+t[i+3]:start);}
  else if(prev&&/^[a-z]+$/.test(prev)&&!['in','of','the','for','at','court','texas','tx','a','and','civil'].includes(prev)){counties.add(compound.has(t[i-2])?t[i-2]+' '+prev:prev);}
 }
 if(counties.size!==1)return '';const county=[...counties][0];
 // County-court appeals are separate causes from a JP matter even when the parties or citation overlap.
 if(/\bcounty court at law\b/.test(s)){const n=s.match(/\bcounty court at law\s*(?:(?:no|number)\s*)?(\d{1,2})\b/);return n&&Number(n[1])>0?county+'|at-law|'+Number(n[1]):'';}
 if(!/\b(?:justice of (?:the )?peace|justice court|justice precinct|jp)\b/.test(s))return '';
 const precinct=s.match(/\b(?:precinct|pct|jp)\s*(?:(?:no|number)\s*)?([1-8])\b/)?.[1];
 return precinct?county+'|jp|'+precinct:'';
}
export const canonCause=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,'');
export async function shaHex(bytes:BufferSource){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
export type ImportDoc={name:string;sha256:string;documentType:string;otherDocumentType?:string;stagedId?:string};
export function sourceManifest(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))return reject('Choose a verified court import manifest.');
 const b=input as Record<string,unknown>,number=text(b.number,100,true),title=text(b.title,150,true),courtName=text(b.courtName,180,true),partyAsPrinted=text(b.partyAsPrinted,220,true),partyBasis=text(b.partyBasis,900,true),propertyName=text(b.propertyName,200),statement=text(b.statement,2000,true),status=text(b.status,25,true),type=text(b.type,35,true),filedOn=text(b.filedOn,10),jur=jurisdiction(courtName),cause=canonCause(number);
 if(!jur||cause.length<4||!/[0-9]/.test(cause)||!/^[A-Za-z0-9 .:/-]+$/.test(number))return reject('Use the printed cause number and identify the county and JP precinct or numbered County Court at Law.');
 if(!verifiedPteParty(partyAsPrinted))return reject('Only the exact verified company or DBA appearing as a named party may be imported; City and ambiguous designations require review.');
 if(!caseTypes.includes(type as Matter['type'])||!['Open','Closed','Outcome Unverified'].includes(status)||filedOn&&!realDay(filedOn))return reject('Verify the case type, status, and filing date.');
 if(!Array.isArray(b.documents)||!b.documents.length||b.documents.length>importFilesLimit)return reject('Include 1 to 40 original court files per case.');
 const docs:ImportDoc[]=b.documents.map(d=>{if(!d||typeof d!=='object'||Array.isArray(d))return reject('Check the original document manifest.');const name=text(d.name,160,true),sha256=text(d.sha256,64,true).toLowerCase();if(/[\\/\x00-\x1f]/.test(name)||!/[.](pdf|docx|png|jpe?g)$/i.test(name)||!/^[a-f0-9]{64}$/.test(sha256))return reject('Each original needs a matching file name and SHA-256 digest.');const stagedId=text(d.stagedId,64);if(stagedId&&!/^[a-f0-9-]{36}$/.test(stagedId))return reject('Invalid protected document stage.');return {name,sha256,...(stagedId?{stagedId}:{}),...classifyDocument('hearings',d.documentType,d.otherDocumentType)};});
 if(status==='Closed'&&!b.newOutcome||status!=='Closed'&&b.newOutcome!=null)return reject('A disposition may be imported only with a documented closed outcome.');
 const raw=b.appearances??[];if(!Array.isArray(raw)||raw.length>100)return reject('Use a list of sourced appearances.');
 const appearances=raw.map(a=>{if(!a||typeof a!=='object'||typeof a.label!=='string'||!a.label.trim()||a.label.length>90||!realDay(a.date)||!['Scheduled','Attended','Cancelled','Continued','Historical Setting'].includes(a.status))return reject('Only use appearances with documented dates and statuses.');return {label:a.label,date:a.date,time:text(a.time,5),status:a.status};});
 const relatedInput=b.relatedCauses??[];if(!Array.isArray(relatedInput)||relatedInput.length>24)return reject('Check the related cause numbers.');const relatedCauses:string[]=[],relatedSeen=new Set<string>();for(const x of relatedInput){const token=text(x,100,true),canon=canonCause(token);if(canon.length<4||!/[0-9]/.test(canon)||!/^[A-Za-z0-9 .:/-]+$/.test(token)||canon===cause)return reject('Use separate, verified cause numbers for related cases.');if(!relatedSeen.has(canon)){relatedSeen.add(canon);relatedCauses.push(token);}}
 return {number,title,courtName,relatedCauses,causeCategory:text(b.causeCategory,100),partyAsPrinted,partyBasis,propertyName,statement,status:status as Matter['status'],type:type as Matter['type'],filedOn,jur,cause,docs,appearances,newOutcome:b.newOutcome};
}
export function terminalEvidence(ds:Pick<ImportDoc,'name'|'documentType'>[],outcome:unknown){
 if(!outcome||typeof outcome!=='object'||Array.isArray(outcome))return false;
 const settled=(outcome as Record<string,unknown>).result==='Settled';
 const allowed=new Set(['Court Disposition / Order','Certified Copy of Judgment','Final Judgment','Findings of Fact and Conclusions of Law',...(settled?['Settlement Agreement and Release']:[])]);
 return ds.some(d=>allowed.has(d.documentType)&&!/(?:notice of (?:a |non consent |nonconsent |tow )?hearing|hearing notice|proposed (?:judgment|order)|settlement offer)/i.test(plain(d.name)));
}
export function matchPrior(rows:Matter[],id:string,cause:string,jur:string){
 const matches=rows.filter(m=>canonCause(m.number)===cause),scoped=matches.filter(m=>jurisdiction(m.courtName||'')===jur),idMatch=rows.find(m=>m.id===id);
 if(scoped.length>1||idMatch&&scoped[0]?.id!==idMatch.id||matches.some(m=>!jurisdiction(m.courtName||'')))throw new ConflictError('The prior docket contains an ambiguous or changed court identity for this cause. Review the records manually.');
 return scoped[0] as Matter|undefined;
}
