import {AppError} from '../shared/errors.ts';
/** A settlement is not a court victory or a financial posting. */
export const settlementStages=['Before a Court Case Was Filed','After Filing, Before the Hearing','At the Courthouse Before the Hearing','During or After the Hearing','Outside Court / No Court Involved'] as const;
export const damageFactFields=['lawAgency','lawReportNumber','lawOfficer','lawContact','insuranceCarrier','insurerClaimNumber','settlementStage','settlementDate'] as const;
export type DamageFacts=Partial<Record<typeof damageFactFields[number],string>>;
export function damageFacts(input:Record<string,unknown>,old:Record<string,unknown>={},today:string):DamageFacts {
 const facts:DamageFacts={};
 for(const k of damageFactFields){
  const raw=input[k]===undefined?old[k]:input[k];
  if(raw==null||raw==='')continue;
  if(typeof raw!=='string'||raw.length>180||/[\u0000-\u001f\u007f]/.test(raw))throw new AppError('Enter a valid agency, officer, insurance, or settlement detail.');
  const val=raw.trim();if(val)facts[k]=val;
 }
 if(facts.settlementStage&&!(settlementStages as readonly string[]).includes(facts.settlementStage))throw new AppError('Choose a listed settlement stage.');
 if(facts.settlementDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(facts.settlementDate)||!Number.isFinite(Date.parse(facts.settlementDate+'T12:00Z'))||new Date(facts.settlementDate+'T12:00Z').toISOString().slice(0,10)!==facts.settlementDate||facts.settlementDate>today))throw new AppError('Use an actual settlement date on or before today.');
 if(!!facts.settlementDate!==!!facts.settlementStage)throw new AppError('Record both where the settlement was reached and its date.');
 return facts;
}
