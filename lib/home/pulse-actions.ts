import type {Viewer,FinRecord} from '../finance/model';
import {visible} from '../finance/visibility';
import {canAccess} from '../finance/access';
import {managesPerson,localDate} from '../finance/timeclock';
import {displayPersonName} from '../people/display-name';
import type {PulseSignal,PulseItem} from './pulse-types';
const labels:Record<string,string>={leaveRequest:'Time Off',shiftRequest:'Shift Pickup',timeCorrection:'Time Correction',overtime:'Extra Hours',expenseReport:'Spending Report'};
export function approvalsSignal(v:Viewer,records:FinRecord[],now:Date):PulseSignal[]{
 const time=canAccess(v,'Timeclock','Requests',true),spend=canAccess(v,'Finance','Outflows',true);
 if((!time&&!spend)||(!v.owner&&!records.some(p=>p.kind==='person'&&p.id!==v.person&&p.status==='Active'&&managesPerson(v,p.id,records))))return [];
 const today=localDate(now.getTime()),sTarget={module:'Finance',tab:'Outflows',section:'To approve'},tTarget={module:'Timeclock',tab:'Requests'};
 const rows=visible(v,records).filter(r=>labels[r.kind]&&['Requested','Pending','In review'].includes(String(r.decision||r.status))&&r.person!==v.person&&managesPerson(v,String(r.person),records)&&(r.kind==='expenseReport'?spend:time));
 const items:PulseItem[]=rows.map(r=>({id:r.id,title:labels[r.kind],detail:displayPersonName(records.find(p=>p.kind==='person'&&p.id===r.person))||'Employee',...(typeof r.due==='string'&&/^\d{4}-\d\d-\d\d$/.test(r.due)?{due:r.due,calendar:true}:{}),target:r.kind==='expenseReport'?sTarget:tTarget})).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.title.localeCompare(b.title));
 const late=items.some(i=>i.due&&i.due<today);
 return [{id:'my_approvals',title:'Needs My Approval',module:'My Team',description:'Pending team requests you can review in Timeclock or Finance.',count:items.length,unit:'requests',target:items[0]?.target||(time?tTarget:sTarget),items:items.slice(0,50),tone:items.length?'warning':'neutral',score:late?87:68}];
}
