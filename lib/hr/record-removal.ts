import type {Viewer,FinRecord} from '../finance/model';
import type {HrRecord} from './model';
import {canAccess} from '../finance/access.ts';
import {ccrReviewCategory} from './review-document-access.ts';
import {hrCan} from './permissions.ts';
import {canReadVacancy,canReadCandidate} from './hiring.ts';
export const personnelAdmin=(v:Viewer)=>!v.onboardingOnly&&canAccess(v,'Admin','users',true);
export function canRemoveHr(v:Viewer,r:HrRecord,people:FinRecord[],hr:HrRecord[]){
 if(v.onboardingOnly||r.data.deletedAt||r.kind==='document'&&r.data.category===ccrReviewCategory)return false;
 if(['note','corrective'].includes(r.kind))return personnelAdmin(v);
 if(r.kind==='vacancy')return canReadVacancy(v,r,people,true);
 if(r.kind==='candidate')return !r.data.employeeId&&canReadCandidate(v,r,people,hr,true);
 if(r.kind==='task'&&hr.some(d=>d.kind==='document'&&d.data.category===ccrReviewCategory&&d.data.parentId===r.id&&!d.data.deletedAt))return false;
 if(r.kind==='task')return hrCan(v,'managePersonnel',r.personId,people);
 if(r.kind==='document')return !r.data.jobDescriptionId&&!hr.some(x=>x.data.signedCopyId===r.id)&&personnelAdmin(v)&&!['Signed','Wet Signature Verified'].includes(String(r.data.signatureStatus));
 if(r.kind==='position')return hrCan(v,'managePositions',undefined,people);
 return false;
}
