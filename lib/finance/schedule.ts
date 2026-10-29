import type {FinRecord} from './model';
const base={kind:'shiftTemplate',version:0,status:'Active',date:'2026-08-30',source:'Owner-provided current shifts · September 5, 2026'};
function pattern(person:string,department:string,role:string,days:number[],startTime:string,endTime:string,flexible=false):FinRecord[]{return days.map(day=>({...base,id:`pattern:${person||'open'}:${day}:${startTime}`,person,department,coverageRole:role,day,startTime,endTime,flexible,overnight:endTime<=startTime}));}
export const scheduleTemplates:FinRecord[]=[
 ...pattern('dalila','Dispatch','Dispatcher',[0,1,2],'20:00','08:00'),
 ...pattern('dalila','Dispatch','Dispatcher',[0],'16:00','20:00'),
 ...pattern('','Dispatch','Dispatcher',[6],'16:00','20:00'),
 ...pattern('','Dispatch','Dispatcher',[3],'20:00','08:00'),
 ...pattern('nessa','Dispatch','Dispatcher',[1,2,3,4,5],'08:00','16:00'),
 ...pattern('jeidy','Dispatch','Dispatcher',[1,2,4,5],'16:00','20:00'),
 ...['austin','jerson','braden'].flatMap(p=>pattern(p,'Operations','Operations',[1,2,3,4,5],'09:00','17:00',true)),
 ...['alex','jarif'].flatMap(p=>pattern(p,'Account Managers','Account Manager',[1,2,3,4,5],'09:00','17:00',true)),
 ...pattern('mingo','Drivers','Driver',[1,2,3,4,5],'09:00','17:00'),
 ...pattern('jendel','Drivers','Driver',[4,5,6],'20:00','06:00'),
 ...pattern('wesley','Drivers','Driver',[0,1,2,3],'20:00','06:00'),
];
export function expandSchedule(records:FinRecord[],through:string):FinRecord[]{
 const map=new Map(records.map(r=>[r.id,r]));
 for(const t of records.filter(r=>r.kind==='shiftTemplate'&&r.status==='Active')){
  const end=String(t.until||through)<through?String(t.until||through):through;
  const start=Date.parse(String(t.date)+'T12:00:00Z'),limit=Math.min(Date.parse(end+'T12:00:00Z'),start+3*366*86400000);
  for(let ms=start;ms<=limit;ms+=86400000){const d=new Date(ms);if(d.getUTCDay()!==Number(t.day))continue;
   const date=d.toISOString().slice(0,10),nextDay=new Date(ms+86400000).toISOString().slice(0,10),id='shift:'+t.id+':'+date;
   if(!map.has(id))map.set(id,{id,kind:'shift',version:0,person:t.person,department:t.department,coverageRole:t.coverageRole,start:date+'T'+t.startTime,end:(t.overnight?nextDay:date)+'T'+t.endTime,status:t.person?'Published':'Draft',flexible:t.flexible,template:t.id,source:t.source,updatedAt:t.updatedAt,updatedBy:t.updatedBy});
  }
 }
 for(const request of records.filter(r=>r.kind==='shiftRequest'&&r.status==='Approved')){
  const shift=map.get(String(request.shiftId));if(shift&&shift.status!=='Cancelled'&&String(shift.updatedAt||'')<=String(request.updatedAt||''))map.set(shift.id,{...shift,person:request.person,status:'Published',pickupRequest:request.id,updatedAt:request.updatedAt,updatedBy:request.updatedBy});
 }
 return [...map.values()];
}
