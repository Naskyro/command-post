import type { FinRecord, Viewer } from '../finance/model';
import {isDriverPerson} from '../people/driver-role.ts';
import {isPendingNewHire} from './sop-gate.ts';

export const hrKinds = ['inventory','assignment','assetClaim','onboarding','note','corrective','position','policy','task','benefit','offboarding','i9','w4','w9','bank','screening','document','personal','education','vacancy','candidate'] as const;
export type HrKind = typeof hrKinds[number];
export type HrRecord = { id:string; kind:HrKind; personId?:string; version:number; data:Record<string,unknown>; createdAt:string; createdBy:string; updatedAt:string; updatedBy:string };
export type HrData = { viewer:Viewer; people:FinRecord[]; orgNodes?:FinRecord[]; departments?:FinRecord[]; records:HrRecord[]; permissions:string[]; correctiveReferences?:{id:string;title:string;category:string;version:string;group:string}[]; secureStorageAvailable:boolean; dashboard?:import('./dashboard').HrDashboard;leaveRequests?:FinRecord[] };
export const sensitiveKinds = new Set<HrKind>(['i9','w4','w9','bank','screening','personal','education']);
export const documentCategories = ['APD License',"Driver's License",'Passport','Social Security Card','TDLR License','Asset Evidence','Background Check','Bank Authorization','Corrective Action','Driver Insurance Confirmation','Drug Screen','Evidence','Form I-9','Form W-4','Form W-9','Job Description','Offer Letter','Other Personnel Document','Policy Acknowledgment','Resume','Signed Corrective Action','Training Record'] as const;
export const onboardingSteps = [
 {key:'offer',label:'Signed Offer Letter',owner:'Employee',required:true},
 {key:'jobDescription',label:'Signed Job Description',owner:'Employee',required:true},
 {key:'i9',label:'I-9 Employer Verification',owner:'Employer',required:true},
 {key:'tax',label:'Signed Tax Form',owner:'Employee',required:true},
 {key:'payment',label:'Payment Setup',owner:'Employee',required:true},
 {key:'payTerms',label:'Approved Pay and Benefits',owner:'Employer',required:true},
 {key:'drug',label:'Passed Drug Screen',owner:'Employer',required:true},
 {key:'background',label:'Background Review or Assigned Follow-Up',owner:'Employer',required:true},
 {key:'orientation',label:'Access and Yard Safety Orientation',owner:'Employer',required:true},
] as const;
export const driverInsuranceStep={key:'driverInsurance',label:'Driver Added to Commercial Auto Insurance',owner:'Employer',required:true} as const;
export type OnboardingStepKey=typeof onboardingSteps[number]['key']|typeof driverInsuranceStep.key;
export function onboardingStepsFor(person:FinRecord|undefined,data:Record<string,unknown>={},records:FinRecord[]=[]){
 const recorded=Array.isArray(data.tasks)&&data.tasks.some(task=>task&&typeof task==='object'&&(task as Record<string,unknown>).key===driverInsuranceStep.key);
 return recorded||person&&isPendingNewHire(person)&&isDriverPerson(person,records)?[...onboardingSteps,{...driverInsuranceStep,assignedTo:String(person?.supervisor||'')}]:[...onboardingSteps];
}
export function blankOnboarding(path='New Hire',person?:FinRecord,records:FinRecord[]=[]){return {path,status:'In Progress',tasks:onboardingStepsFor(person,{},records).map(s=>({...s,status:'Pending'}))};}
export const performanceCategories = ['Attendance','Conduct','Confidentiality','Customer Service','Documentation','Finance','Safety','Other'];
export const correctiveActions = ['Written Warning','Final Written Warning','Performance Improvement Plan','Suspension Review','Termination Review'];
export const disagreementReasons = ['Facts Are Incorrect','Important Context Is Missing','Policy Was Not Clear','I Disagree With the Outcome','Other'];
