import type {Viewer} from '../finance/model';
import {canAccess} from '../finance/access.ts';
export const yearModules=['Finance','Compliance, Claims & Recovery','Account Management','Work Orders'] as const;
export function canOpenYearHistory(v:Viewer|undefined,module:string):boolean{
 if(!v||v.onboardingOnly||!yearModules.some(m=>m===module))return false;
 const tabs:Record<string,string[]>={Finance:['Reports & Taxes'],'Compliance, Claims & Recovery':['hearings','damage','recovery','command','calendar','licenses','tdlr'], 'Account Management':['work','courtesy','claims','safety','activity'], 'Work Orders':['orders','completed','dashboard']};
 return tabs[module].some(t=>canAccess(v,module,t));
}
