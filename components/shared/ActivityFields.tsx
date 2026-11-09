import {auditStamp,auditStampDetail} from '@/lib/shared/audit-format';
import './activity-fields.css';

/** Non-table activity metadata. Keep each recorded actor distinct from its timestamp. */
export default function ActivityFields({by,at,byLabel='By',whenLabel='When'}:{by?:unknown;at?:unknown;byLabel?:string;whenLabel?:string}){
 const name=typeof by==='string'?by.trim():'',when=auditStamp(at);
 if(!name&&!when)return null;
 return <span className="cp-activity-fields">{name&&<span className="cp-activity-line"><span className="cp-activity-label">{byLabel}:</span> <span>{name}</span></span>}{when&&<span className="cp-activity-line"><span className="cp-activity-label">{whenLabel}:</span> <time dateTime={typeof at==='string'?at:undefined} title={auditStampDetail(at)}>{when}</time></span>}</span>;
}
