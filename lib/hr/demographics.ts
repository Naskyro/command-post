import type {FinRecord,Viewer} from '../finance/model';
import {hrCan} from './permissions.ts';

export const genderOptions=['Male','Female','Nonbinary','Self-Describe','Prefer Not to Say'] as const;
export function canViewDemographics(viewer:Viewer,personId:string,records:FinRecord[]){return viewer.owner||viewer.person===personId||['viewPersonnel','managePersonnel'].some(a=>hrCan(viewer,a,personId,records));}
