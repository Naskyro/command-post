import { type FinRecord,type Viewer } from '@/lib/finance/model';
import { canAccess } from '@/lib/finance/access';
import { AppError, ForbiddenError } from '@/lib/shared/errors';
import { getRegisterForExpense } from './register-server';
import {isRecoveryCost} from './chargeback';
import { canPrepareCcrExpense,expenseFromCost,parseCostKey } from './expense-handoff';

export async function reviewExpense(v:Viewer,records:FinRecord[],id:string){
 if(!canPrepareCcrExpense(v))throw new ForbiddenError();
 const key=parseCostKey(id);if(!key)throw new AppError('Select a saved chargeback cost.');
 const r=await getRegisterForExpense(v,records,key.caseId);
 const cost=r?.category==='Chargeback'?r.chargeback?.entries.find(e=>e.id===key.entryId):undefined;
 if(!cost||!isRecoveryCost(cost))throw new AppError('Cost not found in this recovery case.',404);
 const draft=expenseFromCost(v,key.caseId,cost);
 const existing=records.find(rec=>rec.id===id);
 if(existing&&(existing.kind!=='expense'||(existing.person!==v.person&&!canAccess(v,'Finance','Outflows',true))))throw new ForbiddenError('This cost already has a Finance record. Ask the expense reviewer to check it.');
 return {draft,existing};
}
