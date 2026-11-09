type PersonNames = {[key:string]:unknown;name?:unknown;preferredName?:unknown;legalName?:unknown;fullName?:unknown};
const value=(name:unknown)=>typeof name==='string'?name.trim():'';

/** The name coworkers see. A preferred name is entered exactly as it should display. */
export function displayPersonName(person:PersonNames|null|undefined):string {
 return person?value(person.preferredName)||value(person.name):'';
}

/** Official documents and payroll use the canonical name, never a preferred-name substitution. */
export function legalPersonName(person:PersonNames|null|undefined):string {
 return person?value(person.legalName)||value(person.name)||value(person.fullName):'';
}

/** Safe public identity fields; legal names and HR demographics are deliberately absent. */
export function publicPersonIdentity(person:PersonNames):{name:string;preferredName?:string;pronouns?:string} {
 const preferredName=value(person.preferredName),pronouns=value((person as PersonNames&{pronouns?:unknown}).pronouns);
 return {name:displayPersonName(person),...(preferredName?{preferredName}:{}),...(pronouns?{pronouns}:{})};
}
