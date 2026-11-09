import {createHash} from 'node:crypto';
import {requireSourceAccess} from '@/lib/source-files/authorization';
import {AppError,ConflictError} from '@/lib/shared/errors';
import type {FinRecord,Viewer} from '@/lib/finance/model';
import {getRegister,insertReviewedRegisterEdition,reviewableTdlr} from './register-server';
import {prepareRegister,appendHistory,registerConfig,type StoredRegisterRecord} from './register-model';
import {verifiedTdlr,tdlrRegisterStatus} from './tdlr';
import {checkMail,mailText,mergeMail} from './regulatory-mail';
const agencyRef=(s:unknown)=>{const x=mailText(s,45,true).toUpperCase();if(!/^(TOW|VSF)\d{11}$/.test(x))throw new AppError('Use the verified TOW or VSF agency case number.');return x;};
export async function ingestRegulatoryMail(v:Viewer,staff:FinRecord[],raw:unknown,mode:string){
 await requireSourceAccess(v,'tdlr',true);if(!['preview','file','receipt'].includes(mode)||!raw||typeof raw!=='object')throw new AppError('Choose a reviewed complaint packet.');
 const packet=raw as {format?:string;cases?:Record<string,unknown>[]};if(packet.format!=='pte.tdlr-correspondence.v1'||!Array.isArray(packet.cases)||!packet.cases.length||packet.cases.length>40)throw new AppError('Choose a TDLR correspondence packet.');
 const register=await getRegister(v,'tdlr',staff),rows=[],seen=new Set<string>(),seenMsg=new Set<string>();
 for(const c of packet.cases){
  const reference=agencyRef(c.reference),pair=c.pairedReference?agencyRef(c.pairedReference):'',refs=[reference,pair].filter(Boolean);if(refs.some(r=>seen.has(r)))throw new AppError('The same complaint occurs twice.');refs.forEach(r=>seen.add(r));if(!Array.isArray(c.events)||!c.events.length||c.events.length>160)throw new AppError('Each complaint needs its reviewed source messages.');const events=c.events.map(checkMail);for(const e of events){if(seenMsg.has(e.messageId))throw new ConflictError('A message is assigned more than once in this packet.');seenMsg.add(e.messageId);}
  const matches=register.rows.filter(r=>refs.some(a=>a===r.reference.toUpperCase()||a===r.tdlr?.pairedReference?.toUpperCase()));if(matches.length>1)throw new ConflictError('These references match multiple existing complaints. Review the cases before merging.');
  const old=matches.length?await reviewableTdlr(v,staff,matches[0].id):undefined,recordId=old?.id||'mail_'+createHash('sha256').update('tdlr:'+reference).digest('hex').slice(0,42);
  const complete=mergeMail(old?.regulatoryMail||[],events),already=events.filter(e=>old?.regulatoryMail?.some(o=>o.messageId===e.messageId)).length;
  const t=verifiedTdlr(c.tdlr);if(!t||pair&&t.pairedReference&&pair!==t.pairedReference)throw new AppError('Check the verified investigation details and paired case.');if(pair)t.pairedReference=pair;
  if(mode==='file'&&already<events.length){const at=new Date().toISOString();let next:StoredRegisterRecord;
   if(old){next=appendHistory({...old,version:old.version+1,regulatoryMail:complete},v,at,['Verified Correspondence Added'],String(events.length-already)+' new source messages.');}
   else{const summary=mailText(c.summary,2250,true),steps=[registerConfig.tdlr.steps[0],...(c.deadlineOn?[registerConfig.tdlr.steps[1]]:[]),...(t.submittedOn?[registerConfig.tdlr.steps[3]]:[])];next=prepareRegister(v,'tdlr',{section:'tdlr',version:0,title:mailText(c.title,160,true),category:'Agency Complaint',status:tdlrRegisterStatus(t.stage),reference,dueOn:mailText(c.deadlineOn,10),nextAction:mailText(c.nextAction,900),note:summary,ownerId:'',steps,tdlr:t},undefined,[],true,at);next={...next,id:recordId,regulatoryMail:complete};}
   await insertReviewedRegisterEdition(next);
  }
  rows.push({reference,id:recordId,expected:events.length,saved:mode==='file'?events.length:already,existing:!!old});
 }
 return {rows};
}
