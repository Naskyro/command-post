import {AppError} from '../shared/errors.ts';
import {realDay} from './docket-model.ts';
import {canonCause} from './docket-import.ts';
import {hearingCourtKey} from './hearing-facts.ts';
export const sides=['PTE','Opposing Party','Co-Respondent','Other Party'] as const;
export const states=['Represented','Self-Represented','Unknown'] as const;
export const statuses=['As Documented','Current','Former'] as const;
export type CounselSource={kind:'Court PDF';sha256:string;page:number}|{kind:'Support Email';messageId:string;threadId?:string;date:string;label:string}|{kind:'Company Confirmation';date:string;label:string};
export type CounselInput={side:typeof sides[number];client:string;state:typeof states[number];status:typeof statuses[number];attorney?:string;firm?:string;email?:string;phone?:string;address?:string;from?:string;through?:string;note?:string;supersedes?:string;reason?:string;evidence:CounselSource[]};
export type CounselRecord=CounselInput&{id:string;by:string;byId:string;at:string};
export type CounselFile={id:string;name:string;sha256:string;bytes:number;pages:number;by:string;at:string};
export type CounselPacket={number:string;courtName:string;representations:CounselInput[]};
export const currentCounsel=(arr:CounselRecord[])=>{const replaced=new Set(arr.map(c=>c.supersedes));return arr.filter(c=>!replaced.has(c.id));};
function bad(s:string):never{throw new AppError(s);}
const object=(x:unknown)=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:bad('Enter a counsel record.');
const f=(x:unknown,n=240)=>x==null||x===''?'':typeof x==='string'&&x.trim()&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x)?x.trim():bad('A source or representation field contains invalid characters or is too long.');
const day=(x:unknown)=>{const v=f(x,10);if(v&&!realDay(v))bad('Use a valid YYYY-MM-DD date.');return v;};
const sel=<T extends string>(x:unknown,opts:readonly T[])=>opts.includes(x as T)?x as T:bad('Select a listed party, representation and status.');
export function readCounselSource(raw:unknown):CounselSource{const s=object(raw);
 if(s.kind==='Support Email'||s.kind==='Company Confirmation'){const date=day(s.date),label=f(s.label,320);if(!date||!label)bad('The source needs a date and a short factual label.');if(s.kind==='Company Confirmation')return {kind:s.kind,date,label};const id=f(s.messageId,64),thread=f(s.threadId,64);if(!/^[0-9a-f]{8,64}$/i.test(id)||thread&&!/^[0-9a-f]{8,64}$/i.test(thread))bad('Use the verified Gmail message and optional thread IDs, not links or message contents.');return {kind:s.kind,date,label,messageId:id.toLowerCase(),...(thread?{threadId:thread.toLowerCase()}:{})};}
 if(s.kind&&s.kind!=='Court PDF')bad('Choose an available evidence source.');
 const sha256=f(s.sha256,64).toLowerCase(),page=s.page;if(!/^[0-9a-f]{64}$/.test(sha256)||!Number.isInteger(page)||Number(page)<1||Number(page)>20000)bad('A court PDF requires a SHA-256 and a numbered source page.');return {kind:'Court PDF',sha256,page:Number(page)};
}
export function readCounselPacket(raw:unknown):CounselPacket{const x=object(raw),courtName=f(x.courtName,180),number=f(x.number,100);if(!hearingCourtKey(courtName)||!/^[-a-z0-9 .:/]+$/i.test(number)||canonCause(number).length<4||!/[0-9]/.test(number))bad('Identify the case by its documented court and cause number.');const records=x.representations;if(!Array.isArray(records)||!records.length||records.length>80)bad('Submit 1–80 representation records for a case.');
 return {courtName,number,representations:records.map(raw=>{const r=object(raw),c:CounselInput={side:sel(r.side,sides),client:f(r.client),state:sel(r.state,states),status:sel(r.status||'As Documented',statuses),evidence:[]};
 if(!c.client)bad('Name the person or organization represented.');for(const k of ['attorney','firm','email','phone','address','note','reason','supersedes'] as const){const v=f(r[k],k==='note'||k==='reason'?500:240);if(v)c[k]=v;}
 if(c.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))bad('Enter a valid business email.');if(c.phone&&!/^\+?[\d\s().x#-]{7,40}$/i.test(c.phone))bad('Enter a valid business phone.');
 if(c.state==='Represented'&&!c.attorney&&!c.firm)bad('Name the documented attorney or firm.');if(c.state!=='Represented'&&(c.attorney||c.firm||c.email||c.phone||c.address))bad('Self-represented and unknown parties do not have counsel contact details.');
 for(const k of ['from','through'] as const){const v=day(r[k]);if(v)c[k]=v;}if(c.from&&c.through&&c.from>c.through||c.through&&c.status==='Current')bad('Check the date range and representation status.');
 if(!!c.supersedes!==!!c.reason||c.supersedes&&!/^at_[a-f0-9]{64}$/.test(c.supersedes))bad('A correction needs the current representation record and a reason.');
 if(!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>8)bad('Cite at least one and no more than eight sources.');const sources=r.evidence.map(readCounselSource);
 c.evidence=[...new Map(sources.map(v=>[JSON.stringify(v),v])).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);return c;})};}
export function counselEnvelope(raw:unknown){const x=object(raw);if(x.format!=='pte.court-counsel.v1'||!Array.isArray(x.cases)||!x.cases.length||x.cases.length>200)bad('Choose a pte.court-counsel.v1 packet with 1–200 cases.');const cases=x.cases.map(readCounselPacket),keys=cases.map(r=>hearingCourtKey(r.courtName)+'|'+canonCause(r.number));if(new Set(keys).size!==keys.length)bad('Combine entries for each cause and court.');return cases;}
