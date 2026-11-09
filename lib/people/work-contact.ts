import type {FinRecord} from '../finance/model';
import {AppError} from '../shared/errors.ts';

const clean=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():'';
const usernamePattern=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const hostEmailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const workEmailPattern=/^[a-z0-9._+-]+@(gtowingtransport\.com|parkingtowingenforcement\.com)$/;
export const suggestedUsername=(name:unknown)=>clean(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'').slice(0,64);
// Used inside the insert itself: two simultaneous HR creates cannot both claim a username.
// Admin provisioning already locks every roster version and the roster count in its transaction.
export const rosterUsernameConflictSql="SELECT 1 FROM finance_records WHERE kind='person' AND (lower(id) IN (lower(?),lower(?)) OR lower(COALESCE(NULLIF(json_extract(payload,'$.username'),''),id)) IN (lower(?),lower(?)))";

/** The hosted identity and the human-readable standalone ID are independent. */
export function commandUsername(person:FinRecord):string{
 const candidate=clean(person.username||person.id);
 return usernamePattern.test(candidate)?candidate:'';
}
export function defaultWorkContactEligible(person:FinRecord,records:FinRecord[]):boolean{
 if(records.some(r=>r.kind==='department'&&r.status!=='Retired'&&r.head===person.id))return true;
 const level=String(person.authorityLevel||person.organizationalLevel||'');
 if(level)return ['Manager','Department Lead','Director','Department Lead / Director','Executive'].includes(level);
 if(['Owner','Department Head','Department head','Supervisor','Director of Operations'].includes(String(person.role)))return true;
 return /\b(manager|supervisor|director|department head)\b/i.test(String(person.title||''));
}
/** Never infer a work address from a login, a personal address, a local part or a department. */
export function workContactEmail(person:FinRecord,records:FinRecord[]=[]):string{
 const recorded=clean(person.companyEmail);
 return recorded&&(person.workEmailConfirmed===true||defaultWorkContactEligible(person,records))?recorded:'';
}
export function setWorkContact(next:FinRecord,old:FinRecord|undefined,records:FinRecord[],submitted:unknown){
 if(old&&submitted===undefined)return;
 const value=clean(submitted);
 if(submitted!==undefined&&typeof submitted!=='string')throw new AppError('Enter a valid company mailbox.');
 if(value&&(value.length>254||!workEmailPattern.test(value)))throw new AppError('Enter a valid company mailbox.');
 // Retain an original, private value that was suppressed at rollout when an unrelated form is saved.
 if(old&&!value&&!workContactEmail(old,records)&&old.companyEmail){next.companyEmail=old.companyEmail;return;}
 next.companyEmail=value;
 // Preserve legacy visibility until someone deliberately assigns a new work contact.
 if(!old||value!==clean(old.companyEmail)||Boolean(value&&!workContactEmail(old,records)))next.workEmailConfirmed=Boolean(value);
}
export function prepareContactIdentity(next:FinRecord,old:FinRecord|undefined,records:FinRecord[],submitted?:Record<string,unknown>){
 const username=commandUsername(next);
 if((!old||next.username)&&!username)throw new AppError('Choose a username of 3–64 letters, numbers, dots, underscores, or dashes. Do not use an email address.');
 if(old&&next.username!==undefined&&clean(next.username)!==commandUsername(old))throw new AppError('Changing a work contact cannot change a sign-in username.');
 if(!old){
  if(records.some(r=>r.kind==='person'&&r.id!==next.id&&(commandUsername(r)===username||clean(r.id)===username||commandUsername(r)===clean(next.id))))throw new AppError('That username belongs to another user.');
  next.username=username;
 }
 // Contact editing never enrolls an additional authentication identity; existing bindings are retained.
 const email=clean(next.email);
 if(email&&(email.length>254||!hostEmailPattern.test(email)))throw new AppError('The saved sign-in identifier is invalid. Ask an administrator to check the existing account link.');
 if(old&&email!==clean(old.email))throw new AppError('An existing hosted sign-in cannot be changed through contact details.');
 next.email=email;
 next.emailAliases=old&&Array.isArray(old.emailAliases)?old.emailAliases.filter((value):value is string=>typeof value==='string'):[];
 if(email&&records.some(r=>r.kind==='person'&&r.id!==next.id&&[r.email,...(Array.isArray(r.emailAliases)?r.emailAliases:[])].some(e=>clean(e)===email)))throw new AppError('That sign-in mailbox belongs to another user.');
 setWorkContact(next,old,records,submitted?submitted.companyEmail:next.companyEmail);
}
