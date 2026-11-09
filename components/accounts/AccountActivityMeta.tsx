import {auditStamp,auditStampDetail} from '@/lib/shared/audit-format';
import './activity-meta.css';

export function AccountEventTime({value}:{value:unknown}){
 const display=auditStamp(value);if(!display)return null;
 return <time dateTime={String(value)} title={auditStampDetail(value)}>{display}</time>;
}
/** For business events with no recorded instant, retain the stored calendar date without inventing a time. */
export function AccountActivityMeta({when,by,whenLabel='When',byLabel='By',day,dayText,dayLabel='Date'}:{
 when?:unknown;by?:unknown;whenLabel?:string;byLabel?:string;day?:unknown;dayText?:string;dayLabel?:string;
}){
 const hasWhen=!!auditStamp(when),name=String(by||'').trim(),date=String(day||'').trim();
 if(!hasWhen&&!name&&!date)return null;
 return <span className="account-event-meta">
  {date&&<span><span className="account-meta-label">{dayLabel}:</span> <time dateTime={/^\d{4}-\d\d-\d\d$/.test(date)?date:undefined}>{dayText||date}</time></span>}
  {hasWhen&&<span><span className="account-meta-label">{whenLabel}:</span> <AccountEventTime value={when}/></span>}
  {name&&<span><span className="account-meta-label">{byLabel}:</span> {name}</span>}
 </span>;
}
