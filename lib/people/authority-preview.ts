import type {AccessGrant} from '../finance/access';
import type {HrResponsibility} from '../hr/permissions';
import {authorityTemplate} from './authority.ts';

const keyOf=(grant:AccessGrant)=>grant.module+'|'+grant.tab;
export type InitialAuthorityChoices={access:Record<string,AccessGrant|null>;hr:Record<string,HrResponsibility|null>};
export const emptyInitialAuthorityChoices=():InitialAuthorityChoices=>({access:{},hr:{}});

/** Remember explicit checks and unchecks while the new-hire form remains open. */
export function rememberInitialAccessChoices(previous:AccessGrant[],next:AccessGrant[],choices:InitialAuthorityChoices):InitialAuthorityChoices {
 const before=new Map(previous.map(grant=>[keyOf(grant),grant])),after=new Map(next.map(grant=>[keyOf(grant),grant]));
 const access={...choices.access};
 for(const key of new Set([...before.keys(),...after.keys()]))if(before.get(key)?.level!==after.get(key)?.level)access[key]=after.get(key)?{...after.get(key)!}:null;
 return {...choices,access};
}
export function rememberInitialHrChoices(previous:HrResponsibility[],next:HrResponsibility[],choices:InitialAuthorityChoices):InitialAuthorityChoices {
 const before=new Map(previous.map(grant=>[grant.action,grant])),after=new Map(next.map(grant=>[grant.action,grant]));
 const hr={...choices.hr};
 for(const action of new Set([...before.keys(),...after.keys()]))if(before.get(action)?.scope!==after.get(action)?.scope)hr[action]=after.get(action)?{...after.get(action)!}:null;
 return {...choices,hr};
}

/** Preview only: the server validates all final choices and records their provenance. */
export function previewInitialAuthorityChange(previousLevel:string,nextLevel:string,currentAccess:AccessGrant[],currentHr:HrResponsibility[],choices:InitialAuthorityChoices) {
 const previous=authorityTemplate(previousLevel),next=authorityTemplate(nextLevel);
 const previousAccessKeys=new Set(previous.access.map(keyOf)),previousHrKeys=new Set(previous.hrResponsibilities.map(grant=>grant.action));
 const access=new Map([...currentAccess.filter(grant=>!previousAccessKeys.has(keyOf(grant))),...next.access].map(grant=>[keyOf(grant),{...grant}]));
 const hr=new Map([...currentHr.filter(grant=>!previousHrKeys.has(grant.action)),...next.hrResponsibilities].map(grant=>[grant.action,{...grant}]));
 for(const [key,grant]of Object.entries(choices.access)){if(grant)access.set(key,{...grant});else access.delete(key);}
 for(const [action,grant]of Object.entries(choices.hr)){if(grant)hr.set(grant.action,{...grant});else hr.delete(action as HrResponsibility['action']);}
 return {access:[...access.values()],hrResponsibilities:[...hr.values()]};
}
