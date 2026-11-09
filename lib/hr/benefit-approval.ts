import type {FinRecord,Viewer} from '../finance/model';
import {hrCan} from './permissions.ts';
export function canDecideBenefit(v:Viewer,personId:string,data:Record<string,unknown>,finance:FinRecord[]){
 const requester=finance.find(p=>p.id===data.requestedById);
 return data.status==='Pending Approval'&&data.reviewerId===v.person&&requester?.supervisor===v.person&&v.person!==data.requestedById&&v.person!==personId&&hrCan(v,'manageBenefits',personId,finance);
}
