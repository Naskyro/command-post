import type { FinRecord, Viewer } from '../finance/model';
import type { HrRecord } from '../hr/model';
import { hrCan } from '../hr/permissions.ts';
import { canUseHr } from '../hr/workflow.ts';
import { AppError, ConflictError, ForbiddenError } from '../shared/errors.ts';

/** Private employee details are stored encrypted in HR, never in the shared finance roster. */
export const personalDetailFields = ['homeAddress','homeAddress2','city','state','postalCode','personalEmail','genderDescription','personalPhone','dateOfBirth','emergencyContactName','emergencyContactRelationship','emergencyContactPhone','secondaryEmergencyContactName','secondaryEmergencyContactRelationship','secondaryEmergencyContactPhone','allergies','allergyNotes','identityDocumentType','identityDocumentNumber','identityIssuingState','identityExpirationDate'] as const;
export type PersonalDetailsField = typeof personalDetailFields[number];
export type PersonalDetailsData = Partial<Record<PersonalDetailsField,string>>;
export const allergyOptions = ['Not Provided','No Known Allergies','Allergies Reported'] as const;
export const identityDocumentTypes = ['Driver’s License','State ID'] as const;
export const personalDetailsRecordId = (personId:string) => 'hrpersonal:' + personId;

/** Generic personnel visibility is intentionally insufficient for medical and identity details. */
export function canReadPersonalDetails(viewer:Viewer, personId:string, records:FinRecord[]):boolean {
 if(!canUseHr(viewer)||!records.some(person=>person.kind==='person'&&person.id===personId))return false;
 if(viewer.person===personId)return true;
 if(viewer.onboardingOnly)return false;
 return ['managePersonnel','manageOnboarding'].some(action=>hrCan(viewer,action,personId,records));
}
export const canEditPersonalDetails = canReadPersonalDetails;

const limits:Record<PersonalDetailsField,number>={homeAddress:200,homeAddress2:200,city:100,state:100,postalCode:25,personalEmail:254,genderDescription:150,personalPhone:40,dateOfBirth:10,emergencyContactName:150,emergencyContactRelationship:100,emergencyContactPhone:40,secondaryEmergencyContactName:150,secondaryEmergencyContactRelationship:100,secondaryEmergencyContactPhone:40,allergies:30,allergyNotes:2000,identityDocumentType:40,identityDocumentNumber:100,identityIssuingState:100,identityExpirationDate:10};
function validDate(value:string,label:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new AppError('Enter a valid '+label+'.');}

/** A partial edit keeps unedited details; explicit empty strings clear a field. */
export function sanitizePersonalDetails(input:unknown, old:PersonalDetailsData={}, asOf=new Date().toISOString().slice(0,10)):PersonalDetailsData {
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('Submit the personal details.');
 const next:PersonalDetailsData={};
 for(const field of personalDetailFields)if(typeof old[field]==='string')next[field]=old[field];
 for(const [field,value] of Object.entries(input)){
  if(!personalDetailFields.includes(field as PersonalDetailsField))throw new AppError('Personal details cannot change '+field+'.');
  if(typeof value!=='string')throw new AppError('Enter text for '+field.replace(/([A-Z])/g,' $1').toLowerCase()+'.');
  const key=field as PersonalDetailsField,clean=value.trim();
  if(clean.length>limits[key])throw new AppError('Shorten '+field.replace(/([A-Z])/g,' $1').toLowerCase()+' to '+limits[key]+' characters or fewer.');
  next[key]=clean;
 }
 if(next.personalEmail){next.personalEmail=next.personalEmail.toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.personalEmail))throw new AppError('Enter a valid personal email address.');}
 if(next.dateOfBirth){validDate(next.dateOfBirth,'date of birth');if(next.dateOfBirth>asOf)throw new AppError('Date of birth cannot be in the future.');}
 if(next.identityExpirationDate)validDate(next.identityExpirationDate,'identity-document expiration date');
 if(next.identityDocumentType&&!identityDocumentTypes.includes(next.identityDocumentType as typeof identityDocumentTypes[number]))throw new AppError('Choose Driver’s License or State ID.');
 if(!next.allergies)next.allergies='Not Provided';
 if(!allergyOptions.includes(next.allergies as typeof allergyOptions[number]))throw new AppError('Choose a valid allergy disclosure.');
 if(next.allergies!=='Allergies Reported')next.allergyNotes='';
 if(next.allergies==='Allergies Reported'&&!next.allergyNotes)throw new AppError('Enter the reported allergies or needed response information.');
 for(const field of ['personalPhone','emergencyContactPhone','secondaryEmergencyContactPhone'] as const){const value=next[field];if(value&&(!/^[+\d().\-\s#xext]+$/i.test(value)||value.replace(/\D/g,'').length<7))throw new AppError('Enter a valid '+(field==='personalPhone'?'personal':'emergency contact')+' phone number.');}
 if((next.identityDocumentNumber||next.identityIssuingState||next.identityExpirationDate)&&!next.identityDocumentType)throw new AppError('Choose the identity document type.');
 return next;
}

export function preparePersonalDetails(body:Record<string,unknown>, old:HrRecord|undefined, viewer:Viewer, records:FinRecord[], at=new Date().toISOString()):HrRecord {
 const personId=String(body.personId||'');
 if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(personId))throw new AppError('Choose a valid employee.');
 if(!canEditPersonalDetails(viewer,personId,records))throw new ForbiddenError('Personal details are available only to this employee and their assigned personnel or onboarding administrator.');
 if(old&&(old.id!==personalDetailsRecordId(personId)||old.kind!=='personal'||old.personId!==personId))throw new AppError('Personal details require administrator review.',409);
 if(!Number.isInteger(body.version)||Number(body.version)<0||body.version!==(old?.version||0))throw new ConflictError('These personal details changed. Refresh before saving.');
 return {id:personalDetailsRecordId(personId),kind:'personal',personId,version:(old?.version||0)+1,createdAt:old?.createdAt||at,createdBy:old?.createdBy||viewer.name,updatedAt:at,updatedBy:viewer.name,data:{...sanitizePersonalDetails(body.data,old?.data as PersonalDetailsData|undefined,at.slice(0,10)),status:'Recorded'}};
}
