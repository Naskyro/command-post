import type {FinRecord} from '../finance/model';
/** The employee's actual operational identity controls the gate, never an editable HR path. */
export function isPendingNewHire(person:FinRecord){return person.status!=='Former'&&person.accountStatus!=='Disabled'&&!person.onboardingClearedAt&&(person.onboardingRequired===true||person.status==='Onboarding');}
