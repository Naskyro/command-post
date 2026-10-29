import {today, type Row} from '@/lib/accounts/model';
export const salesStages=['Prospect','Qualified','Meeting','Proposal','Contract review','Won','Lost'];
export const openStages=salesStages.slice(0,5);
export const closed=(r:Row)=>['Won','Lost'].includes(String(r.stage));
export const due=(r:Row,day=today())=>!closed(r)&&!!r.dueDate&&String(r.dueDate)<=day;
export function salesMetrics(rows:Row[],day=today()) {
 const leads=rows.filter(r=>r.kind==='opportunity'),open=leads.filter(r=>!closed(r)),won=leads.filter(r=>r.stage==='Won'),lost=leads.filter(r=>r.stage==='Lost');
 return {open:open.length,due:open.filter(r=>due(r,day)).length,won:won.length,winRate:won.length+lost.length?Math.round(won.length/(won.length+lost.length)*100):null,
   estimatedAnnual:open.reduce((s,r)=>s+Number(r.estimatedAnnualRevenue||0),0),valued:open.filter(r=>typeof r.estimatedAnnualRevenue==='number').length,
   unplanned:open.filter(r=>!r.nextAction||!r.dueDate).length};
}
