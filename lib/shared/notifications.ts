import {safetyAlerts} from '@/lib/safety/model';
import {vehicles} from '@/lib/accounts/history';
import type { FinRecord, Viewer } from '../finance/model';
import type { Row } from '../accounts/model';
import {isDispatchNote,noteRecipients} from '../accounts/dispatch-notes';
import { queue } from '../accounts/model';
import { actionDate, isWaiting } from '../accounts/work';
import { canRead } from '../accounts/policy';
import { localDate, managesPerson, hoursLabel } from '../finance/timeclock';
import { visibleOvertime } from '../finance/overtime';
import { canAccess } from '../finance/access';
import { money } from '../finance/model';

export type Notice = { id:string; title:string; detail:string; module:string; tab:string; person?:string; date?:string; tone?:string };
export function notifications(v:Viewer, staff:FinRecord[], accounts:Row[], now=Date.now()):Notice[] {
  const day=localDate(now), result:Notice[]=[];
  for(const r of visibleOvertime(v,staff,now).filter(r=>r.hours>0&&r.person!==v.person)) result.push({id:`ot:${r.person}:${r.start}`,title:`${r.name} · ${hoursLabel(r.hours)} overtime`,detail:`${r.cost===null?'Rate review needed':money(r.cost)+' estimated overtime wages'} · ${hoursLabel(r.approvedHours)} approved`,module:'Timeclock',tab:canAccess(v,'Timeclock','Requests')?'Requests':canAccess(v,'Timeclock','Timesheets')?'Timesheets':'Today',person:r.person,date:r.start,tone:'urgent'});
  if(canAccess(v,'Timeclock','Requests')) for(const r of staff.filter(r=>r.kind==='overtime'&&r.decision==='Pending'&&r.person!==v.person&&managesPerson(v,String(r.person),staff))) result.push({id:`request:${r.id}`,title:'Overtime request · '+String(staff.find(p=>p.id===r.person)?.name||'Employee'),detail:hoursLabel(Number(r.hours))+' requested · '+String(r.date),module:'Timeclock',tab:'Requests',person:String(r.person),date:String(r.date)});
  if(canAccess(v,'Account Management','work')) for(const r of queue(accounts).filter(r=>r.assignee===v.person&&canRead(v,r)&&actionDate(r)&&actionDate(r)<=day)) result.push({id:`task:${r.id}`,title:isWaiting(r)?'Check in with '+String(r.waitingOn||'contact'):r.name,detail:String(accounts.find(a=>a.id===r.accountId)?.name||'')+' · '+actionDate(r),module:'Account Management',tab:'work'});
  if(canAccess(v,'Work Orders','orders')) for(const r of accounts.filter(r=>r.kind==='workOrder'&&(r.assignee===v.person||!r.assignee&&r.status==='Requested')&&!['Completed','Cancelled'].includes(String(r.status)))) {
    const due=actionDate(r); if(r.status!=='Requested'&&(!due||due>day))continue;
    result.push({id:`order:${r.id}`,title:r.status==='Requested'?'Work order requested':'Work order follow-up',detail:r.name+' · '+String(accounts.find(a=>a.id===r.accountId)?.name||'Operations'),module:'Work Orders',tab:'orders'});
  }
  if(canAccess(v,'Account Management','activity')) for(const note of accounts.filter(r=>isDispatchNote(r)&&r.priority==='Urgent'&&!r.acknowledgedAt)) {
    const account=accounts.find(a=>a.kind==='account'&&a.id===note.accountId);
    if(account&&noteRecipients(account,day).includes(v.person))result.push({id:'dispatch:'+note.id,title:'Urgent dispatch handoff · '+account.name,detail:note.category+' · '+note.date,module:'Account Management',tab:'activity',tone:'urgent'});
  }
  for(const a of safetyAlerts(accounts,vehicles(accounts),day))result.unshift({id:'safety:'+a.id,title:'Staff safety · '+a.name,detail:[a.accountName,a.vehicle,a.reason].filter(Boolean).join(' · '),module:'Safety',tab:a.caseId,tone:'urgent'});
  return result;
}
