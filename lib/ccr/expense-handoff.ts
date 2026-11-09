import { canAccess } from '../finance/access.ts';
import type { FinRecord,Viewer } from '../finance/model';
import { AppError, ForbiddenError } from '../shared/errors.ts';
import {isRecoveryCost,type ChargeEntry} from './chargeback.ts';

const prefix='ccr-cost:';
export function canPrepareCcrExpense(v:Viewer|undefined){
 return !!v?.person&&!v.onboardingOnly&&!v.id.startsWith('preview:')&&canAccess(v,'Compliance, Claims & Recovery','recovery',true)&&(canAccess(v,'Finance','My spending',true)||canAccess(v,'Finance','Outflows',true));
}
export function costKey(caseId:string,entryId:string){if(!/^[\w-]{1,90}$/.test(caseId)||!/^[\w-]{1,64}$/.test(entryId))throw new AppError('Invalid cost reference.');return prefix+caseId+':'+entryId;}
export function parseCostKey(id:string){if(!id.startsWith(prefix))return null;const fields=id.substring(prefix.length).split(':');if(fields.length!==2||costKey(fields[0],fields[1])!==id)throw new AppError('Invalid cost reference.');return {caseId:fields[0],entryId:fields[1]};}
export function expenseFromCost(v:Viewer,caseId:string,cost:ChargeEntry): FinRecord {
 if(!canPrepareCcrExpense(v))throw new ForbiddenError();
 if(!isRecoveryCost(cost)||!Number.isSafeInteger(cost.cents)||cost.cents<=0)throw new AppError('Only recorded company costs can be prepared as expenses.');
 // The receipt reference is free text in CCR: it may include a name, legal narrative,
 // evidence filename or customer identifier. Only opaque case/line IDs may cross over.
 return {id:costKey(caseId,cost.id),kind:'expense',version:0,person:v.person,date:cost.day,amount:cost.cents/100,description:cost.kind,status:'Draft',receipt:'Not attached',receiptReason:'Supporting document retained in CCR.',source:'CCR Case '+caseId+' / Cost Entry '+cost.id};
}
