import type {FinRecord} from '../finance/model';
/** Present the actual account gate separately from employment status. */
export function userLifecycleState(person:FinRecord):'Active'|'Onboarding'|'Deactivated'{
 if(person.accountStatus==='Disabled'||person.status==='Former')return 'Deactivated';
 if(person.status==='Onboarding'||person.onboardingRequired===true&&!person.onboardingClearedAt)return 'Onboarding';
 return 'Active';
}
