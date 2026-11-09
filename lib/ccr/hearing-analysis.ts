import {AppError} from '../shared/errors.ts';
import {courtResultGroup,courtOutcomeCounts,outcomeLabels,validOutcomeFilter,type OutcomeFilter} from './court-outcomes.ts';
import {realDay,type Matter} from './docket-model.ts';
import {currentHearingFacts} from './hearing-facts.ts';
export const dateBases=['Held Hearing','Scheduled Hearing','Continued or Cancelled Setting','Filed Date','Signed Order','Notice Issued','Disposition Date'] as const;
export const judgeRoles=['Presiding','Signing','Named on Notice','Assigned','Unspecified'] as const;
export const partyRoles=['Any Recorded Party','Plaintiff','Defendant','Petitioner','Respondent','Prevailing Party','Losing Party','Other Party'] as const;
const keys=['plaintiff','defendant','petitioner','respondent','prevailingParty','losingParty','otherParty'] as const;
const groupOptions=['Judge','Court','Precinct','PTE Outcome'] as const;
const need=(x:string,all:readonly string[])=>all.includes(x)?x:(()=>{throw new AppError('Choose a listed hearing-report filter.');})();
export function hearingFilters(value:Record<string,unknown>){
 const get=(k:string,d='')=>{const v=value[k];if(v==null||v==='')return d;if(typeof v!=='string'||v.length>220)throw new AppError('Invalid hearing-report filter.');return v.trim();};
 const from=get('from'),to=get('to');if(from&&!realDay(from)||to&&!realDay(to)||from&&to&&from>to)throw new AppError('Enter a valid date range.');
 return {basis:need(get('basis','Signed Order'),dateBases),judgeRole:need(get('judgeRole','Signing'),judgeRoles),partyRole:need(get('partyRole',partyRoles[0]),partyRoles),group:need(get('group','Judge'),groupOptions),from,to,judge:get('judge'),court:get('court'),precinct:get('precinct'),outcome:validOutcomeFilter(get('outcome')),party:get('party')};
}
const uniq=(a:(string|undefined)[])=>[...new Set(a.filter((x):x is string=>!!x))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
const unknown='Not Recorded',matched=(x:string[],q:string)=>!q||x.includes(q),withUnknown=(x:string[])=>x.length?x:[unknown];
export function analyzeHearings(input:Matter[],filters:ReturnType<typeof hearingFilters>){
 const rows=[...new Map(input.map(m=>[m.id,m])).values()],meta={courts:new Set<string>(),precincts:new Set<string>(),judges:new Set<string>()};
 // Normalize case and typographic accents for grouping only; original spellings remain in the source record.
 const spellings=new Map<string,string>(),judgeKey=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim().toLowerCase();
 for(const m of rows)for(const f of currentHearingFacts(m.hearingFacts||[])){if(!f.judge)continue;const k=judgeKey(f.judge),was=spellings.get(k);if(!was||/\p{M}/u.test(f.judge.normalize('NFD'))&&!/\p{M}/u.test(was.normalize('NFD')))spellings.set(k,f.judge);}
 const canonicalJudge=(s?:string)=>s?(spellings.get(judgeKey(s))||s):undefined,whichJudge=canonicalJudge(filters.judge)||'';
 const summary=new Map<string,{cases:number;won:number;lost:number;settled:number;mixed:number;dismissed:number;withdrawn:number;other:number;active:number;unverified:number}>();const selected:Matter[]=[];
 const details:{id:string;number:string;title:string;court:string;precinct:string;judges:string;dates:string;outcome:string;parties:string;won:string;lost:string}[]=[];
 let excludedUnknownDate=0,unknownJudge=0;
 for(const m of rows){
  const facts=currentHearingFacts(m.hearingFacts||[]),court=m.courtName||unknown,ruled=[...m.statements].reverse().find(x=>x.outcome)?.outcome;
  const type=filters.basis,courtPrecinct=/\b(?:precinct|pct\.?)[\s#:-]*(\d+[A-Za-z]?)/i.exec(court)?.[1];
  const county=/^(.+? County)\b/i.exec(court)?.[1]||'';
  const pcl=(v:string)=>{const match=/^(?:precinct|pct\.?|p)?[\s#:-]*(\d+[A-Za-z]?)$/i.exec(v.trim());return match?(county?county+' · ':'')+'Precinct '+match[1]:v;};
  const pubs=uniq(facts.map(f=>f.precinct?pcl(f.precinct):undefined)),precincts=pubs.length?pubs:courtPrecinct?[pcl(courtPrecinct)]:[/County Court at Law|District Court/i.test(court)?'Not a JP Court':unknown];
  meta.courts.add(court);precincts.forEach(p=>meta.precincts.add(p));
  const judgeFacts=facts.filter(f=>f.judge&&f.judgeRole===filters.judgeRole);
  const allJudges=withUnknown(uniq(judgeFacts.map(f=>canonicalJudge(f.judge))));allJudges.forEach(j=>meta.judges.add(j));
  const datedFacts=facts.filter(f=>type==='Signed Order'?f.kind==='order':type==='Notice Issued'?f.kind==='notice':type==='Filed Date'?f.kind==='case':f.kind==='hearing'&&(type==='Held Hearing'?f.status==='Held':type==='Scheduled Hearing'?f.status==='Scheduled':type==='Continued or Cancelled Setting'?['Continued','Cancelled'].includes(f.status||''):false));
  const sameEvent=(type==='Held Hearing'&&filters.judgeRole==='Presiding'||type==='Signed Order'&&filters.judgeRole==='Signing'||type==='Scheduled Hearing'&&filters.judgeRole==='Named on Notice');
  const inRange=(d?:string)=>!!d&&(!filters.from||d>=filters.from)&&(!filters.to||d<=filters.to);
  const dateRange=Boolean(filters.from||filters.to);
  const datesBase=uniq([...datedFacts.map(f=>f.date),type==='Disposition Date'?ruled?.on:undefined,type==='Filed Date'?m.filedOn:undefined]);
  let eligible=datedFacts.filter(f=>!dateRange||inRange(f.date));
  const judges=withUnknown(uniq((sameEvent?eligible.filter(f=>f.judgeRole===filters.judgeRole):judgeFacts).map(f=>canonicalJudge(f.judge))));
  const result=courtResultGroup(m);
  const party=Object.fromEntries(keys.map(k=>[k,uniq([...facts.map(f=>f[k]),k==='prevailingParty'?ruled?.prevailingParty:k==='otherParty'?ruled?.otherParty:undefined])])) as Record<typeof keys[number],string[]>;
  const pkey=keys[partyRoles.indexOf(filters.partyRole as typeof partyRoles[number])-1],partyValues=pkey?party[pkey]:Object.values(party).flat();
  if(!matched([court],filters.court)||!matched(precincts,filters.precinct)||filters.outcome!=='all'&&result!==filters.outcome||filters.party&&!partyValues.some(p=>p.toLowerCase().includes(filters.party.toLowerCase())))continue;
  if(dateRange&&!datesBase.length){if(matched(allJudges,whichJudge))excludedUnknownDate++;continue;}
  if(dateRange&&!datesBase.some(inRange))continue;
  if(!matched(judges,whichJudge))continue;
  if(sameEvent&&whichJudge)eligible=eligible.filter(f=>(f.judgeRole===filters.judgeRole&&canonicalJudge(f.judge)||unknown)===whichJudge);
  const showDates=(sameEvent?uniq(eligible.map(f=>f.date)):datesBase).filter(d=>!dateRange||inRange(d));
  const displayJudges=whichJudge?[whichJudge]:judges;
  // No-range reports retain cases with missing dates/judges and show an explicit unknown bucket.
  selected.push(m);if(displayJudges.includes(unknown))unknownJudge++;
  const groups=filters.group==='Judge'?displayJudges:filters.group==='Court'?[court]:filters.group==='Precinct'?(filters.precinct?[filters.precinct]:precincts):[outcomeLabels[result]];
  for(const group of groups){const bucket=summary.get(group)||{cases:0,won:0,lost:0,settled:0,mixed:0,dismissed:0,withdrawn:0,other:0,active:0,unverified:0};bucket.cases++;bucket[result]++;summary.set(group,bucket);}
  const roles=keys.filter(k=>party[k].length).map(k=>partyRoles[keys.indexOf(k)+1]+': '+party[k].join('; '));
  details.push({id:m.id,number:m.number,title:m.title,court,precinct:precincts.join('; '),judges:displayJudges.join('; '),dates:showDates.join('; ')||unknown,outcome:outcomeLabels[result],parties:roles.join(' | ')||unknown,won:party.prevailingParty.join('; ')||unknown,lost:party.losingParty.join('; ')||unknown});
 }
 const counts=courtOutcomeCounts(selected),denom=counts.won+counts.lost,frac=(n:number,d:number)=>d?Math.round(1000*n/d)/10:null;
 const grouped=[...summary].map(([label,r])=>({label,...r,winRate:frac(r.won,r.won+r.lost),share:frac(r.cases,counts.all)})).sort((a,b)=>b.cases-a.cases||a.label.localeCompare(b.label));
 return {meta:{courts:uniq([...meta.courts]),precincts:uniq([...meta.precincts]),judges:uniq([unknown,...meta.judges])},counts,unknownJudge,excludedUnknownDate,denominator:denom,winRate:frac(counts.won,denom),groups:grouped,details:details.sort((a,b)=>a.number.localeCompare(b.number)),filters};
}
export type HearingAnalysis=ReturnType<typeof analyzeHearings>;
