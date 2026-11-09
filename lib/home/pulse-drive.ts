import {canAccess} from '../finance/access.ts';
import type {FinRecord,Viewer} from '../finance/model';
import {access,type DriveNode} from '../drive/model.ts';
import {auditDayBoundary} from '../shared/audit-format.ts';
import type {PulseSignal} from './pulse-types';
const localDay=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);

/** Use the same inherited folder grants and deleted-ancestor checks as Drive downloads. */
export function recentDriveSignal(v:Viewer,nodes:DriveNode[],manager:boolean,now:Date):PulseSignal{
 const day=localDay(now),sunday=new Date(day+'T12:00:00Z');sunday.setUTCDate(sunday.getUTCDate()-sunday.getUTCDay());
 const after=Date.parse(auditDayBoundary(sunday.toISOString().slice(0,10))),until=now.getTime(), target={module:'Company Drive'};
 const files=nodes.filter(n=>n.kind==='file'&&Number.isFinite(Date.parse(n.updatedAt))&&Date.parse(n.updatedAt)>=after&&Date.parse(n.updatedAt)<=until&&access(nodes,n.id,v.person,manager)!=='None')
   .sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 return {id:'drive_recent_files',title:'Recently Changed Files',module:'Company Drive',description:'Files in your shared folders updated since Sunday.',count:files.length,unit:'files',tone:files.length?'info':'neutral',score:25,dateLabel:'This Week',target,
   items:files.slice(0,12).map(n=>({id:n.id,title:n.name,...(n.updatedBy?{detail:'Updated by '+n.updatedBy}:{}),at:n.updatedAt,target:{...target,section:n.id},calendar:false}))};
}

export async function driveSignals(v:Viewer,records:FinRecord[],now:Date):Promise<PulseSignal[]>{
 if(!canAccess(v,'Company Drive')||!records.some(p=>p.kind==='person'&&p.id===v.person&&p.status==='Active'))return [];
 const {contextForViewer}=await import('../drive/server');
 const context=await contextForViewer(v,records);
 return [recentDriveSignal(v,context.state.nodes,context.manager,now)];
}
