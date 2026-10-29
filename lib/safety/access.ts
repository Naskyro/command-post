import type {Viewer} from '@/lib/finance/model';
import {canAccess} from '@/lib/finance/access';
export const safetyAccess=(v:Viewer,edit=false)=>canAccess(v,'Accounts','safety',edit)||canAccess(v,'Account Management','safety',edit);
export const safetyReviewer=(v:Viewer)=>safetyAccess(v,true)&&(v.owner||v.department==='Account Managers'||v.role==='Department Head');
export const safetyKinds=['trespass','safetyEvent','safetyReview','safetyUpdate'];
