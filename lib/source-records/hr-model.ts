import {AppError} from '../shared/errors.ts';
const types=['TDLR Tow Operator - Incident Management','TDLR Vehicle Storage Facility Employee','TDLR License','Austin Tow Truck Operator License',"Driver's License"] as const;
export type CredentialType=typeof types[number];
export type SourceCredential={credentialType:CredentialType;credentialNumber?:string;agency?:string;issuedOn?:string;expiresOn?:string;sourceDriveId:string;page?:number;statusAsRecorded?:string;verification?:string;rosterCorroborated?:boolean;additionalSources?:{sourceDriveId:string;page?:number}[]};
export type SourcePerson={sourceFolderId:string;sourceName:string;sourceRosterStatus:'Active'|'Terminated';personId?:string;credentials:SourceCredential[]};
const fail=(note:string):never=>{throw new AppError(note)};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail('Choose a reviewed personnel record.');
const word=(s:unknown,max:number,needed=false)=>{if((s==null||s==='')&&!needed)return '';if(typeof s!=='string'||!s.trim()||s.trim().length>max||/[\x00-\x1f\x7f]/.test(s))fail('Check the verified personnel data.');return (s as string).trim();};
const key=(s:unknown)=>{const n=word(s,200,true);return /^[A-Za-z0-9_-]{5,200}$/.test(n)?n:fail('Invalid Drive source identifier.');};
const day=(s:unknown)=>{const x=word(s,10);if(!x)return undefined;const ms=Date.parse(x+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===x?x:fail('Use a verified calendar date or leave it blank.');};
export function sourcePerson(value:unknown):SourcePerson{
 const b=record(value),sourceFolderId=key(b.sourceFolderId),sourceName=word(b.sourceName,180,true),status=b.sourceRosterStatus,personId=word(b.personId,130)||undefined;
 if(status!=='Active'&&status!=='Terminated'||personId&&!/^[A-Za-z0-9:_-]+$/.test(personId)||!Array.isArray(b.credentials)||b.credentials.length>150)fail('Check the source roster status, person link and credentials.');
 const credentials=(b.credentials as unknown[]).map(item=>{
  const c=record(item),credentialType=word(c.credentialType,100,true).replace(/[–—]/g,'-').replace(/’/g,"'") as CredentialType;
  if(!types.includes(credentialType))fail('Only reviewed occupational licenses or driver-license dates may be indexed here.');
  const rawNumber=word(c.credentialNumber,45);
  if(credentialType==="Driver's License"&&rawNumber||rawNumber&&!/^[A-Za-z0-9 -]+$/.test(rawNumber)||/^\d{3}-\d{2}-\d{4}$/.test(rawNumber))fail('Do not enter private identity numbers in the operational license record.');
  const issuedOn=day(c.issuedOn),expiresOn=day(c.expiresOn);
  if(issuedOn&&expiresOn&&issuedOn>expiresOn)fail('The issue date cannot follow the expiration date.');
  if(c.page!=null&&(!Number.isSafeInteger(c.page)||Number(c.page)<1||Number(c.page)>10000))fail('Check the source page.');
  const additionalSources=c.additionalSources==null?[]:Array.isArray(c.additionalSources)&&c.additionalSources.length<=100?c.additionalSources.map(a=>{const r=record(a);if(r.page!=null&&(!Number.isSafeInteger(r.page)||Number(r.page)<1||Number(r.page)>10000))fail('Check the additional source page.');return {sourceDriveId:key(r.sourceDriveId),page:r.page==null?undefined:Number(r.page)};}):fail('Check the corroborating sources.');
  return {verification:word(c.verification,360)||undefined,rosterCorroborated:c.rosterCorroborated===true?true:undefined,additionalSources:additionalSources.length?additionalSources:undefined,credentialType,credentialNumber:rawNumber||undefined,agency:word(c.agency,160)||undefined,issuedOn,expiresOn,sourceDriveId:key(c.sourceDriveId),page:c.page==null?undefined:Number(c.page),statusAsRecorded:word(c.statusAsRecorded,240)||undefined};
 });
 const keys=credentials.map(c=>JSON.stringify([c.credentialType,c.sourceDriveId,c.page]));
 if(new Set(keys).size!==keys.length)fail('Check for two entries for the same license type and source page.');
 return {sourceFolderId,sourceName,sourceRosterStatus:status as SourcePerson['sourceRosterStatus'],personId,credentials:credentials.sort((a,b)=>(a.sourceDriveId+':'+a.credentialType+':'+String(a.page||'')).localeCompare(b.sourceDriveId+':'+b.credentialType+':'+String(b.page||'')))};
}
export const historicalTarget=(folder:string)=>'history-'+folder;
export const categoryOf=(t:CredentialType)=>t==='Austin Tow Truck Operator License'?'APD License':t==="Driver's License"?'Driver’s License':t==='TDLR Vehicle Storage Facility Employee'?'VSF License':'TDLR License';
