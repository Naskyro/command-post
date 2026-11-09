import {AppError} from '../shared/errors.ts';
import {realDay} from './docket-model.ts';
import {canonCause,jurisdiction,plain} from './docket-import.ts';
export const factKinds=['hearing','order','notice','party','case'] as const,hearingStatuses=['Held','Scheduled','Continued','Cancelled','Unknown'] as const,judgeRoles=['Presiding','Signing','Named on Notice','Assigned','Unspecified'] as const;
export type HearingCitation={sha256:string;page:number};
export type HearingFactInput={kind:typeof factKinds[number];date?:string;time?:string;status?:typeof hearingStatuses[number];judge?:string;judgeRole?:typeof judgeRoles[number];precinct?:string;plaintiff?:string;defendant?:string;petitioner?:string;respondent?:string;prevailingParty?:string;losingParty?:string;otherParty?:string;label?:string;supersedes?:string;reason?:string;evidence:HearingCitation[]};
export type HearingFact=Omit<HearingFactInput,'evidence'>&{id:string;recordedAt:string;recordedBy:string;recordedById:string;evidence:(HearingCitation&{fileId:string;pageCount?:number})[]};
export type HearingFactsPacket={number:string;courtName:string;facts:HearingFactInput[]};
export const currentHearingFacts=(facts:readonly HearingFact[]=[]):HearingFact[]=>{const retired=new Set(facts.map(f=>f.supersedes).filter(Boolean));return facts.filter(f=>!retired.has(f.id));};
const bad=(msg:string):never=>{throw new AppError(msg);};
const obj=(o:unknown)=>!o||typeof o!=='object'||Array.isArray(o)?bad('Choose a reviewed case fact.'):o as Record<string,unknown>;
const field=(x:unknown,n=240)=>x==null||x===''?'':typeof x==='string'&&x.trim()&&x.length<=n&&!/[\x00-\x1f\x7f]/.test(x)?x.trim():bad('One of the court fact fields is invalid or too long.');
export const partyFields=['plaintiff','defendant','petitioner','respondent','prevailingParty','losingParty','otherParty'] as const;
// JP precincts and numbered county courts use the shared canonical identifier. Other
// named district/municipal/county courts require the complete printed name to match.
export const hearingCourtKey=(name:string)=>{const canonical=jurisdiction(name);if(canonical)return canonical;const s=plain(name);return s.length>=12&&/\bcourt\b/.test(s)&&(/\bdistrict\b/.test(s)&&/\bcounty\b/.test(s)||/\bmunicipal court\b/.test(s)&&s!=='municipal court'||/\bcounty court\b/.test(s)&&!/^(county court|county court at law)$/.test(s))?'named:'+s:'';};
export function readHearingPacket(x:unknown):HearingFactsPacket{const b=obj(x),number=field(b.number,100),courtName=field(b.courtName,180);
 if(!/^[a-zA-Z0-9 .:/-]+$/.test(number)||canonCause(number).length<4||!/[0-9]/.test(number)||!hearingCourtKey(courtName))return bad('Use the exact court and cause number, including county and precinct or court number.');
 if(!Array.isArray(b.facts)||!b.facts.length||b.facts.length>100)return bad('Provide 1–100 source-attested facts for this existing case.');
 const facts=b.facts.map((raw):HearingFactInput=>{const a=obj(raw),kind=a.kind as HearingFactInput['kind'];if(!factKinds.includes(kind))return bad('Separate hearings, orders, parties and case details.');
 const f:HearingFactInput={kind,evidence:[]};for(const k of ['label','date','time','judge','precinct',...partyFields,'supersedes','reason'] as const){const val=field(a[k],k==='reason'?480:k==='label'?250:240);if(val)f[k]=val;}
 if(f.date&&!realDay(f.date))return bad('Enter the date printed in the source as YYYY-MM-DD.');
 if(kind==='hearing'&&!f.date)return bad('A hearing event requires its own dated source.');if(f.time&&(kind!=='hearing'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)))return bad('Hearing time must be an Austin local time in HH:mm.');
 if(a.status!==undefined&&a.status!==''&&(!hearingStatuses.includes(a.status as typeof hearingStatuses[number])||kind!=='hearing'))return bad('Record a hearing status only on a hearing event.');
 if(kind==='hearing')f.status=(a.status||'Unknown') as HearingFactInput['status'];
 if(a.judgeRole&&!judgeRoles.includes(a.judgeRole as typeof judgeRoles[number]))return bad('Identify the judge’s documented role.');if(a.judgeRole&&!f.judge)return bad('A judicial role must identify the person in the source.');if(f.judge)f.judgeRole=(a.judgeRole||'Unspecified') as HearingFactInput['judgeRole'];
 if(f.judgeRole==='Presiding'&&(kind!=='hearing'||f.status!=='Held'))return bad('Presiding requires an identified judge at a hearing recorded as held. Use Assigned or Named on Notice for a future setting.');if(f.judgeRole==='Signing'&&kind!=='order')return bad('Record the signing judge on the order, separately from who heard the case.');
 if(kind==='notice'&&(!f.date||!f.label||f.judgeRole==='Signing'||f.judgeRole==='Presiding'))return bad('An administrative court notice requires its own date and description.');if(kind==='party'&&!partyFields.some(k=>f[k]))return bad('A party fact requires a named party and its documented role.');if(kind!=='party'&&!f.date&&!f.judge&&!f.precinct&&!partyFields.some(k=>f[k]))return bad('Record a documented date, party, judge, or precinct.');
 if(f.date&&kind==='case'&&!f.label)return bad('Describe the case date, such as Filed, without interpreting it as a hearing or order.');if(f.prevailingParty&&f.losingParty&&plain(f.prevailingParty)===plain(f.losingParty))return bad('The same party cannot be recorded as both the prevailing and losing party.');
 if(!!f.reason!==!!f.supersedes||f.supersedes&&!/^hf_[0-9a-f]{64}$/.test(f.supersedes))return bad('A correction requires an existing fact identifier and a reason.');
 if(!Array.isArray(a.evidence)||!a.evidence.length||a.evidence.length>8)return bad('Cite at least one original PDF and one-based page (up to eight references).');
 const refs=new Map<string,HearingCitation>();for(const raw of a.evidence){const c=obj(raw),sha256=field(c.sha256,64).toLowerCase(),page=c.page;if(!/^[a-f0-9]{64}$/.test(sha256)||typeof page!=='number'||!Number.isSafeInteger(page)||page<1||page>20000)return bad('Every citation requires an original SHA-256 digest and visible page number.');refs.set(sha256+':'+page,{sha256,page});}
 f.evidence=[...refs.values()].sort((a,b)=>a.sha256.localeCompare(b.sha256)||a.page-b.page);return f;});
 return {number,courtName,facts};}
const normalizeKey=(s:string)=>s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
export function factKey(f:HearingFactInput){return JSON.stringify([f.kind,f.date||'',f.time||'',f.status||'',f.judge?normalizeKey(f.judge):'',f.judgeRole||'',f.precinct?normalizeKey(f.precinct):'',...partyFields.map(k=>f[k]?normalizeKey(f[k]!):''),f.label?normalizeKey(f.label):'',f.supersedes||'',f.reason||'',f.evidence.map(c=>[c.sha256,c.page])]);}
