import type {FinRecord, Viewer} from '../finance/model';
import {hrCan} from './permissions';
import {AppError, ForbiddenError} from '../shared/errors';

export const medicalAcknowledgment='I reviewed this report, including information entered for me, and it accurately reflects what I know and have reported as of the date and time shown. I can submit corrections or additional information if symptoms develop or change. This acknowledgment does not waive any rights or determine whether an injury is work-related or covered by insurance.';
export const medicalElectronicConsent='I choose to sign this report electronically.';
export const medicalResponses=['Update to report','No issues to report at this time','Private follow-up requested','Unable to provide an update'] as const;
export const medicalKinds=['Initial report','Weekly check-in','Additional update'] as const;
export type MedicalResponse=typeof medicalResponses[number];
export type MedicalKind=typeof medicalKinds[number];
export type MedicalActor={personId:string;actorId:string;name:string;at:string};
export type MedicalPermission={self:boolean;manage:boolean};
export type MedicalFile={id:string;name:string;type:string;bytes:number;sha256:string};
export type MedicalSignature={method:'Electronic'|'Paper';signerId:string;signerName:string;signedAt:string;recordedAt:string;recordedBy:MedicalActor;reportHash:string;acknowledgment:string;electronicConsent?:string;file?:MedicalFile};
export type MedicalReport={id:string;kind:MedicalKind;week?:1|2|3;reportedOn:string;response:MedicalResponse;statement:string;firstNoticedOn:string;assistance:string;workRestrictions:string;source:'Driver statement'|'Supervisor observation';preparedBy:MedicalActor;accidentOn:string;driverName:string;acknowledgment:string;reportHash:string;signatureStatus:'Awaiting driver review'|'Signed electronically'|'Signed on paper'|'Declined to sign'|'Unable to sign';signature?:MedicalSignature;dispositions:{status:'Declined to sign'|'Unable to sign';note:string;by:MedicalActor}[]};
export type FollowupContact={id:string;week:1|2|3;accidentOn?:string;status:'Contact attempted'|'No response'|'Rescheduled';note:string;by:MedicalActor};
export type AccidentLink={claimKey:string;title:string;driverId:string;driverName:string;driverStatus:string;accidentOn:string;initialReportRequested:boolean};
export type MedicalCase=AccidentLink&{id:string;version:number;createdAt:string;updatedAt:string;previousAccidentDates?:string[];reports:MedicalReport[];contacts:FollowupContact[]};
export type Followup={week:1|2|3;dueOn:string;status:'Upcoming'|'Due'|'Overdue'|'Awaiting signature'|'Completed'|'Private follow-up requested'|'Update unavailable'|'Contact attempted'|'No response'|'Rescheduled';reportId?:string;canReport:boolean};
export type MedicalCaseSummary=AccidentLink&{id:string;version:number;permissions:MedicalPermission;schedule:Followup[];pendingSignatures:number;hasReports:boolean};
export type MedicalCaseResponse={record:MedicalCase;permissions:MedicalPermission;schedule:Followup[];acknowledgment:string};

export function medicalPermissions(v:Viewer,driverId:string,people:FinRecord[]):MedicalPermission{
 const authentic=!!v.person&&!!v.id&&!v.id.startsWith('preview:')&&!v.onboardingOnly;
 return {self:authentic&&v.person===driverId,manage:authentic&&(v.owner||hrCan(v,'manageMedicalReports',driverId,people))};
}
export function requireMedicalAccess(v:Viewer,driverId:string,people:FinRecord[],managerOnly=false){const p=medicalPermissions(v,driverId,people);if(managerOnly?!p.manage:!p.self&&!p.manage)throw new ForbiddenError('Accident reports are restricted to the driver and designated medical-record reviewers.');return p;}
export function medicalDay(raw:unknown,label:string,required=true):string{
 if(!required&&(raw===undefined||raw===null||raw===''))return '';
 if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(Date.parse(raw+'T12:00:00Z'))||new Date(raw+'T12:00:00Z').toISOString().slice(0,10)!==raw)throw new AppError('Enter a valid '+label+'.');return raw;
}
export function medicalText(raw:unknown,label:string,max:number,required=false){if(raw===undefined||raw===null)raw='';if(typeof raw!=='string'||raw.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)||required&&!raw.trim())throw new AppError('Enter '+label+(max?' (up to '+max+' characters).':'.'));return raw.trim();}
export function medicalToday(at=new Date().toISOString()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));}
export function medicalDueOn(day:string,week:number){medicalDay(day,'accident date');const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+week*7);return d.toISOString().slice(0,10);}
export function medicalSchedule(record:Pick<MedicalCase,'accidentOn'|'reports'|'contacts'>,today=medicalToday()):Followup[]{
 if(!record.accidentOn)return [];
 return ([1,2,3] as const).map(week=>{
  const dueOn=medicalDueOn(record.accidentOn,week),report=record.reports.filter(r=>r.kind==='Weekly check-in'&&r.week===week&&r.accidentOn===record.accidentOn).at(-1),contact=record.contacts.filter(c=>c.week===week&&(!c.accidentOn||c.accidentOn===record.accidentOn)).at(-1);
  const status:Followup['status']=report?(report.response==='Unable to provide an update'?'Update unavailable':report.response==='Private follow-up requested'?'Private follow-up requested':report.signature?'Completed':'Awaiting signature'):contact?contact.status:dueOn<today?'Overdue':dueOn===today?'Due':'Upcoming';
  return {week,dueOn,status,...(report?{reportId:report.id}:{}),canReport:dueOn<=today};
 });
}
export function prepareMedicalReport(input:Record<string,unknown>,record:MedicalCase,v:Viewer,people:FinRecord[],at=new Date().toISOString()):Omit<MedicalReport,'reportHash'> {
 const permission=requireMedicalAccess(v,record.driverId,people),today=medicalToday(at),kind=input.kind as MedicalKind,response=input.response as MedicalResponse;
 if(!medicalKinds.includes(kind)||!medicalResponses.includes(response))throw new AppError('Choose the report type and your response.');
 const reportedOn=medicalDay(input.reportedOn,'report received date');if(reportedOn>today)throw new AppError('The report received date cannot be in the future.');
 if(record.accidentOn&&reportedOn<record.accidentOn)throw new AppError('The report received date cannot be before the accident.');
 const week=kind==='Weekly check-in'?input.week as 1|2|3:undefined;
 if(kind==='Weekly check-in'&&(![1,2,3].includes(Number(week))||typeof week!=='number'||!record.accidentOn))throw new AppError('Choose a scheduled week and record the accident date.');
 if(week&&reportedOn<medicalDueOn(record.accidentOn,week))throw new AppError('A weekly check-in can be completed on or after its due date. Use an additional update for earlier information.');
 const statement=medicalText(input.statement,'the person’s own words',8000,response==='Update to report'),firstNoticedOn=medicalDay(input.firstNoticedOn,'first noticed date',false),assistance=medicalText(input.assistance,'assistance requested',2500),workRestrictions=medicalText(input.workRestrictions,'work limitations reported',2500);
 if(firstNoticedOn&&firstNoticedOn>reportedOn)throw new AppError('The first noticed date cannot follow the report received date.');
 const source=permission.self?'Driver statement':input.source;
 if(!['Driver statement','Supervisor observation'].includes(String(source)))throw new AppError('Identify whether this records the driver’s statement or your own observation.');
 if(source==='Supervisor observation'&&response==='No issues to report at this time')throw new AppError('Only the driver’s statement can record no issues. Do not infer that response from an observation or a missed check-in.');
 return {id:crypto.randomUUID(),kind,...(week?{week}:{}),reportedOn,response,statement,firstNoticedOn,assistance,workRestrictions,source:source as MedicalReport['source'],preparedBy:{personId:v.person,actorId:v.id,name:v.name,at},accidentOn:record.accidentOn,driverName:record.driverName,acknowledgment:medicalAcknowledgment,signatureStatus:'Awaiting driver review',dispositions:[]};
}
/** The signed content is fixed; signatures and later dispositions never rewrite it. */
export function medicalReportContent(report:Omit<MedicalReport,'reportHash'>|MedicalReport){const {id,kind,week,reportedOn,response,statement,firstNoticedOn,assistance,workRestrictions,source,preparedBy,accidentOn,driverName,acknowledgment}=report;return JSON.stringify({id,kind,week:week??null,reportedOn,response,statement,firstNoticedOn,assistance,workRestrictions,source,preparedBy,accidentOn,driverName,acknowledgment});}
