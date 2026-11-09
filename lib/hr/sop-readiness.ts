import type {FinRecord} from '../finance/model';
import type {HrRecord} from './model';
import {onboardingStepsFor} from './model.ts';
import {readiness} from './workflow.ts';

export const sopStepLabel='Employee SOP Signatures';
export type SopCounts={required:number;signed:number};
export {isPendingNewHire} from './sop-gate.ts';
export function onboardingReadiness(record:HrRecord,person:FinRecord,hr:HrRecord[],counts:SopCounts,finance:FinRecord[]=[]){
 const steps=onboardingStepsFor(person,record.data,finance),base=readiness(record,person,hr,finance),required=counts.required,signed=counts.signed;
 const pending=Math.max(0,required-signed);
 return {ready:base.ready&&!pending,issues:pending?[...base.issues,sopStepLabel]:base.issues,sop:{required,signed,pending},total:steps.length+required,completed:steps.length-base.issues.length+signed};
}
