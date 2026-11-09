import type {FinRecord,Viewer} from '../finance/model';
import type {Row} from '../accounts/model';
import type {HrRecord} from './model';
import {canAccess} from '../finance/access.ts';
import {hrCan} from './permissions.ts';

export type ImportedDriverClaimReference={id:string;driverId:string;reportedOn:string;status:string;claimReference?:string};
export type DriverClaimReference={id:string;key:string;source:'Property Claim'|'Employee Asset Claim'|'Imported Claim';reference:string;date:string;status:string;canOpen:boolean};
export function canViewDriverClaims(viewer:Viewer,personId:string,people:FinRecord[]):boolean{
 if(!viewer?.id||!viewer.person||viewer.id.startsWith('preview:')||viewer.onboardingOnly||!people.some(person=>person.kind==='person'&&person.id===personId)||!canAccess(viewer,'People & HR'))return false;
 if(viewer.owner)return true;
 if(viewer.person===personId)return canAccess(viewer,'Compliance, Claims & Recovery','damage');
 return ['viewPersonnel','managePersonnel','recordPerformance','issueCorrective','manageTwc'].some(action=>hrCan(viewer,action,personId,people));
}
const live=(record:Record<string,unknown>)=>!record.deletedAt&&!record.example&&!record.sample&&!record.isSample&&!record.trainingSample&&!record.isDemo;
const text=(value:unknown)=>typeof value==='string'?value.trim():'';

/** Never include claim narratives, photos, medical reports, correspondence or money in HR references. */
export function driverClaimReferences(personId:string,accounts:Row[],assets:HrRecord[],imports:ImportedDriverClaimReference[],canOpen=false):DriverClaimReference[]{
 const property=accounts.filter(row=>row.kind==='claim'&&row.driverId===personId&&live(row)).map(row=>({id:row.id,key:'claim:'+row.id,source:'Property Claim' as const,reference:text(row.insurerClaimNumber)||text(row.towbookReference)||row.id,date:text(row.date),status:text(row.status)||'Investigating',canOpen}));
 const equipment=assets.filter(row=>row.kind==='assetClaim'&&(row.data.driverId||row.personId)===personId&&live(row.data)).map(row=>({id:row.id,key:'asset-claim:'+row.id,source:'Employee Asset Claim' as const,reference:text(row.data.insurerClaimNumber)||row.id,date:text(row.data.reportedDate),status:text(row.data.status)||'Open',canOpen}));
 const intake=imports.filter(row=>row.driverId===personId).map(row=>({id:row.id,key:'intake:'+row.id,source:'Imported Claim' as const,reference:text(row.claimReference)||row.id,date:text(row.reportedOn),status:text(row.status)||'Outcome Unverified',canOpen}));
 return [...property,...equipment,...intake].sort((a,b)=>b.date.localeCompare(a.date)||a.reference.localeCompare(b.reference)||a.key.localeCompare(b.key));
}
