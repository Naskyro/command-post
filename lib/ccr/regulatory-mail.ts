import {AppError,ConflictError} from '../shared/errors.ts';
export const mailDirections=['Agency to PTE','PTE to Agency','Internal','Forwarded Agency Notice'] as const;
export type RegAttachment={name:string;bytes:number;sha256?:string;documentType?:string;disposition:string};
export type RegMail={messageId:string;threadId:string;sentAt:string;direction:typeof mailDirections[number];sender:string;recipient:string;subject:string;summary:string;body:string;attachments:RegAttachment[]};
const bad=()=>{throw new AppError('A reviewed message has an invalid source ID, date, direction, or attachment.');};
function obj(x:unknown){if(!x||typeof x!=='object'||Array.isArray(x))return bad();return x as Record<string,unknown>}
export function mailText(x:unknown,max:number,required=false){if(x==null&&!required)return '';if(typeof x!=='string')return bad();const s=x.trim();if(s.length>max||(required&&!s)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))return bad();return s;}
const mid=(x:unknown)=>typeof x==='string'&&/^[a-f\d]{10,40}$/i.test(x)?x.toLowerCase():bad();
export function checkMail(x:unknown):RegMail{
 const a=obj(x),dt=mailText(a.sentAt,55,true),dir=a.direction as RegMail['direction'];
 if(!/^\d{4}-\d{2}-\d{2}T/.test(dt)||!/(Z|[+-]\d\d:\d\d)$/.test(dt)||!Number.isFinite(Date.parse(dt))||!mailDirections.includes(dir)||!Array.isArray(a.attachments)||a.attachments.length>100)return bad();
 return {messageId:mid(a.messageId),threadId:mid(a.threadId),sentAt:new Date(dt).toISOString(),direction:dir,sender:mailText(a.sender,350,true),recipient:mailText(a.recipient,700),subject:mailText(a.subject,500,true),summary:mailText(a.summary,3500,true),body:mailText(a.body,20000),attachments:a.attachments.map(item=>{const f=obj(item),sha=mailText(f.sha256,64);if(!Number.isSafeInteger(f.bytes)||Number(f.bytes)<0||sha&&!/^[0-9a-f]{64}$/.test(sha))return bad();return {name:mailText(f.name,300,true),bytes:Number(f.bytes),...(sha?{sha256:sha}:{}),documentType:mailText(f.documentType,120),disposition:mailText(f.disposition,500,true)};})};
}
export function mergeMail(saved:RegMail[],incoming:RegMail[]){const map=new Map(saved.map(m=>[m.messageId,m]));for(const row of incoming){const old=map.get(row.messageId);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw new ConflictError('A different edition of this source message already exists. Review the record before changing it.');map.set(row.messageId,row);}return [...map.values()].sort((a,b)=>a.sentAt.localeCompare(b.sentAt)||a.messageId.localeCompare(b.messageId));}
