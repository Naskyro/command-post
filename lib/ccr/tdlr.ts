import {AppError} from '../shared/errors.ts';
export const complaintTopics=['License / Credential Details','Multiple Issues','Other','Release / Owner Documentation','Signage','Storage / Notification Fees','Tow Authorization / Parking Rules'];
export const agencyStages=['Opened / Awaiting Request','Preparing Response','Submitted / Awaiting Receipt','Agency Receipt Confirmed','Supplement Requested','Referred to Legal for Review','Agency Disposition Received'];
export const finalOutcomes=['Administrative Order','Closed Without Action','Dismissed','Other Agency Disposition','Settlement / Agreed Order','Written Warning'];
export const requestItems=['All Case File Documents','All Entrance / Exit Signage and Close-Ups','Call / Tow Authorization Records','Current Insurance Certificate','Impound Invoice / Signed Release','Non-Consent Tow Fee Schedule','Owner-Signed Documents','Permit Records','Pre-Tow Photographs','Property Service Agreement / Addenda','Reason for Tow','Storage / Mailing / Tracking Records','Tow Operator and VSF Employee License Information','Tow Ticket','Other Requested Records'];
export type TdlrCase={topic:string;pairedReference:string;tracking:string;investigator:string;contact:string;towCall:string;noticeOn:string;requested:string[];stage:string;submittedOn:string;submissionRef:string;acknowledgedOn:string;outcome:string;decisionOn:string;decisionRef:string};
export const blankTdlr=():TdlrCase=>({topic:'',pairedReference:'',tracking:'',investigator:'',contact:'',towCall:'',noticeOn:'',requested:[],stage:'Opened / Awaiting Request',submittedOn:'',submissionRef:'',acknowledgedOn:'',outcome:'',decisionOn:'',decisionRef:''});
function value(x:unknown,max:number){if(typeof x!=='string'||x.length>max||/[\x00-\x1f\x7f]/.test(x))throw new AppError('Enter a valid TDLR field.');return x.trim();}
const choice=(x:string,list:string[])=>{if(x&&!list.includes(x))throw new AppError('Select a listed TDLR option.');return x;};
function date(x:string){if(x&&(!/^\d{4}-\d{2}-\d{2}$/.test(x)||Number.isNaN(Date.parse(x+'T12:00:00Z'))||new Date(x+'T12:00:00Z').toISOString().slice(0,10)!==x))throw new AppError('Enter a valid agency date.');return x;}
export function verifiedTdlr(raw:unknown,previous?:TdlrCase):TdlrCase|undefined{
 if(raw===undefined)return previous?{...previous,requested:[...previous.requested]}:undefined;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AppError('Enter the complaint details.');
 const s=raw as Record<string,unknown>,out=blankTdlr();for(const [k,def] of Object.entries(out)){if(k==='requested')continue;const key=k as Exclude<keyof TdlrCase,'requested'>;out[key]=value(s[k]??def,key==='submissionRef'||key==='decisionRef'?300:160);}
 out.topic=choice(out.topic,complaintTopics);out.stage=choice(out.stage,agencyStages);out.outcome=choice(out.outcome,finalOutcomes);
 for(const k of ['noticeOn','submittedOn','acknowledgedOn','decisionOn'] as const)out[k]=date(out[k]);
 const req=s.requested??[];if(!Array.isArray(req)||req.length>requestItems.length||req.some(r=>typeof r!=='string'||!requestItems.includes(r)))throw new AppError('Select records requested by the investigator.');out.requested=requestItems.filter(i=>req.includes(i));
 if(out.acknowledgedOn&&out.submittedOn&&out.acknowledgedOn<out.submittedOn)throw new AppError('The receipt date cannot precede the submission.');
 if(out.noticeOn&&((out.decisionOn&&out.decisionOn<out.noticeOn)||(out.submittedOn&&out.submittedOn<out.noticeOn)))throw new AppError('The submission or decision cannot precede the notice.');
 if(['Submitted / Awaiting Receipt','Agency Receipt Confirmed'].includes(out.stage)&&!out.submittedOn)throw new AppError('Record the date PTE actually submitted its response.');
 if(out.stage==='Agency Receipt Confirmed'&&!out.acknowledgedOn)throw new AppError('Record the agency’s actual receipt date.');
 if(out.stage==='Agency Disposition Received'&&(!out.outcome||!out.decisionOn))throw new AppError('Record the agency decision and its date.');
 return out;
}
export function tdlrOutcomeProven(t:TdlrCase|undefined,files:{documentType?:string}[],caseRef:string){
 const proof=t?.decisionRef.trim().toLowerCase()||'';
 return !!(t?.outcome&&t.decisionOn&&(files.some(f=>f.documentType==='Agency Decision / Closure Letter')||proof.length>=4&&![caseRef.trim().toLowerCase(),t.pairedReference.trim().toLowerCase(),t.tracking.trim().toLowerCase(),'none','n/a','unknown','tbd','done','pending'].includes(proof)));
}

export const tdlrRegisterStatus=(stage:string)=>stage==='Opened / Awaiting Request'?'Open':stage==='Preparing Response'||stage==='Supplement Requested'?'Preparing Response':'Awaiting Agency';
