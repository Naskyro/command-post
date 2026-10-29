import {today,type Row} from './model';
export const dispatchCategories=['General note','Policy question','Resident / visitor complaint','Potential account concern','Reported stolen vehicle','Signage issue'];
export const isDispatchNote=(r:Row)=>r.kind==='activity'&&r.channel==='Dispatcher note';
export const isDispatchReply=(r:Row)=>r.kind==='activity'&&r.channel==='Dispatcher reply';
export function noteArchived(r:Row,now=Date.now()) {
 if(r.pinned||r.priority==='Urgent'&&!r.acknowledgedAt)return false;
 const at=Date.parse(String(r.noteCreatedAt||r.date+'T00:00:00Z'));
 return Number.isFinite(at)&&now-at>=7*86400000;
}
export function noteRecipients(account:Row,day=today()) {
 return [...new Set([String(account.assignee||''),account.backup&&account.backupUntil&&String(account.backupUntil)>=day?String(account.backup):''].filter(Boolean))];
}
