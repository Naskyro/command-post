import type {Matter} from './docket-model';
export const outcomeLabels={won:'Won',lost:'Lost',settled:'Settled',mixed:'Mixed Rulings',dismissed:'Dismissed',withdrawn:'Withdrawn',other:'Other Dispositions',active:'Open Cases',unverified:'Outcome Unverified'} as const;
export type OutcomeGroup=keyof typeof outcomeLabels;
export type OutcomeFilter='all'|OutcomeGroup;
export const primaryOutcomes=['won','lost','settled'] as const;
export const additionalOutcomes=['mixed','dismissed','withdrawn','other','active','unverified'] as const;
export const validOutcomeFilter=(v:unknown):OutcomeFilter=>typeof v==='string'&&Object.hasOwn(outcomeLabels,v)?v as OutcomeGroup:'all';
export const sectionOutcome=(raw?:string)=>raw?.startsWith('outcome:')?validOutcomeFilter(raw.slice(8)):'all';
export function courtResultGroup(m:Pick<Matter,'status'|'statements'>):OutcomeGroup{
 if(m.status==='Open')return 'active';
 if(m.status!=='Closed')return 'unverified';
 // Appended notes can follow a ruling without superseding it. The most recently
 // recorded structured disposition wins only when the proceeding is actually closed.
 const result=(m.statements||[]).findLast(s=>s.outcome)?.outcome?.result;
 switch(result){case 'PTE Won':return 'won';case 'PTE Lost':return 'lost';case 'Settled':return 'settled';case 'Mixed Ruling':return 'mixed';case 'Dismissed':return 'dismissed';case 'Withdrawn':return 'withdrawn';case 'Other Disposition':return 'other';default:return 'unverified';}
}
export function courtOutcomeCounts(rows:Pick<Matter,'status'|'statements'>[]){
 const counts={all:rows.length,won:0,lost:0,settled:0,mixed:0,dismissed:0,withdrawn:0,other:0,active:0,unverified:0};
 for(const row of rows)counts[courtResultGroup(row)]++;
 return counts;
}
