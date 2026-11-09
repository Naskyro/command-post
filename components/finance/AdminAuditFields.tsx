import {auditStamp,auditStampDetail} from '@/lib/shared/audit-format';

/** Names remain names, including initials from imports. Never infer an actor from the current session. */
export function AdminActor({name}:{name:unknown}){
 return <span className="admin-actor">{typeof name==='string'&&name.trim()&&!/^initial setup$/i.test(name.trim())?name.trim():'—'}</span>;
}
export function AdminStamp({value}:{value:unknown}){
 const stamp=auditStamp(value);if(!stamp)return <>—</>;
 const [day,...clock]=stamp.split(' '),machine=typeof value==='string'?value.trim().replace(' ','T'):new Date(value as number).toISOString();
 return <time className="admin-stamp" dateTime={machine} title={auditStampDetail(value)}><span>{day}</span>{clock.length>0&&<> <span>{clock.join(' ')}</span></>}</time>;
}
