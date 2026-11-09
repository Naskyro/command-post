import {canAccessReviewRecord} from '../hr/review-document-access.ts';
import type {Viewer,FinRecord} from '../finance/model';
import type {HrRecord} from '../hr/model';
import {can,canReadRecord} from '../hr/workflow.ts';
import {canAccess} from '../finance/access.ts';
import {displayPersonName} from '../people/display-name.ts';
import {ccrModule} from './navigation.ts';
export type ReviewType='TWC Inquiry'|'Screening Review';
export type ReviewItem={id:string;type:ReviewType;employee:string;due:string;updated:string;closed:boolean};
export const canOpenPersonnelReview=(v:Viewer)=>Boolean(v.person&&!v.onboardingOnly&&!v.id.startsWith('preview:')&&canAccess(v,ccrModule,'people'));
export function reviewPermissions(v:Viewer,people:FinRecord[]){
 const eligible=canOpenPersonnelReview(v)&&canAccess(v,'People & HR'),employees=people.filter(p=>p.kind==='person');
 return {twc:eligible&&employees.some(p=>can(v,'manageTwc',p.id,people)),screening:eligible&&employees.some(p=>can(v,'reviewScreening',p.id,people))};
}
export function personnelReview(v:Viewer,people:FinRecord[],hr:HrRecord[]):ReviewItem[]{
 const access=reviewPermissions(v,people);if(!access.twc&&!access.screening)return [];
 const names=new Map(people.filter(r=>r.kind==='person').map(r=>[r.id,displayPersonName(r)]));
 return hr.flatMap((r):ReviewItem[]=>{
  if(!r.personId||r.data.deletedAt||!names.has(r.personId))return [];
  const t=r.kind==='task'&&r.data.category==='TWC'?'TWC Inquiry':r.kind==='screening'?'Screening Review':null;
  if(!t||!(t==='TWC Inquiry'?access.twc:access.screening)||!can(v,t==='TWC Inquiry'?'manageTwc':'reviewScreening',r.personId,people)||!canReadRecord(r,v,people,hr))return [];
  const date=r.data.dueDate||r.data.followUpDate;return [{id:r.id,type:t,employee:names.get(r.personId)!,due:typeof date==='string'&&/^\d{4}-\d\d-\d\d$/.test(date)?date:'',updated:r.updatedAt,closed:r.kind==='screening'&&r.data.status==='Verified'||['Completed','Complete','Cancelled','Closed','Cleared','Resolved','Retired'].includes(String(r.data.status))}];
 }).sort((a,b)=>Number(a.closed)-Number(b.closed)||(a.due||'9999').localeCompare(b.due||'9999')||b.updated.localeCompare(a.updated));
}

export type ReviewDocument={id:string;documentType:string;fileName:string;uploadedAt:string;uploadedBy:string;size:number};
export function reviewDocuments(parent:HrRecord,v:Viewer,staff:FinRecord[],hr:HrRecord[]):ReviewDocument[]{
 if(!canAccessReviewRecord(v,parent,staff))return [];
 return hr.filter(d=>d.kind==='document'&&!d.data.deletedAt&&d.personId===parent.personId&&d.data.parentId===parent.id&&canReadRecord(d,v,staff,hr)).map(d=>({
  id:d.id,documentType:String(d.data.otherDocumentType||d.data.documentType||d.data.category||'Supporting Document'),fileName:String(d.data.fileName||'Document'),
  uploadedAt:d.createdAt,uploadedBy:d.createdBy,size:Number(d.data.size)||0
 })).sort((a,b)=>b.uploadedAt.localeCompare(a.uploadedAt)||a.fileName.localeCompare(b.fileName));
}
