import type {FinRecord} from '../finance/model';
import type {HrRecord} from './model';
import {isPendingNewHire,onboardingReadiness,type SopCounts} from './sop-readiness';
import {onboardingSopCounts} from '../sop/onboarding';
/** Only called after HR record/employee access has been checked. Expose counts, not policy contents. */
export async function liveOnboardingReadiness(record:HrRecord,person:FinRecord,finance:FinRecord[],hr:HrRecord[]){
 const frozen=record.data.sopClearance as SopCounts|undefined;
 const counts=record.data.status==='Cleared'&&frozen?frozen:isPendingNewHire(person)?await onboardingSopCounts(person,finance):{required:0,signed:0};
 return onboardingReadiness(record,person,hr,counts,finance);
}
