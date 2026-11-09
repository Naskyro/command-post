import type {Viewer,FinRecord} from '../finance/model';
import type {HrRecord} from './model';
import {hrCan} from './permissions.ts';
import {canAccess} from '../finance/access.ts';
export const ccrReviewCategory='CCR Personnel Review Document';
export function reviewDocSection(r:HrRecord|undefined){
 if(!r||r.data.deletedAt||!r.personId)return null;
 if(r.kind==='task'&&r.data.category==='TWC')return 'twc';
 if(r.kind==='screening')return 'screening';
 return null;
}
export function canAccessReviewRecord(v:Viewer,r:HrRecord|undefined,staff:FinRecord[],edit=false){
 const key=reviewDocSection(r);
 return !!r&&!!key&&!!v.person&&!v.onboardingOnly&&!v.id.startsWith('preview:')&&canAccess(v,'Compliance, Claims & Recovery','people',edit)
  &&canAccess(v,'People & HR')&&staff.some(p=>p.kind==='person'&&p.id===r.personId)&&hrCan(v,key==='twc'?'manageTwc':'reviewScreening',r.personId,staff);
}
/** Gate even HR's generic file/list endpoints. A changed, moved or missing parent must not broaden readership. */
export function canReadReviewFile(file:HrRecord,v:Viewer,staff:FinRecord[],hr:HrRecord[]){
 const parent=hr.find(r=>r.id===file.data.parentId);
 return file.kind==='document'&&!file.data.deletedAt&&file.data.category===ccrReviewCategory&&!!parent&&parent.personId===file.personId
  &&reviewDocSection(parent)===file.data.ccrReviewSection&&canAccessReviewRecord(v,parent,staff);
}
