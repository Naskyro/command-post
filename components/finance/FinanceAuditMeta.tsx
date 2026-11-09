import {auditStamp,auditStampDetail} from '@/lib/shared/audit-format';

/** For recorded instants only. Payroll/work dates and schedule inputs are civil dates. */
export function FinanceTime({value}:{value:unknown}){
 const formatted=auditStamp(value);
 return formatted?<time title={auditStampDetail(value)} dateTime={String(value)} className="f-audit-time">{formatted}</time>:<>—</>;
}
export default function FinanceAuditMeta({at,by,timeLabel='Last Edited',userLabel='Edited By'}:{at:unknown;by:unknown;timeLabel?:string;userLabel?:string}){
 const instant=auditStamp(at),actor=typeof by==='string'?by.trim():'';
 if(!instant&&!actor)return null;
 return <span className="f-audit-meta">{instant&&<span><span className="f-audit-label">{timeLabel}: </span><time title={auditStampDetail(at)} dateTime={String(at)}>{instant}</time></span>}{actor&&<span><span className="f-audit-label">{userLabel}: </span>{actor}</span>}</span>;
}
