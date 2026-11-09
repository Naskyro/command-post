import type {Viewer} from '@/lib/finance/model';
import {AppError, ForbiddenError} from '@/lib/shared/errors';
import {canonCause} from './docket-import';
import {docketAccess, type Matter} from './docket-model';

export function assertDeskDocket(v:Viewer) {
 if (!v?.person || !v.id || v.id.startsWith('preview:') || !docketAccess(v)) throw new ForbiddenError();
}

// Only docket fields may leave this route. Privileged counsel materials have a separate
// store/permission check; this is not a shortcut to that shelf or to property history.
export function deskCaseView(m:Matter):Matter {
 const {id,version,title,number,type,status,filedOn,dueOn,dueFor,appearances,createdAt,createdBy,updatedAt,updatedBy,actorId,statements,files,lawEnforcement,courtName,courtId,assignedJudge,assignedJudgeId,courtContact,causeCategory,relatedCauses,relatedMatterIds,hearingFacts}=m;
 return {id,version,title,number,type,status,filedOn,dueOn,dueFor,appearances,createdAt,createdBy,updatedAt,updatedBy,actorId,statements,files,lawEnforcement,courtName,courtId,assignedJudge,assignedJudgeId,courtContact,causeCategory,relatedCauses,relatedMatterIds,hearingFacts,...(m.accountId?{accountId:'linked'}:{})};
}

export async function lookupDeskCase(v:Viewer,number:string,load:(v:Viewer)=>Promise<Matter[]>) {
 assertDeskDocket(v);
 const target=canonCause(number);
 if(number.length>100||target.length<3)throw new AppError('Enter the exact saved cause number.');
 const matches=(await load(v)).filter(m=>canonCause(m.number)===target);
 const rows=matches.map(({id,title,courtName,number,status})=>({id,title,courtName,number,status}));
 return {...(matches.length===1?{record:deskCaseView(matches[0])}:{}),rows};
}
