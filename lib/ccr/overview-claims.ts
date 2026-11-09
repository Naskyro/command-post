import type {Row} from '../accounts/model';
import type {HrRecord} from '../hr/model';
import type {DamageIntake} from './damage-intake-model';
import type {ClaimLine} from './overview';
import {claimDirectory} from './claim-directory.ts';
import {uniqueIncidentIntakes} from './reports.ts';

function latest<T extends {id:string;version:number}>(rows:T[]):T[]{
 const current=new Map<string,T>();
 for(const row of rows){const old=current.get(row.id);if(!old||row.version>old.version)current.set(row.id,row);}
 return [...current.values()];
}

/** Use the claim directory's live records and status defaults, with linked intake
 * evidence counted once under its native investigation rather than as a new case. */
export function overviewClaimLines(accounts:Row[],assets:HrRecord[],intakes:DamageIntake[],today?:string):ClaimLine[]{
 const properties=latest(accounts).filter(r=>r.kind!=='claim'||r.status!=='Deleted'),employeeClaims=latest(assets),incidentIntakes=latest(intakes);
 const cards=claimDirectory(properties,employeeClaims,today,uniqueIncidentIntakes(incidentIntakes,properties,employeeClaims));
 return cards.map(c=>({id:c.key,version:c.property?.version??c.asset?.version??c.intake?.version,source:c.property?'property':c.asset?'asset':'intake',title:c.title,status:c.status,dueOn:c.next,major:c.major}));
}
