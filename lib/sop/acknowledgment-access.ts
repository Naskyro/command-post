import {canAccess} from '@/lib/finance/access';
import type {Viewer} from '@/lib/finance/model';
/** The existing SOP reader lets library readers, assignees and editors sign their own published policies. */
export function canReadGeneralSop(v:Viewer|undefined){
 return !!v&&!v.onboardingOnly&&(canAccess(v,'SOP Library','library')||canAccess(v,'SOP Library','assigned')||canAccess(v,'SOP Library','workflow',true));
}

/** Active employees may always read the employee-facing standards of published HR-CA policies. */
export function canOpenAcknowledgments(v:Viewer|undefined){
 return !!v&&!v.onboardingOnly&&(v.companyPolicyReader===true||canReadGeneralSop(v));
}
export function canEnterPersonalSopTab(v:Viewer|undefined,module:string,tab?:string){
 return module==='SOP Library'&&canOpenAcknowledgments(v)&&(!tab||tab==='assigned'||tab==='library');
}
