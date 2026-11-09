import {intakeText,parseDamageManifest,type DamageManifest} from './damage-intake-model.ts';
import {realDay} from './docket-model.ts';
import {AppError,ConflictError} from '../shared/errors.ts';
export const directions=['Incoming Message','PTE Reply','Internal PTE Message','Agency or System'] as const;
export type HistoricalMessage={messageId:string;threadId:string;on:string;sentAt:string;subject:string;direction:typeof directions[number];senderLabel:string;body:string;omissions:string[]};
export type HistoricalGroup={threadId:string;record:DamageManifest;messages:HistoricalMessage[]};
const messageId=(v:unknown)=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{5,160}$/.test(v))throw new AppError('An original source identifier is missing.');return v;};
export function readHistoricalGroup(raw:unknown):HistoricalGroup{
 if(!raw||typeof raw!=='object')throw new AppError('Choose a reviewed correspondence packet.');const x=raw as Record<string,unknown>,threadId=messageId(x.threadId),record=parseDamageManifest(x.record);
 if(threadId!==record.threadId||!Array.isArray(x.messages)||!x.messages.length||x.messages.length>150)throw new AppError('Each reviewed claim needs 1–150 source messages.');
 const allowedThreads=new Set(record.references.map(r=>r.threadId)),checked=new Set<string>();
 const messages=x.messages.map((m:HistoricalMessage)=>{
  if(!m||!allowedThreads.has(messageId(m.threadId))||checked.has(messageId(m.messageId)))throw new AppError('A message is duplicated or refers to a thread outside this claim.');checked.add(m.messageId);
  if(!directions.includes(m.direction)||!realDay(m.on)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(m.sentAt)||!Number.isFinite(Date.parse(m.sentAt)))throw new AppError('A message needs a valid direction and source timestamp.');
  if(!Array.isArray(m.omissions)||m.omissions.length>6)throw new AppError('Flag any omitted portions of a source message.');
  const body=intakeText(m.body,16000),omissions=m.omissions.map(v=>intakeText(v,128,true)),subject=intakeText(m.subject,512)||'(No Subject)';
  const reviewed=record.references.find(r=>r.messageId===m.messageId);
  if(reviewed&&(reviewed.threadId!==m.threadId||reviewed.on!==m.on||reviewed.subject!==subject))throw new AppError('A message does not agree with its reviewed source reference.');
  if(!body&&!omissions.length)throw new AppError('Explain why the reviewed source has no message text.');
  return {messageId:m.messageId,threadId:m.threadId,on:m.on,sentAt:new Date(m.sentAt).toISOString(),subject,direction:m.direction,senderLabel:intakeText(m.senderLabel,140,true),body,omissions};
 });return {threadId,record,messages};
}
export function matchHistoricalMessages(record:DamageManifest,group:HistoricalGroup){
 if(record.threadId!==group.threadId)throw new ConflictError('This is not the same saved claim.');const threads=new Set(record.references.map(r=>r.threadId)),refs=new Map(record.references.map(r=>[r.messageId,r]));
 for(const m of group.messages){const known=refs.get(m.messageId);if(!threads.has(m.threadId)||known&&(known.threadId!==m.threadId||known.on!==m.on||known.subject!==m.subject))throw new ConflictError('A message does not agree with the saved source attribution. Review the original before filing.');}
}
// Follow-up messages may have been reviewed after the original claim manifest.
// Keep their exact provenance on the claim so an original from that message can
// be attached without weakening the source-message boundary on file uploads.
export function historicalManifest(group:HistoricalGroup,saved?:DamageManifest):DamageManifest{
 const references=new Map(group.record.references.map(r=>[r.messageId,r])),prior=new Map(saved?.references.map(r=>[r.messageId,r]));
 for(const m of group.messages){
  if(references.has(m.messageId))continue;
  const known=prior.get(m.messageId);
  references.set(m.messageId,known||{messageId:m.messageId,threadId:m.threadId,on:m.on,subject:m.subject,note:'Original message filed in Claim Correspondence.'});
 }
 return parseDamageManifest({...group.record,references:[...references.values()]});
}
